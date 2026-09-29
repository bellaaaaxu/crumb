import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MEMBER_SESSION_TTL_MS, createSession, loadSession, loginBuckets } from '../server/auth.mjs';
import { hashPassword, verifyPassword } from '../server/passwords.mjs';
import { PASSWORD, client, fixture, orgInput, rawGet, setupOrganization, startServer } from './helpers.mjs';

const MINUTE = 60 * 1000;

test('password hashes are salted and verifiable', async () => {
  const a = await hashPassword('a-long-test-password');
  const b = await hashPassword('a-long-test-password');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('a-long-test-password', a), true);
  assert.equal(await verifyPassword('wrong-password', a), false);
});

test('password length is counted in characters, 12 to 128', async () => {
  await assert.rejects(hashPassword('elevenchars'), error => error.status === 422 && error.code === 'INVALID_PASSWORD');
  await assert.rejects(hashPassword('x'.repeat(129)), error => error.code === 'INVALID_PASSWORD');
  await assert.rejects(hashPassword(12345678901234), error => error.code === 'INVALID_PASSWORD');
  const cjk = '密码密码密码密码密码密码';
  assert.equal([...cjk].length, 12);
  assert.equal(await verifyPassword(cjk, await hashPassword(cjk)), true);
});

test('malformed stored hashes never verify and never throw', async () => {
  for (const encoded of [null, '', 'fixture-no-login', 'scrypt$1$1$1$aa$bb', 'scrypt$131072$8$1$zz$zz', 'bcrypt$x'])
    assert.equal(await verifyPassword('a-long-test-password', encoded), false);
});

test('setup needs the server setup code', async t => {
  const server = await startServer(t);
  const api = client(server.base);
  await api.bootstrap();
  const input = { username: 'owner', password: PASSWORD, displayName: 'Olive', org: orgInput() };
  assert.equal((await api.request('POST', '/api/setup', input)).status, 422);
  const wrong = await api.request('POST', '/api/setup', { ...input, setupToken: 'not-the-code' });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.body.error.code, 'INVALID_SETUP_TOKEN');
  assert.equal(server.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});

test('setup is unavailable without a setup code file', async t => {
  const server = await startServer(t, { writeToken: false });
  const api = client(server.base);
  await api.bootstrap();
  const response = await api.request('POST', '/api/setup', {
    setupToken: server.setupToken, username: 'owner', password: PASSWORD, displayName: 'Olive', org: orgInput(),
  });
  assert.equal(response.status, 503);
  assert.equal(response.body.error.code, 'SETUP_UNAVAILABLE');
});

test('setup creates one owner, signs them in, then closes', async t => {
  const server = await startServer(t);
  const api = client(server.base);
  const anonymous = await api.bootstrap();
  assert.equal(anonymous.body.initialized, false);
  assert.equal(anonymous.body.user, null);
  const anonymousCookie = [...api.cookies.values()][0];

  const { api: owner } = await setupOrganization(server);
  const session = await owner.request('GET', '/api/session');
  assert.equal(session.body.user.role, 'owner');
  assert.equal(session.body.initialized, true);
  assert.equal(session.body.org.mode, 'credit');
  assert.equal(session.body.org.thresholdUnits, 5000);
  assert.notEqual([...owner.cookies.values()][0], anonymousCookie);

  const again = await owner.request('POST', '/api/setup', {
    setupToken: server.setupToken, username: 'second', password: PASSWORD, displayName: 'Second', org: orgInput(),
  });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'ALREADY_INITIALIZED');
  assert.equal(server.db.prepare(`SELECT count(*) AS n FROM users WHERE role = 'owner'`).get().n, 1);
});

