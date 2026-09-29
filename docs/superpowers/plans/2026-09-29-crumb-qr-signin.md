# Crumb 扫码登录与「添加到主屏幕」 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员生成的每个一次性链接都附带一个二维码（当面扫或当图片发送），成员登录后被提示把 Crumb 放到手机桌面。

**Architecture:** 服务器在生成链接时用 `uqr` 算出二维码格子、用已有的 `sharp` 画成 PNG，作为 data URL 随接口返回；页面只把它放进 `<img>`，保存或分享时在本地把 base64 解码成文件。桌面图标靠静态的 `manifest.webmanifest`（`display: browser`，与浏览器共用登录）和由脚本生成、提交进仓库的 PNG 图标。

**Tech Stack:** Node.js 24、Express 5、sharp 0.35.5（已有）、uqr 0.1.3（新，运行时）、jsqr 1.4.0（新，只在测试中用）；原生 ES 模块界面；node:test 与 Playwright。

**Spec:** [已确认设计](../specs/2026-09-29-crumb-qr-signin-design.md)。

**Status:** 已在分支 `feature/self-hosted` 实施（2026-09-29），每条新规则都先写失败的测试。第七轮审查（Claude 代理，`367cb9c`）之后又修订了几处：「保存二维码」总是显示、能分享时再加「分享二维码」；微信里登录链接留在地址栏直到用掉或离开；只在 iPhone 桌面 App 里显示那段说明（见 `docs/VALIDATION.md`）。全新克隆在 `ad4273d` 上的结果与审查记录都在 `docs/VALIDATION.md`。已推送到草稿 PR，尚未合并。

## 文件

- 新建 `server/qr.mjs`：`qrPng(text)` → PNG data URL 或 `null`。
- 改 `server/routes/members.mjs`：四个生成链接的接口多返回 `qr`。
- 改 `tests/helpers.mjs`：`readQr(image)`，把 PNG 扫回文字（sharp + jsqr）。
- 新建 `tests/qr.test.mjs`；改 `tests/members.test.mjs`。
- 改 `app/dom.js`：`openedAsHomeScreenApp()`。
- 改 `app/views/admin.js`：`linkPanel` 显示二维码与「保存/分享二维码」。
- 改 `app/views/auth.js`：链接页的微信提示；登录页的独立网页 App 说明。
- 改 `app/views/member.js`：添加到主屏幕卡片。
- 改 `app/app.css`、`app/locales/en.js`、`app/locales/zh-CN.js`、`app/index.html`。
- 新建 `app/manifest.webmanifest`、`scripts/make-icons.mjs`、`app/icons/icon-{180,192,512}.png`、`tests/home-screen.test.mjs`。
- 改 `tests/e2e/product.spec.mjs`、`scripts/screenshots.mjs`、README（中英）、`docs/DEPLOYMENT.md`、`docs/VALIDATION.md`、`docs/RELEASE-CHECKLIST.md`。

注意：英文文案里不要用撇号（`'`），语言文件是单引号字符串；也不要在任何文件里写 `\u` 转义（工具会把它变成真字符，`tests/source.test.mjs` 会拦）。

---

### Task 1: 依赖与服务器端二维码

**Files:**
- Create: `server/qr.mjs`, `tests/qr.test.mjs`
- Modify: `package.json`, `package-lock.json`, `tests/helpers.mjs`

- [x] **Step 1: 安装两个依赖（精确版本）**

```bash
npm install --save-exact uqr@0.1.3
npm install --save-exact --save-dev jsqr@1.4.0
```

检查 `package.json`：`dependencies` 里有 `"uqr": "0.1.3"`，`devDependencies` 里有 `"jsqr": "1.4.0"`。

- [x] **Step 2: 在 `tests/helpers.mjs` 加 `readQr`**

在文件顶部 import 区加：

```js
import sharp from 'sharp';
import jsqr from 'jsqr';
```

在文件末尾加：

```js
const decodeQr = jsqr.default ?? jsqr;

/* Reads a QR code picture back the way a phone camera would: pixels in, text out. */
export async function readQr(image) {
  const png = Buffer.isBuffer(image) ? image : Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return decodeQr(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height)?.data ?? null;
}
```

- [x] **Step 3: 写失败的测试 `tests/qr.test.mjs`**

