import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import en from '../app/locales/en.js';
import zhCN from '../app/locales/zh-CN.js';
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
  'members.roleDetail': ROLES, // `members.roleDetail.${value}`: views/admin.js
  currency: CURRENCIES, // `currency.${value}`: views/auth.js, views/settings.js
  title: ['me', 'team', 'settings'], // `title.${section}`: main.js
  kind: KINDS, // `kind.${kind}`: kindLabel() in views/shared.js
  daily: upTo('DAILY'), // `daily.${n}`: views/member.js
  dailyZero: upTo('DAILY_ZERO'), // `dailyZero.${n}`: views/member.js
};
const builtKeys = new Set(Object.entries(BUILT).flatMap(([prefix, values]) => values.map(value => `${prefix}.${value}`)));

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
    if (['SCHEMA_TOO_NEW', 'NOT_INITIALIZED', 'BAD_REQUEST', 'INVALID_MODE', 'INVALID_LIMIT', 'INVALID_CURSOR'].includes(code)) continue;
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
  // as a quoted literal: t('key'), has('key'), or a key handed to a helper that
  // calls t() (unconfirmedNotice, boldName and the like).
  const app = (await sources('app')).filter(file => !file.path.includes('locales'));
  const code = app.map(({ text }) => text).join('\n');
  // Besides the families in BUILT, two are built from what the server sends; the test above
  // checks them against the codes and actions the server can produce.
  const fromServer = [
    /^error\.[A-Z_]+$/, // `error.${error.code}`: main.js
    /^audit\.[a-z_]+\.[a-z_]+$/, // `audit.${item.action}`, always namespaced ("grant.create"): views/activity.js
  ];
  const unused = Object.keys(en).filter(key => !code.includes(`'${key}'`) && !code.includes(`"${key}"`)
    && !builtKeys.has(key) && !fromServer.some(pattern => pattern.test(key)));
  assert.deepEqual(unused, [], 'no page uses these: delete them from both languages');
});