test('two simultaneous setups produce exactly one owner', async t => {
  const server = await startServer(t);
  const a = client(server.base);
  const b = client(server.base);
  await Promise.all([a.bootstrap(), b.bootstrap()]);
  const body = username => ({ setupToken: server.setupToken, username, password: PASSWORD, displayName: username, org: orgInput() });
  const results = await Promise.all([a.request('POST', '/api/setup', body('first')), b.request('POST', '/api/setup', body('second'))]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(server.db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
  assert.equal(server.db.prepare('SELECT count(*) AS n FROM organization').get().n, 1);
});

test('the anonymous view of the organization is minimal', async t => {
  const server = await startServer(t);
  await setupOrganization(server);
  const visitor = client(server.base);
  const session = await visitor.bootstrap();
  assert.deepEqual(session.body.org, { name: 'Test Team', locale: 'en', hasLogo: false });
  // The version (for bug reports) and the address changes must come from (for the wrong-address notice).
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(session.body.version, version);
  assert.equal(session.body.origin, server.config.publicOrigin);
});

test('login rotates the session and logout ends it', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  assert.equal((await owner.request('POST', '/api/logout')).status, 204);
  assert.equal((await owner.request('GET', '/api/session')).body.user, null);

  const api = client(server.base);
  await api.bootstrap();
  const anonymousCsrf = api.csrf;
  const anonymousCookie = [...api.cookies.values()][0];
  const login = await api.request('POST', '/api/login', { username: 'OWNER', password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.username, 'owner');
  assert.notEqual(login.body.csrfToken, anonymousCsrf);
  assert.notEqual([...api.cookies.values()][0], anonymousCookie);

  // The pre-login session is gone, not upgraded in place.
  const stale = client(server.base);
  stale.cookies.set([...api.cookies.keys()][0], anonymousCookie);
  stale.csrf = anonymousCsrf;
  assert.equal((await stale.request('POST', '/api/logout')).status, 403);

  // Reading the session again returns the same CSRF token: tabs do not invalidate each other.
  api.csrf = login.body.csrfToken;
  assert.equal((await api.request('GET', '/api/session')).body.csrfToken, login.body.csrfToken);

  const signedInCookie = [...api.cookies.values()][0];
  assert.equal((await api.request('POST', '/api/logout')).status, 204);
  const reuse = client(server.base);
  reuse.cookies.set([...api.cookies.keys()][0] ?? 'crumb', signedInCookie);
  assert.equal((await reuse.request('GET', '/api/session')).body.user, null);
});

test('signed-in sessions last 12 hours and anonymous ones 30 minutes', async t => {
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  server.time.now += 12 * 60 * MINUTE - 1000;
  assert.equal((await owner.request('GET', '/api/session')).body.user.username, 'owner');
  server.time.now += 2000;
  assert.equal((await owner.request('GET', '/api/session')).body.user, null);

  const visitor = client(server.base);
  await visitor.bootstrap();
  server.time.now += 31 * MINUTE;
  const late = await visitor.request('POST', '/api/login', { username: 'owner', password: PASSWORD });
  assert.equal(late.status, 403);
  assert.equal(late.body.error.code, 'CSRF_FAILED');
});

test('wrong password and unknown account get the same answer', async t => {
  const server = await startServer(t);
  await setupOrganization(server);
  const api = client(server.base);
  await api.bootstrap();
  const wrong = await api.request('POST', '/api/login', { username: 'owner', password: 'not the right password' });
  const unknown = await api.request('POST', '/api/login', { username: 'nobody', password: 'not the right password' });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
  assert.equal(unknown.status, 401);
});

test('five failures lock an account for 15 minutes, even with the right password', async t => {
  const server = await startServer(t);
  await setupOrganization(server);
  const api = client(server.base);
  await api.bootstrap();
  for (let i = 0; i < 5; i += 1)
    assert.equal((await api.request('POST', '/api/login', { username: 'owner', password: `wrong password ${i}` })).status, 401);
  const blocked = await api.request('POST', '/api/login', { username: 'owner', password: PASSWORD });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error.code, 'TOO_MANY_ATTEMPTS');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);

  server.time.now += 15 * MINUTE;
  await api.bootstrap();
  assert.equal((await api.request('POST', '/api/login', { username: 'owner', password: PASSWORD })).status, 200);
});

test('a sign-in the server was too busy to check does not count as a failed attempt', async t => {
  const server = await startServer(t);
  await setupOrganization(server);
  const api = client(server.base);
  await api.bootstrap();
  // Two hashes running and sixteen waiting: the next one is turned away.
  const flood = Array.from({ length: 18 }, () => hashPassword('a flood of password hashing'));
  const busy = await api.request('POST', '/api/login', { username: 'owner', password: PASSWORD });
  await Promise.all(flood);
  assert.equal(busy.status, 503);
  assert.equal(busy.body.error.code, 'RETRY_LATER');
  assert.deepEqual(server.db.prepare('SELECT bucket FROM login_limits WHERE attempts > 0').all(), []);
});

