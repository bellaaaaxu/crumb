import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import en from '../app/locales/en.js';
import zhCN from '../app/locales/zh-CN.js';
import { THEMED_KEYS, setLocale, themed } from '../app/i18n.js';
import { ROLES } from '../server/members.mjs';
import { CURRENCIES } from '../server/org.mjs';
import { KINDS, MEMBER_STATUSES, STATUSES } from '../server/routes/read-models.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

/* "1" up to the count a constant in views/member.js holds. The view is browser code and cannot
 * be imported here, so the constant is read from the file itself. */
const memberView = readFileSync(join(root, 'app/views/member.js'), 'utf8');
function upTo(name) {
  const found = memberView.match(new RegExp(`^const ${name} = (\\d+);`, 'm'));
  assert.ok(found, `views/member.js defines ${name}`);
  return Array.from({ length: Number(found[1]) }, (_, index) => String(index + 1));
}

/* Keys the app builds at run time from a value, so no literal names them: each family, every
 * value it is built from, and where. Checked both ways: each of these keys exists, and a key in
 * one of these families for any other value counts as unused. */
const BUILT = {
  // `status.${status}`: badge() in views/shared.js. A request's status, `member-${status}` for a
  // person, and the marks the views name themselves (views/member.js, views/admin.js).
  status: [...STATUSES, ...MEMBER_STATUSES.map(status => `member-${status}`), 'refunded', 'revoked', 'voided', 'open', 'closed'],
  role: ROLES, // `role.${person.role}`: views/admin.js, views/activity.js
  'members.roleDetail': ROLES, // themed(`members.roleDetail.${value}`, theme): views/admin.js
  currency: CURRENCIES, // `currency.${value}`: views/auth.js, views/settings.js
  title: ['me', 'team', 'settings'], // `title.${section}`: main.js
  kind: KINDS, // `kind.${kind}`: kindLabel() in views/shared.js
  daily: upTo('DAILY'), // `daily.${n}`: views/member.js
  dailyZero: upTo('DAILY_ZERO'), // `dailyZero.${n}`: views/member.js
};
const builtKeys = new Set(Object.entries(BUILT).flatMap(([prefix, values]) => values.map(value => `${prefix}.${value}`)));

/* The collection themes, as scripts/theme-manifest.mjs writes them (themes/<id>.json). A
 * sentence that follows the theme has a version per theme, keyed `<base key>.<theme id>`
 * (THEMED_KEYS in app/i18n.js); the app reaches those through themed(), never by name. */
const THEME_IDS = readdirSync(join(root, 'themes')).filter(name => name.endsWith('.json'))
  .map(name => JSON.parse(readFileSync(join(root, 'themes', name), 'utf8')).themeId);
const themedVariants = new Set(THEMED_KEYS.flatMap(base => THEME_IDS.map(id => `${base}.${id}`)));

async function sources(dir) {
  const found = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await sources(path));
    else if (/\.(m?js)$/.test(entry.name)) found.push({ path, text: await readFile(join(root, path), 'utf8') });
  }
  return found;
}

test('both languages define the same strings with the same placeholders', () => {
  assert.deepEqual(Object.keys(zhCN).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en)) {
    assert.ok(en[key].trim() && zhCN[key].trim(), `${key} is empty`);
    assert.deepEqual(placeholders(zhCN[key]), placeholders(en[key]), key);
  }
});