```js
/* QR codes for links: they must read back as exactly the link, or not be made at all. */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { qrPng } from '../server/qr.mjs';
import { readQr } from './helpers.mjs';

const TOKEN = 'Zq4_Ve-1xLmN0pQrStUvWxYz0123456789abcdEFGHI';

test('a QR code reads back as exactly the link it was made from', async () => {
  const link = `https://crumb.example.com/#signin=${TOKEN}`;
  const qr = await qrPng(link);
  assert.match(qr, /^data:image[/]png;base64,/);
  assert.equal(await readQr(qr), link);
  const { width, height } = await sharp(Buffer.from(qr.slice(qr.indexOf(',') + 1), 'base64')).metadata();
  assert.equal(width, height);
  assert.ok(width >= 240, 'big enough to show at 240 pixels without blurring');
});

test('a long address still fits and reads back exactly', async () => {
  const link = `https://recognition.a-rather-long-organisation-name.example.org:8443/#invite=${TOKEN}`;
  assert.equal(await readQr(await qrPng(link)), link);
});

test('text too long for any QR code gives no picture instead of an error', async () => {
  assert.equal(await qrPng('x'.repeat(3000)), null);
});
```

- [x] **Step 4: 运行，确认失败**

Run: `node --test tests/qr.test.mjs`
Expected: FAIL，报 `Cannot find module` … `server/qr.mjs`。

- [x] **Step 5: 写 `server/qr.mjs`**

```js
/* A QR code for a link, as a PNG data URL: scanned from the admin's screen, or sent as a
 * picture, which a phone opens with a long press. It is made here, on the organization's
 * own server, so the link never goes to an outside service. */
import sharp from 'sharp';
import { encode } from 'uqr';

const QUIET = 4; // white modules around the code, as the standard asks
const SCALE = 8; // pixels per module

export async function qrPng(text) {
  try {
    const { data } = encode(text, { ecc: 'M', border: 0 });
    const side = (data.length + QUIET * 2) * SCALE;
    const pixels = Buffer.alloc(side * side, 255);
    data.forEach((row, y) => row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < SCALE; dy += 1) {
        const start = ((y + QUIET) * SCALE + dy) * side + (x + QUIET) * SCALE;
        pixels.fill(0, start, start + SCALE);
      }
    }));
    const png = await sharp(pixels, { raw: { width: side, height: side, channels: 1 } }).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    // Too long for a QR code (it never is for a link): the link alone still works.
    return null;
  }
}
```

- [x] **Step 6: 运行，确认通过**

Run: `node --test tests/qr.test.mjs`
Expected: 3 pass。若第一条失败且 `readQr` 返回 `null`，打印 `encode('x', { ecc: 'M', border: 0 }).data.length`，确认 `data` 是正方形布尔数组、不含白边。

- [x] **Step 7: 提交**

```bash
git add package.json package-lock.json server/qr.mjs tests/qr.test.mjs tests/helpers.mjs
git commit -m "feat: make QR codes for links on the server"
```

### Task 2: 生成链接的接口返回二维码

**Files:**
- Modify: `server/routes/members.mjs`, `tests/members.test.mjs`

- [x] **Step 1: 写失败的测试（加到 `tests/members.test.mjs` 末尾）**

在文件顶部从 `./helpers.mjs` 的 import 里加上 `readQr`，然后：

```js
test('every link an admin makes comes with a QR code that reads back as that link', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const member = await owner.request('POST', '/api/admin/invitations', { username: 'mina.p', displayName: 'Mina', role: 'member' });
  assert.equal(await readQr(member.body.qr), member.body.signinUrl);
  const again = await owner.request('POST', `/api/admin/members/${member.body.user.id}/signin-link`);
  assert.equal(await readQr(again.body.qr), again.body.signinUrl);
  const admin = await owner.request('POST', '/api/admin/invitations', { username: 'ada.a', displayName: 'Ada', role: 'admin' });
  assert.equal(await readQr(admin.body.qr), admin.body.invitationUrl);
  const renewed = await owner.request('POST', `/api/admin/members/${admin.body.user.id}/invitation`);
  assert.equal(await readQr(renewed.body.qr), renewed.body.invitationUrl);
  const { user: joined } = await joinTeam(server, owner, { username: 'amy.a', role: 'admin' });
  const reset = await owner.request('POST', `/api/admin/members/${joined.id}/reset`);
  assert.equal(await readQr(reset.body.qr), reset.body.resetUrl);
});
```

- [x] **Step 2: 运行，确认失败**

Run: `node --test --test-name-pattern="QR code that reads back" tests/members.test.mjs`
Expected: FAIL（`qr` 为 `undefined`）。

- [x] **Step 3: 改 `server/routes/members.mjs`**

顶部加 `import { qrPng } from '../qr.mjs';`，四个接口改成：

```js
  router.post('/admin/invitations', async (req, res) => {
    const { user, token, purpose } = inviteMember(db, req.actor, req.body, clock);
    // A team member gets a sign-in link; an owner or admin an invitation to set a password.
    const url = link(purpose === 'signin' ? 'signin' : 'invite', token);
    const qr = await qrPng(url);
    res.status(201).json(purpose === 'signin' ? { user, signinUrl: url, qr } : { user, invitationUrl: url, qr });
  });

  router.post('/admin/members/:id/signin-link', async (req, res) => {
    requireRole(req.actor, MANAGERS);
    noBody(req);
    const { token, user } = issueSignInLink(db, req.actor, req.params.id, clock);
    const url = link('signin', token);
    res.json({ user, signinUrl: url, qr: await qrPng(url) });
  });

  router.post('/admin/members/:id/invitation', async (req, res) => {
    requireRole(req.actor, MANAGERS);
    noBody(req);
    const { token } = renewInvitation(db, req.actor, req.params.id, clock);
    const url = link('invite', token);
    res.json({ invitationUrl: url, qr: await qrPng(url) });
  });

  router.post('/admin/members/:id/reset', async (req, res) => {
    requireRole(req.actor, MANAGERS);
    noBody(req);
    const { token } = issueReset(db, req.actor, req.params.id, clock);
    const url = link('reset', token);
    res.json({ resetUrl: url, qr: await qrPng(url) });
  });
