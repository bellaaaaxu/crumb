import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import en from '../app/locales/en.js';
import zhCN from '../app/locales/zh-CN.js';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

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
  const dynamic = {
    status: ['pending', 'completed', 'cancelled', 'rejected', 'refunded', 'revoked', 'open', 'closed',
      'member-active', 'member-invited', 'member-deactivated'],
    role: ['member', 'admin', 'owner'],
    currency: ['CAD', 'USD', 'CNY'],
    title: ['me', 'team', 'settings', 'login'],
  };
  for (const [prefix, values] of Object.entries(dynamic))
    for (const value of values) assert.ok(Object.hasOwn(en, `${prefix}.${value}`), `${prefix}.${value}`);
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