test('the per-address limit treats one IPv6 /64 as one address', () => {
  const key = address => loginBuckets('owner', address)[1].key;
  assert.equal(key('2001:db8:1:2:aaaa::1'), key('2001:db8:1:2:ffff:ffff:ffff:ffff'));
  assert.equal(key('2001:db8::1'), key('2001:0db8:0000:0000:0000:0000:0000:0002'));
  assert.equal(key('fe80::1%eth0'), key('fe80::2'));
  assert.notEqual(key('2001:db8:1:2::1'), key('2001:db8:1:3::1'));
  assert.equal(key('::ffff:203.0.113.9'), key('203.0.113.9'), 'IPv4 written as IPv6 is still that IPv4 address');
  // NAT64 (64:ff9b::/96) carries many IPv4 clients in one /64: each counts as its own IPv4 address.
  assert.equal(key('64:ff9b::203.0.113.9'), key('203.0.113.9'));
  assert.equal(key('64:ff9b::cb00:7109'), key('203.0.113.9'));
  assert.notEqual(key('64:ff9b::203.0.113.9'), key('64:ff9b::203.0.113.10'));
  assert.notEqual(key('203.0.113.9'), key('203.0.113.10'));
  assert.equal(loginBuckets('owner', '203.0.113.9')[0].key, 'account:owner');
});

test('a forged X-Forwarded-For does not escape the per-address limit', async t => {
  const server = await startServer(t);
  await setupOrganization(server);
  const api = client(server.base);
  await api.bootstrap();
  for (let i = 0; i < 30; i += 1) {
    const response = await api.request('POST', '/api/login',
      { username: `guess${i}`, password: 'not the right password' }, { 'x-forwarded-for': `203.0.113.${i}` });
    assert.equal(response.status, 401);
  }
  const blocked = await api.request('POST', '/api/login',
    { username: 'owner', password: PASSWORD }, { 'x-forwarded-for': '198.51.100.7' });
  assert.equal(blocked.status, 429);
});

test('changes need the exact origin and a CSRF token', async t => {
  const server = await startServer(t);
  await setupOrganization(server);
  const api = client(server.base);
  await api.bootstrap();
  const login = { username: 'owner', password: PASSWORD };
  const cases = [
    [{ origin: 'https://evil.example' }, 'BAD_ORIGIN'],
    [{ origin: undefined }, 'BAD_ORIGIN'],
    [{ origin: server.base.replace('127.0.0.1', 'localhost') }, 'BAD_ORIGIN'],
    [{ 'x-csrf-token': undefined }, 'CSRF_FAILED'],
    [{ 'x-csrf-token': 'x'.repeat(43) }, 'CSRF_FAILED'],
  ];
  for (const [headers, code] of cases) {
    const response = await api.request('POST', '/api/login', login, headers);
    assert.equal(response.status, 403, JSON.stringify(headers));
    assert.equal(response.body.error.code, code);
  }
  const noSession = client(server.base);
  noSession.csrf = api.csrf;
  assert.equal((await noSession.request('POST', '/api/login', login)).status, 403);
  assert.equal((await api.request('POST', '/api/login', login)).status, 200);
});

test('request bodies are validated strictly', async t => {
  const server = await startServer(t);
  await setupOrganization(server);
  const api = client(server.base);
  await api.bootstrap();
  const extra = await api.request('POST', '/api/login', { username: 'owner', password: PASSWORD, role: 'owner' });
  assert.equal(extra.status, 422);
  assert.equal(extra.body.error.code, 'UNKNOWN_FIELD');
  const broken = await api.request('POST', '/api/login', '{"username":', {});
  assert.equal(broken.status, 400);
  assert.equal(broken.body.error.code, 'INVALID_JSON');
  const huge = await api.request('POST', '/api/login', { username: 'owner', password: 'x'.repeat(40 * 1024) });
  assert.equal(huge.status, 413);
  const list = await api.request('POST', '/api/login', [PASSWORD]);
  assert.equal(list.status, 422);
});