```

- [x] **Step 4: 运行，确认通过，且其余不受影响**

Run: `npm test`
Expected: 全部通过（Windows 上 2 个跳过）。

- [x] **Step 5: 提交**

```bash
git add server/routes/members.mjs tests/members.test.mjs
git commit -m "feat: every link an admin makes comes with its QR code"
```

### Task 3: 管理员面板显示二维码，可保存或分享

**Files:**
- Modify: `app/views/admin.js`, `app/app.css`, `app/locales/en.js`, `app/locales/zh-CN.js`, `tests/e2e/product.spec.mjs`

- [x] **Step 1: 写失败的浏览器测试（加到 `tests/e2e/product.spec.mjs` 末尾）**

顶部 import 改为：`import { readFileSync } from 'node:fs';` 和 `import { client, readQr, tokenFrom } from '../helpers.mjs';`。

```js
/* ---------------------------------------------------------------- QR codes */

test('the link panel shows the link as a QR code, which saves as a picture of the same link', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage } = fx;
    // A computer: no system share sheet, so the picture is saved.
    await ownerPage.context().addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
    await ownerPage.reload();
    await ownerPage.getByRole('link', { name: 'Members', exact: true }).click();
    await ownerPage.getByLabel('Name', { exact: true }).fill('Sam Okafor');
    await ownerPage.getByLabel('Username').fill('sam');
    await ownerPage.getByRole('button', { name: 'Create invitation', exact: true }).click();
    const link = await ownerPage.getByLabel('Sign-in link', { exact: true }).inputValue();
    const image = ownerPage.getByRole('img', { name: 'QR code of the link for Sam Okafor' });
    expect(await readQr(await image.getAttribute('src'))).toBe(link);
    await expect(ownerPage.locator('.link-panel')).toContainText('long press');
    const [download] = await Promise.all([
      ownerPage.waitForEvent('download'),
      ownerPage.getByRole('button', { name: 'Save QR code', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('crumb-sam.png');
    expect(await readQr(readFileSync(await download.path()))).toBe(link);
  } finally {
    await fx.close();
  }
});

test('on a phone the QR code goes straight to the share sheet, as the same picture', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage } = fx;
    await ownerPage.context().addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async ({ files }) => {
          window.shared = await Promise.all(files.map(async file => ({
            name: file.name, type: file.type, bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
          })));
        },
      });
    });
    await ownerPage.goto(`${fx.origin}/#/team/members`);
    await ownerPage.reload();
    await ownerPage.getByRole('button', { name: 'New sign-in link for Mina Park', exact: true }).click();
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Make a new link', exact: true }).click();
    const link = await ownerPage.getByLabel('Sign-in link', { exact: true }).inputValue();
    await ownerPage.getByRole('button', { name: 'Share QR code', exact: true }).click();
    const shared = await ownerPage.evaluate(() => window.shared);
    expect(shared.map(file => [file.name, file.type])).toEqual([['crumb-mina.png', 'image/png']]);
    expect(await readQr(Buffer.from(shared[0].bytes))).toBe(link);
  } finally {
    await fx.close();
  }
});
```

- [x] **Step 2: 运行，确认失败**

Run: `npx playwright test tests/e2e/product.spec.mjs -g "QR code"`
Expected: 2 failed（找不到二维码图片）。

- [x] **Step 3: 改 `app/views/admin.js`**

把现有 `linkPanel` 整个替换成下面三个函数加一个常量，放在原位置：

```js
/* A QR code the server made for a link: only ever a PNG data URL. */
const QR_SHAPE = /^data:image[/]png;base64,[A-Za-z0-9+/]+=*$/;