test('every string key the app asks for exists', async () => {
  const app = (await sources('app')).filter(file => !file.path.includes('locales'));
  for (const { path, text } of app) {
    for (const [, key] of text.matchAll(/\bt\('([^']+)'/g)) assert.ok(Object.hasOwn(en, key), `${path} uses missing key ${key}`);
  }
  for (const key of builtKeys) assert.ok(Object.hasOwn(en, key), key);
});

test('every error code and audit action the server can produce has words', async () => {
  const server = [...await sources('server'), ...await sources('scripts')];
  const codes = new Set();
  const actions = new Set();
  for (const { text } of server) {
    for (const [, code] of text.matchAll(/new AppError\(\s*\d{3},\s*'([A-Z_]+)'/g)) codes.add(code);
    // Audit actions are always namespaced ("grant.create"); route parameters like 'cancel' are not.
    for (const [, action] of text.matchAll(/action: [`']([a-z_]+\.[a-z_.]+)[`']/g)) actions.add(action);
  }
  // resolveRedemption builds its action name as `redemption.${action}`.
  for (const action of ['complete', 'cancel', 'reject']) actions.add(`redemption.${action}`);
  assert.ok(codes.size > 30 && actions.size > 15, `found ${codes.size} codes and ${actions.size} actions`);
  for (const code of codes) {
    if (['SCHEMA_TOO_NEW', 'THEME_UNKNOWN', 'NOT_INITIALIZED', 'BAD_REQUEST', 'INVALID_MODE', 'INVALID_LIMIT', 'INVALID_CURSOR'].includes(code)) continue;
    assert.ok(Object.hasOwn(en, `error.${code}`), `error.${code}`);
  }
  for (const action of actions) assert.ok(Object.hasOwn(en, `audit.${action}`), `audit.${action}`);
});

test('the word recognition is gone from the app strings', () => {
  for (const [key, value] of Object.entries(en)) assert.doesNotMatch(value, /recogni/i, `en ${key}`);
  for (const [key, value] of Object.entries(zhCN)) assert.doesNotMatch(value, /认可/, `zh-CN ${key}`);
});

test('every string in the locale files is one the app uses', async () => {
  // Words no page asks for any more would still be translated and reviewed, so they
  // leave with the page that used them. A key counts as used when the app names it
  // as a quoted literal: t('key'), has('key'), themed('key', …), or a key handed to a
  // helper that calls t() (unconfirmedNotice, boldName and the like).
  const app = (await sources('app')).filter(file => !file.path.includes('locales'));
  const code = app.map(({ text }) => text).join('\n');
  // Besides the families in BUILT, two are built from what the server sends; the test above
  // checks them against the codes and actions the server can produce.
  const fromServer = [
    /^error\.[A-Z_]+$/, // `error.${error.code}`: main.js
    /^audit\.[a-z_]+\.[a-z_]+$/, // `audit.${item.action}`, always namespaced ("grant.create"): views/activity.js
  ];
  // A theme's own version of a sentence (`grant.unlocked.bakery`) is reached through themed();
  // the tests below check each one against its base key and that the base key goes through themed().
  const unused = Object.keys(en).filter(key => !code.includes(`'${key}'`) && !code.includes(`"${key}"`)
    && !builtKeys.has(key) && !themedVariants.has(key) && !fromServer.some(pattern => pattern.test(key)));
  assert.deepEqual(unused, [], 'no page uses these: delete them from both languages');
});

test('themed() picks a theme’s own sentence when there is one, the base sentence otherwise', t => {
  assert.equal(themed('grant.unlocked', 'bakery', { count: 2 }), 'And 2 more came out of the oven.');
  assert.equal(themed('revoke.explain', 'bakery'), en['revoke.explain.bakery']);
  assert.equal(themed('grant.unlocked', 'default', { count: 2 }), 'And that baked 2 new pastry(ies).', 'the Pastry shop has no versions of its own');
  assert.equal(themed('grant.unlocked', 'nosuchtheme', { count: 2 }), 'And that baked 2 new pastry(ies).', 'a theme this version does not have');
  assert.equal(themed('grant.unlocked', undefined, { count: 2 }), 'And that baked 2 new pastry(ies).', 'no theme at all');
  assert.equal(themed('members.roleDetail.admin', 'bakery'), en['members.roleDetail.admin'], 'a key the theme has no version of');
  // The theme's version comes in the page's language too. setLocale() also sets <html lang>,
  // and Node has no document.
  globalThis.document = { documentElement: {} };
  t.after(() => {
    setLocale('en');
    delete globalThis.document;
  });
  setLocale('zh-CN');
  assert.equal(themed('grant.unlocked', 'bakery', { count: 2 }), '顺便又烤好了 2 件。');
  assert.equal(themed('grant.unlocked', 'default', { count: 2 }), '顺便烤出了 2 件新点心。');
});

test('a theme’s own sentence has its base key and the same placeholders', () => {
  assert.ok(THEME_IDS.includes('default') && THEME_IDS.includes('bakery'), `themes/*.json: ${THEME_IDS.join(', ')}`);
  for (const [language, dictionary] of [['en', en], ['zh-CN', zhCN]]) {
    for (const key of Object.keys(dictionary)) {
      const id = THEME_IDS.find(themeId => key.endsWith(`.${themeId}`));
      if (!id) continue;
      const base = key.slice(0, -(id.length + 1));
      assert.notEqual(id, 'default', `${language} ${key}: the Pastry shop uses the base key itself`);
      assert.ok(THEMED_KEYS.includes(base), `${language} ${key}: ${base} is not in THEMED_KEYS (app/i18n.js)`);
      assert.ok(Object.hasOwn(dictionary, base), `${language} ${key} has no base key ${base}`);
      assert.deepEqual(placeholders(dictionary[key]), placeholders(dictionary[base]), `${language} ${key}`);
    }
  }
  // The Bakery has its own version of every one (spec §6).
  for (const base of THEMED_KEYS) assert.ok(Object.hasOwn(en, `${base}.bakery`), `${base}.bakery`);
});

test('every sentence that follows the theme is looked up through themed()', async () => {
  // app/i18n.js lists THEMED_KEYS itself, so it is left out of the count.
  const app = (await sources('app')).filter(file => !file.path.includes('locales') && !/i18n\.js$/.test(file.path));
  const code = app.map(({ text }) => text).join('\n');
  const count = needle => code.split(needle).length - 1;
  for (const [, key] of code.matchAll(/\bthemed\('([^']+)'/g))
    assert.ok(THEMED_KEYS.includes(key), `themed('${key}'): add ${key} to THEMED_KEYS in app/i18n.js`);
  for (const base of THEMED_KEYS) {
    assert.ok(Object.hasOwn(en, base), `${base} is in THEMED_KEYS but not in the locale files`);
    // t() never shows a theme's own version, so the key is only ever named as themed()'s first
    // argument: themed('key', theme, params), not t('key') or themed(a ? 'key' : 'other', …).
    const named = count(`themed('${base}'`);
    assert.equal(count(`'${base}'`), named, `${base} is looked up without themed(): write themed('${base}', theme, …)`);
    // A key built from a value (BUILT above) counts when its whole family is built inside themed().
    const family = Object.keys(BUILT).find(prefix => base.startsWith(`${prefix}.`) && BUILT[prefix].includes(base.slice(prefix.length + 1)));
    let built = 0;
    if (family) {
      const template = `\`${family}.\${`;
      built = count(`themed(${template}`);
      assert.equal(count(template), built, `${family}.\${…} is built outside themed(), but ${base} follows the theme`);
    }
    assert.ok(named + built > 0, `no page looks up ${base} through themed()`);
  }
});

test('the sentences about the fixed reward rules name the collection theme', () => {
  for (const key of ['settings.locked', 'settings.lockedByBenefits', 'setup.rulesNote']) {
    assert.match(en[key], /collection theme/, `en ${key}`);
    assert.match(zhCN[key], /收藏主题/, `zh-CN ${key}`);
  }
});

test('only the sentences that follow the theme name pastries', () => {
  // A Bakery team reads every other sentence as it is (spec §6).
  for (const [key, value] of Object.entries(en))
    if (/pastr/i.test(value)) assert.ok(THEMED_KEYS.includes(key), `en ${key} names pastries but does not follow the theme`);
  for (const [key, value] of Object.entries(zhCN))
    if (/点心/.test(value)) assert.ok(THEMED_KEYS.includes(key), `zh-CN ${key} names pastries but does not follow the theme`);
});

test('the collection theme choice uses the approved words', () => {
  assert.equal(en['settings.theme'], 'Collection theme');
  assert.equal(zhCN['settings.theme'], '收藏主题');
  assert.equal(en['settings.themeChanged'],
    'Theme changed. {count} benefit icon(s) aren’t in this theme, so they were removed. You can pick new ones.');
  assert.equal(zhCN['settings.themeChanged'], '主题换好了。有 {count} 个福利的配图新主题里没有，已经去掉，可以重新配。');
});