test('only the product files are served, and nothing is cached', async t => {
  const server = await startServer(t);
  const sprites = await rawGet(server.base, '/assets/sprites.js');
  assert.equal(sprites.status, 200);
  assert.match(sprites.text, /const Pixel/);
  assert.equal(sprites.headers['cache-control'], 'no-store');
  for (const path of ['/package.json', '/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json',
    '/server/db.mjs', '/assets/app.js', '/assets/style.css', '/tests/helpers.mjs', '/.git/config',
    '/%2e%2e/%2e%2e/server/db.mjs', '/app/../server/db.mjs']) {
    const response = await rawGet(server.base, path);
    assert.notEqual(response.status, 200, path);
    assert.doesNotMatch(response.text, /better-sqlite3|"dependencies"|openDatabase|\[core\]/, path);
    assert.equal(response.headers['cache-control'], 'no-store', path);
  }
  const api = client(server.base);
  const session = await api.request('GET', '/api/session');
  assert.equal(session.headers.get('cache-control'), 'no-store');
  assert.match(session.headers.get('content-security-policy'), /script-src 'self'/);
  assert.doesNotMatch(session.headers.get('content-security-policy'), /unsafe-inline/);
  assert.equal(session.headers.get('referrer-policy'), 'no-referrer');
  const cookie = session.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Path=\//i);
});

test('errors never leak paths, SQL or secrets', async t => {
  const server = await startServer(t);
  const api = client(server.base);
  await api.bootstrap();
  const missing = await api.request('GET', '/api/does-not-exist');
  assert.equal(missing.status, 404);
  assert.deepEqual(Object.keys(missing.body.error).sort(), ['code', 'message']);

  server.db.close();
  const failed = await api.request('GET', '/api/session');
  assert.equal(failed.status, 500);
  assert.equal(failed.body.error.code, 'INTERNAL');
  const text = JSON.stringify(failed.body);
  assert.doesNotMatch(text, /sqlite|database|SELECT|[A-Z]:\\|\/tmp|crumb-http|node_modules/i);
  assert.doesNotMatch(text, new RegExp(server.setupToken));
  const health = await api.request('GET', '/healthz');
  assert.equal(health.status, 503);
  assert.deepEqual(health.body, { ok: false });
});

test('housekeeping removes expired sessions and finished sign-in windows only', async t => {
  const { sweepExpired } = await import('../server/auth.mjs');
  const server = await startServer(t);
  const { api: owner } = await setupOrganization(server);
  const visitor = client(server.base);
  await visitor.bootstrap();
  await visitor.request('POST', '/api/login', { username: 'owner', password: 'not the right password' });
  const count = sql => server.db.prepare(sql).get().n;
  assert.equal(count('SELECT count(*) AS n FROM sessions'), 2);
  assert.equal(count('SELECT count(*) AS n FROM login_limits'), 2);

  server.time.now += 31 * MINUTE;
  sweepExpired(server.db, server.clock);
  assert.equal(count('SELECT count(*) AS n FROM sessions'), 1, 'the anonymous session expired; the owner session did not');
  assert.equal(count('SELECT count(*) AS n FROM login_limits'), 0);
  assert.equal((await owner.request('GET', '/api/session')).body.user.username, 'owner');
});

test('health check reports only that the database answers', async t => {
  const server = await startServer(t);
  const response = await client(server.base).request('GET', '/healthz');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
});

test('a session from a sign-in link lasts 180 days; an owner or admin session never outlives 12 hours', t => {
  const { db, owner, member } = fixture(t);
  const start = Date.parse('2026-09-01T09:00:00Z');
  let now = start;
  const clock = () => now;
  const phone = createSession(db, member.id, clock, MEMBER_SESSION_TTL_MS);
  assert.equal(phone.maxAgeSeconds, 180 * 24 * 60 * 60, 'the cookie lasts as long as the session');
  const long = createSession(db, owner.id, clock, MEMBER_SESSION_TTL_MS);
  now += 13 * 60 * MINUTE;
  assert.ok(loadSession(db, phone.token, clock));
  assert.equal(loadSession(db, long.token, clock), null, 'a long session never carries owner or admin rights past 12 hours');
  now = start + 179 * 24 * 60 * MINUTE;
  assert.ok(loadSession(db, phone.token, clock));
  now = start + 181 * 24 * 60 * MINUTE;
  assert.equal(loadSession(db, phone.token, clock), null);
});