/* The picture as a file, decoded here: fetching a data: URL would need a wider connect-src. */
function pngFile(dataUrl, name) {
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), char => char.charCodeAt(0));
  return new File([bytes], name, { type: 'image/png' });
}

/* The link as a QR code: scanned from this screen in person, or sent as a picture, which a
 * phone opens with a long press. A phone hands it straight to a chat app; a computer saves it. */
function qrBlock(qr, name, fileName) {
  const file = pngFile(qr, fileName);
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  const send = button(t(canShare ? 'members.qrShare' : 'members.qrSave'), {
    on: {
      click: async () => {
        if (!canShare) {
          const save = el('a', { attrs: { href: qr, download: fileName, hidden: true } });
          document.body.append(save);
          save.click();
          save.remove();
          return;
        }
        try {
          await navigator.share({ files: [file] });
        } catch {
          // Closing the share sheet without choosing an app is not an error.
        }
      },
    },
  });
  return el('figure', { attrs: { class: 'qr' } }, [
    el('img', { attrs: { src: qr, alt: t('members.qrAlt', { name }), class: 'qr-image', width: 240, height: 240 } }),
    el('figcaption', { text: t('members.qrCaption', { name }), attrs: { class: 'small' } }),
    send,
  ]);
}

/* One-time links are shown once, with a copy button, and can be dismissed. */
function linkPanel(label, url, note, { qr = null, name = '', fileName = 'crumb.png' } = {}) {
  const link = field({ label, name: 'link', value: url, attrs: { readonly: true, class: 'link-input' } });
  const panel = el('div', { attrs: { class: 'link-panel' } }, [
    typeof qr === 'string' && QR_SHAPE.test(qr) ? qrBlock(qr, name, fileName) : null,
    link.wrapper,
    el('p', { text: note, attrs: { class: 'muted small' } }),
    el('div', { attrs: { class: 'row-actions' } }, [
      button(t('common.copy'), {
        on: {
          click: async () => {
            try {
              await copyText(url);
              toast(t('common.copied'));
            } catch {
              link.control.select();
              toast(t('common.copyManually'));
            }
          },
        },
      }),
      button(t('common.done'), { kind: 'quiet', on: { click: () => panel.remove() } }),
    ]),
  ]);
  return panel;
}

/* What the panel needs to show a link's QR code for a person. */
const qrFor = (result, person) => ({ qr: result.qr, name: person.displayName, fileName: `crumb-${person.username}.png` });
```

然后四处调用都传第四个参数：
- 「新的登录链接」对话框的 `done`：`linkPanel(t('members.signinLink'), result.signinUrl, t(result.user.status === 'active' ? 'members.signinRenewNote' : 'members.signinNote', { name: person.displayName }), qrFor(result, person))`
- 「新的邀请链接」：`linkPanel(t('members.inviteLink'), result.invitationUrl, t('members.inviteNote', { name: person.displayName }), qrFor(result, person))`
- 「密码重置链接」：`linkPanel(t('members.resetLinkLabel'), result.resetUrl, t('members.resetNote', { name: person.displayName }), qrFor(result, person))`
- 邀请表单提交后：两个 `linkPanel(...)` 调用末尾都加 `qrFor(result, result.user)`。

- [x] **Step 4: 文案（两种语言同步加在 `members.signinLink` 之后）**

`app/locales/en.js`：

```js
  'members.qrAlt': 'QR code of the link for {name}',
  'members.qrCaption': 'In person, {name} scans this with the camera on their phone. Not here? Send them the picture: a long press on it opens the link on their phone.',
  'members.qrSave': 'Save QR code',
  'members.qrShare': 'Share QR code',
```

`app/locales/zh-CN.js`：

```js
  'members.qrAlt': '{name} 的链接二维码',
  'members.qrCaption': '当面：请 {name} 用手机相机扫这个码。不在场：把这张图发给对方，对方在手机上长按图片就能打开。',
  'members.qrSave': '保存二维码',
  'members.qrShare': '分享二维码',
```

- [x] **Step 5: 样式（加在 `app/app.css` 的 `.link-input` 之后）**

```css
.qr { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; }
.qr-image { width: 240px; max-width: 100%; height: auto; image-rendering: pixelated; background: #fff; border-radius: 8px; }
```

- [x] **Step 6: 运行，确认通过**

Run: `npx playwright test tests/e2e/product.spec.mjs -g "QR code"` → 2 passed；
再跑 `npx playwright test` 和 `npm test`，全部通过。

- [x] **Step 7: 提交**

```bash
git add app/views/admin.js app/app.css app/locales/en.js app/locales/zh-CN.js tests/e2e/product.spec.mjs
git commit -m "feat: show each link as a QR code to scan, save or share"
```

### Task 4: 链接页的微信提示

**Files:**
- Modify: `app/views/auth.js`, `app/locales/en.js`, `app/locales/zh-CN.js`, `tests/e2e/product.spec.mjs`

- [x] **Step 1: 写失败的浏览器测试**

```js
test('opened inside WeChat, the link page says to open it in the browser first, without blocking', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const invite = await fx.api.request('POST', '/api/admin/invitations', { username: 'sam', displayName: 'Sam Lee', role: 'member' });
    const wechat = await browser.newContext({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50 NetType/WIFI Language/zh_CN',
    });
    const phone = await wechat.newPage();
    await phone.goto(invite.body.signinUrl);
    await expect(phone.getByText(/inside WeChat/)).toContainText('Open in Browser');
    await expect(phone.getByRole('button', { name: 'Sign in on this device', exact: true })).toBeEnabled();
    await wechat.close();

    const plain = await (await browser.newContext()).newPage();
    await plain.goto(invite.body.signinUrl);
    await expect(plain.getByRole('button', { name: 'Sign in on this device', exact: true })).toBeVisible();
    await expect(plain.getByText(/inside WeChat/)).toHaveCount(0);
    await plain.context().close();
  } finally {
    await fx.close();
  }
});
```

- [x] **Step 2: 运行，确认失败**

Run: `npx playwright test tests/e2e/product.spec.mjs -g "inside WeChat"`
Expected: FAIL（找不到提示）。

- [x] **Step 3: 改 `app/views/auth.js`**

在 `const USERNAME = …` 之前加：

```js
/* WeChat opens links and scanned codes in its own browser: a sign-in there stays there. */
const inWeChat = () => /MicroMessenger/i.test(navigator.userAgent);
```

在 `signInWithLink` 最后的 `paint([...])` 里，`before ? … : null,` 之后、`form,` 之前加：

```js
    inWeChat() ? el('p', { text: t('signin.wechat'), attrs: { class: 'notice' } }) : null,
```

- [x] **Step 4: 文案（加在 `signin.noAnswer` 之后）**

en: `'signin.wechat': 'You opened this inside WeChat. Tap ··· at the top right, choose Open in Browser, and sign in there, so Crumb can go on your home screen.',`
zh: `'signin.wechat': '你是在微信里打开的。请点右上角「···」，选择「在浏览器打开」，在浏览器里登录，这样才能把 Crumb 放到桌面。',`

- [x] **Step 5: 运行，确认通过；提交**

Run: `npx playwright test tests/e2e/product.spec.mjs -g "inside WeChat"` → 1 passed。

```bash
git add app/views/auth.js app/locales/en.js app/locales/zh-CN.js tests/e2e/product.spec.mjs
git commit -m "feat: tell people who open a sign-in link in WeChat to open it in the browser"
```

### Task 5: 成员页的「添加到主屏幕」卡片

**Files:**
- Modify: `app/dom.js`, `app/views/member.js`, `app/app.css`, `app/locales/en.js`, `app/locales/zh-CN.js`, `tests/e2e/product.spec.mjs`

- [x] **Step 1: 写失败的浏览器测试**

```js
test('a team member is offered the home screen until they dismiss it; an owner never is', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { memberPage, ownerPage } = fx;
    const tip = page => page.getByRole('region', { name: 'Put Crumb on your home screen' });
    await expect(tip(memberPage)).toContainText('Add to Home Screen');
    await expect(tip(memberPage)).toContainText('Open as Web App');
    await tip(memberPage).getByRole('button', { name: 'Got it', exact: true }).click();
    await expect(tip(memberPage)).toHaveCount(0);
    await memberPage.reload();
    await expect(memberPage.getByTestId('available-balance')).toBeVisible();
    await expect(tip(memberPage)).toHaveCount(0);

    await ownerPage.goto(`${fx.origin}/#/me`);
    await expect(ownerPage.getByTestId('available-balance')).toBeVisible();
    await expect(tip(ownerPage)).toHaveCount(0);
  } finally {
    await fx.close();
  }
});

test('opened from the home screen, Crumb does not suggest adding it again', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    await fx.memberPage.context().addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
    await fx.memberPage.reload();
    await expect(fx.memberPage.getByTestId('available-balance')).toBeVisible();
    await expect(fx.memberPage.getByRole('region', { name: 'Put Crumb on your home screen' })).toHaveCount(0);
  } finally {
    await fx.close();
  }
});
```

- [x] **Step 2: 运行，确认失败**

Run: `npx playwright test tests/e2e/product.spec.mjs -g "home screen"`
Expected: 第一条 FAIL（没有卡片）；第二条此时可能已通过（卡片还不存在），实现后要用改坏代码的办法再确认它能抓住问题。

- [x] **Step 3: `app/dom.js` 末尾加**

```js
/* True when Crumb was opened from a home-screen icon as a separate web app. On some phones
 * that app keeps its own storage, so it has none of the browser's sign-in. */
export const openedAsHomeScreenApp = () =>
  window.navigator.standalone === true || Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
```

- [x] **Step 4: `app/views/member.js`**

把 `openedAsHomeScreenApp` 加进从 `../dom.js` 的 import（`button`、`el`、`uid` 已在或一并加上）。在 `renderMember` 之前加：

```js
const HOME_TIP = 'crumb.homeTip';

/* A team member comes in through a one-time link or code, so an icon on the home screen is
 * how they come back. Shown until dismissed on this device, and never inside that icon. */
function homeTip(ctx) {
  let dismissed = false;
  try {
    dismissed = window.localStorage.getItem(HOME_TIP) === 'dismissed';
  } catch {
    // Storage is blocked: show it; dismissing still hides it for this visit.
  }
  if (ctx.user.role !== 'member' || dismissed || openedAsHomeScreenApp()) return null;
  const titleId = uid('home-tip');
  const tip = el('section', { attrs: { class: 'home-tip', 'aria-labelledby': titleId } }, [
    el('h2', { text: t('home.title'), attrs: { id: titleId, class: 'card-title' } }),
    el('p', { text: t('home.why') }),
    el('p', { text: t('home.iphone'), attrs: { class: 'small' } }),
    el('p', { text: t('home.android'), attrs: { class: 'small' } }),
    button(t('home.done'), {
      kind: 'quiet',
      on: {
        click: () => {
          try {
            window.localStorage.setItem(HOME_TIP, 'dismissed');
          } catch {
            // Not remembered on this device; it is gone for this visit.
          }
          tip.remove();
        },
      },
    }),
  ]);
  return tip;
}
```

在 `renderMember` 的 `main.replaceChildren(...[` 里，`me.org.welcome ? … : null,` 之后加一行 `homeTip(ctx),`。

- [x] **Step 5: 文案**

en：

```js
  'home.title': 'Put Crumb on your home screen',
  'home.why': 'Then a tap on the icon opens it, still signed in, with no code to scan.',
  'home.iphone': 'iPhone: in Safari, tap Share, then Add to Home Screen. If you see Open as Web App, turn it off.',
  'home.android': 'Android: in Chrome, tap ⋮ at the top right, then Add to Home screen.',
  'home.done': 'Got it',
```

zh：

```js
  'home.title': '把 Crumb 放到手机桌面',
  'home.why': '以后点图标就能打开，还是登录状态，不用再扫码。',
  'home.iphone': 'iPhone：在 Safari 点「分享」→「添加到主屏幕」。如果看到「作为网页 App 打开」，把它关掉。',
  'home.android': '安卓：在 Chrome 点右上角「⋮」→「添加到主屏幕」。',
  'home.done': '知道了',
```

- [x] **Step 6: 样式（`app/app.css`，放在 `.notice` 之后）**

```css
.home-tip {
  display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; padding: 14px 16px;
  border: 2px solid #efd28a; border-radius: 14px; background: #fff3cf;
}
.home-tip .btn { align-self: flex-start; }
```

- [x] **Step 7: 运行，确认通过；改坏确认**

Run: `npx playwright test tests/e2e/product.spec.mjs -g "home screen"` → 2 passed。
临时把 `|| openedAsHomeScreenApp()` 删掉再跑，第二条必须失败；改回。
再跑 `npx playwright test`（含手机宽度不横向滚动的检查）→ 全部通过。

- [x] **Step 8: 提交**

```bash
git add app/dom.js app/views/member.js app/app.css app/locales/en.js app/locales/zh-CN.js tests/e2e/product.spec.mjs
git commit -m "feat: suggest putting Crumb on the home screen to team members"
```

### Task 6: 网页清单与桌面图标

**Files:**
- Create: `scripts/make-icons.mjs`, `app/manifest.webmanifest`, `app/icons/icon-180.png`, `app/icons/icon-192.png`, `app/icons/icon-512.png`, `tests/home-screen.test.mjs`
- Modify: `app/index.html`

- [x] **Step 1: 写失败的测试 `tests/home-screen.test.mjs`**

```js
/* The home-screen icon: a manifest that keeps it opening in the browser, and real PNG icons. */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { rawGet, startServer } from './helpers.mjs';

test('the manifest and icons are served, and the icon opens in the browser', async t => {
  const server = await startServer(t);
  const manifest = await rawGet(server.base, '/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers['content-type'], /^application[/]manifest[+]json/);
  const body = JSON.parse(manifest.text);
  // A separate web app would keep its own storage, and so start signed out.
  assert.equal(body.display, 'browser');
  assert.equal(body.start_url, '/');
  const index = await rawGet(server.base, '/');
  assert.match(index.text, /<link rel="manifest" href="[/]manifest[.]webmanifest">/);
  assert.match(index.text, /<link rel="apple-touch-icon" href="[/]icons[/]icon-180[.]png">/);
  const icons = [['/icons/icon-180.png', 180], ...body.icons.map(icon => [icon.src, Number(icon.sizes.split('x')[0])])];
  assert.deepEqual(icons.map(([, size]) => size), [180, 192, 512]);
  for (const [path, size] of icons) {
    const response = await fetch(server.base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), 'image/png', path);
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['png', size, size], path);
  }
});
```

- [x] **Step 2: 运行，确认失败**

Run: `node --test tests/home-screen.test.mjs`
Expected: FAIL（`/manifest.webmanifest` 404）。

- [x] **Step 3: 写 `scripts/make-icons.mjs` 并运行**

```js
/* Builds the home-screen icons in app/icons/ from the same sprite table the app draws from,
 * the way make-og.mjs builds the share card. Run: node scripts/make-icons.mjs
 * It is not part of serving the app — there is still no build step. */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* sprites.js touches no browser API at load time, so it evaluates here as-is. */
const Pixel = eval(readFileSync(join(root, 'assets/sprites.js'), 'utf8') + '\n;Pixel');
const BACKGROUND = [0xf2, 0xe7, 0xce];
const hex = value => [1, 3, 5].map(at => parseInt(value.slice(at, at + 2), 16));

async function icon(size) {
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i += 1) pixels.set(BACKGROUND, i * 3);
  const sprite = Pixel.SPRITES.laopo;
  const scale = Math.floor((size * 0.72) / 12);
  const origin = Math.floor((size - 12 * scale) / 2);
  const { dx, dy } = Pixel.offset(sprite);
  sprite.rows.forEach((row, r) => [...row].forEach((key, c) => {
    const colour = sprite.palette[key];
    if (!colour) return;
    const rgb = hex(colour);
    for (let y = 0; y < scale; y += 1) {
      for (let x = 0; x < scale; x += 1) {
        pixels.set(rgb, ((origin + (r + dy) * scale + y) * size + origin + (c + dx) * scale + x) * 3);
      }
    }
  }));
  const out = join(root, 'app', 'icons', `icon-${size}.png`);
  await sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).png().toFile(out);
  console.log(`wrote ${out}`);
}

mkdirSync(join(root, 'app', 'icons'), { recursive: true });
for (const size of [180, 192, 512]) await icon(size);
```

Run: `node scripts/make-icons.mjs`，打开三个 PNG 看一眼：奶油底色、居中的像素老婆饼。

- [x] **Step 4: 写 `app/manifest.webmanifest`**

```json
{
  "name": "Crumb",
  "short_name": "Crumb",
  "id": "/",
  "start_url": "/",
  "scope": "/",
  "display": "browser",
  "background_color": "#f2e7ce",
  "theme_color": "#f2e7ce",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [x] **Step 5: `app/index.html` 在 favicon 那行之后加**

```html
<!-- The home-screen icon. The manifest keeps it opening in the browser, which holds the
     sign-in: a separate web app keeps its own storage and would start signed out. -->
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/icon-180.png">
```

- [x] **Step 6: 运行，确认通过；提交**

Run: `node --test tests/home-screen.test.mjs` → pass；`npm test` → 全部通过。

```bash
git add scripts/make-icons.mjs app/manifest.webmanifest app/icons app/index.html tests/home-screen.test.mjs
git commit -m "feat: home-screen icon that opens Crumb in the browser"
```

### Task 7: 从独立网页 App 打开且未登录时的说明

**Files:**
- Modify: `app/views/auth.js`, `app/locales/en.js`, `app/locales/zh-CN.js`, `tests/e2e/product.spec.mjs`

- [x] **Step 1: 写失败的浏览器测试**

```js
test('opened as a separate app from the home screen and signed out, the sign-in page says how to fix the icon', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const app = await browser.newContext();
    await app.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
    const page = await app.newPage();
    await page.goto(fx.origin);
    await expect(page.getByText(/separate app/)).toContainText('Open as Web App');
    await app.close();

    const tab = await (await browser.newContext()).newPage();
    await tab.goto(fx.origin);
    await expect(tab.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(tab.getByText(/separate app/)).toHaveCount(0);
    await tab.context().close();
  } finally {
    await fx.close();
  }
});
```

- [x] **Step 2: 运行，确认失败**

Run: `npx playwright test tests/e2e/product.spec.mjs -g "separate app"`
Expected: FAIL。

- [x] **Step 3: 改 `app/views/auth.js`**

从 `../dom.js` 的 import 加上 `openedAsHomeScreenApp`。在 `login()` 的 `root.replaceChildren(frame(...[` 里，`auth.memberHint` 那一行之后加：

```js
    openedAsHomeScreenApp() ? el('p', { text: t('auth.homeScreenApp'), attrs: { class: 'notice' } }) : null,
```

- [x] **Step 4: 文案（加在 `auth.memberHint` 之后）**

en: `'auth.homeScreenApp': 'This home-screen icon opens Crumb as a separate app, which does not share the sign-in of your browser. Delete the icon and add Crumb to the home screen again from the browser; if you see Open as Web App, turn it off. Not signed in there either? Ask your admin for a new code.',`
zh: `'auth.homeScreenApp': '这个桌面图标把 Crumb 当成独立 App 打开，它和浏览器不共用登录。请删掉这个图标，在浏览器里重新「添加到主屏幕」；如果看到「作为网页 App 打开」，把它关掉。浏览器里也没登录？请管理员给你一个新的二维码。',`

- [x] **Step 5: 运行，确认通过；提交**

Run: `npx playwright test tests/e2e/product.spec.mjs -g "separate app"` → 1 passed。

```bash
git add app/views/auth.js app/locales/en.js app/locales/zh-CN.js tests/e2e/product.spec.mjs
git commit -m "feat: explain a home-screen app that starts signed out"
```

### Task 8: 截图、文档、全量验证

**Files:**
- Modify: `scripts/screenshots.mjs`, `README.md`, `README.zh-CN.md`, `docs/DEPLOYMENT.md`, `docs/VALIDATION.md`, `docs/RELEASE-CHECKLIST.md`

- [x] **Step 1: 截图脚本**：`--all` 模式里，`sign-in-link-phone` 那张之后，用管理员页面给 Dana 生成新的登录链接并截 `link-panel-qr`：

```js
      await ownerPage.goto(`${origin}/#/team/members`);
      await ownerPage.getByRole('button', { name: 'New sign-in link for Dana Reyes', exact: true }).click();
      await ownerPage.getByRole('dialog').getByRole('button', { name: 'Make a new link', exact: true }).click();
      await ownerPage.locator('.qr-image').waitFor();
      await shoot(ownerPage, 'link-panel-qr');
```

Run: `node scripts/screenshots.mjs --all --out <临时目录>`，看 `link-panel-qr.png`、`member-full.png`（顶部有卡片）。

- [x] **Step 2: README（中英）**：角色那条说明成员用专属链接或二维码登录；「How it is put together」加一句 uqr 在服务器上生成二维码。
- [x] **Step 3: `docs/DEPLOYMENT.md`**：After setup 说明二维码两种用法；安全说明补充二维码与链接相同、私下发送；微信扫码或长按识别会在微信里打开；桌面图标用浏览器打开，iPhone 上关掉「作为网页 App 打开」；浏览器本地存储多了「是否已关掉桌面提示」。
- [x] **Step 4: `docs/VALIDATION.md`**：与计划的差异里加 2026-09-29 的扫码与桌面图标决定、两个新依赖；未验证里加真 iPhone、安卓的扫码、长按识别、桌面图标是否共用登录；测试覆盖表加 `tests/qr.test.mjs`、`tests/home-screen.test.mjs`。
- [x] **Step 5: `docs/RELEASE-CHECKLIST.md`**：登录那一行提到二维码；「Before calling 0.1 ready」加一项「在真 iPhone 上确认：扫码登录，添加到主屏幕后点图标仍是登录状态」。
- [x] **Step 6: 全量验证**：`npm test`、`npx playwright test`、`node scripts/ci/process-drill.mjs`、`node scripts/theme-manifest.mjs --check`、`git diff --check`，再从全新克隆跑一遍，结果写进 VALIDATION。
- [x] **Step 7: 提交、独立审查、推送到草稿 PR、更新 PR 说明**（不合并 main）。
