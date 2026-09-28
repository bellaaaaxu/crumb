/* Test-only helpers. Nothing here is imported by the server. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { openDatabase } from '../server/db.mjs';

export const PASSWORD = 'correct horse battery staple';

/* Fixture users cannot log in: the marker below is not a valid password hash. */
export const FIXTURE_PASSWORD_HASH = 'fixture-no-login';

/**
 * A fresh on-disk database with an organization and three active users.
 * Cleans up only its own temporary directory.
 */
export function fixture(t, { mode = 'credit', thresholdUnits = 5000 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'crumb-test-'));
  const path = join(dir, 'crumb.sqlite');
  const db = openDatabase(path);
  const createdAt = new Date().toISOString();
  db.prepare(`INSERT INTO organization (id, name, mode, currency, unit_label, threshold_units, locale, created_at)
              VALUES (1, 'Test Team', @mode, @currency, @unitLabel, @thresholdUnits, 'en', @createdAt)`).run({
    mode,
    currency: mode === 'credit' ? 'CAD' : null,
    unitLabel: mode === 'credit' ? 'Team credit' : 'points',
    thresholdUnits,
    createdAt,
  });
  const insertUser = db.prepare(`INSERT INTO users (id, username, display_name, password_hash, role, active, created_at)
                                 VALUES (@id, @username, @displayName, @passwordHash, @role, 1, @createdAt)`);
  const user = (username, displayName, role) => {
    const row = { id: randomUUID(), username, displayName, role, passwordHash: FIXTURE_PASSWORD_HASH, createdAt };
    insertUser.run(row);
    return { id: row.id, role, username, displayName };
  };
  const owner = user('owner', 'Olive Owner', 'owner');
  const member = user('member', 'Mina Member', 'member');
  const member2 = user('member2', 'Mo Member', 'member');

  t.after(() => {
    if (db.open) db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { db, owner, member, member2, path, dir };
}

/**
 * Listens on a random localhost port. `build(origin)` returns the request
 * handler, because the app has to know its exact public origin up front.
 */
export async function serve(t, build) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  server.on('request', build(origin));
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(() => resolve());
  }));
  return origin;
}

/**
 * A minimal browser stand-in: keeps cookies, sends the configured Origin and
 * the CSRF token, and speaks JSON. Pass a header as undefined to leave it out.
 */
export function client(base) {
  const jar = new Map();
  const api = {
    base,
    csrf: null,
    cookies: jar,
    async request(method, path, body, headers = {}) {
      const merged = { origin: base, 'x-csrf-token': api.csrf ?? undefined, ...headers };
      if (jar.size) merged.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
      const init = { method, headers: {}, redirect: 'manual' };
      if (body !== undefined) {
        merged['content-type'] ??= 'application/json';
        init.body = typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body);
      }
      for (const [name, value] of Object.entries(merged)) if (value !== undefined) init.headers[name] = value;
      const response = await fetch(base + path, init);
      for (const line of response.headers.getSetCookie()) {
        const [pair, ...attributes] = line.split(';');
        const index = pair.indexOf('=');
        const name = pair.slice(0, index).trim();
        const value = pair.slice(index + 1).trim();
        const expired = attributes.some(attribute => /^\s*max-age=0\s*$/i.test(attribute));
        if (expired || value === '') jar.delete(name); else jar.set(name, value);
      }
      const text = await response.text();
      let parsed = text;
      if ((response.headers.get('content-type') ?? '').includes('application/json')) parsed = JSON.parse(text);
      return { status: response.status, body: parsed, headers: response.headers };
    },
    async bootstrap() {
      const response = await api.request('GET', '/api/session');
      api.csrf = response.body.csrfToken;
      return response;
    },
  };
  return api;
}

/**
 * A real app on a random port with its own temporary database and setup
 * token file. `time.now` is the app's clock and can be moved forward.
 */
export async function startServer(t, { writeToken = true } = {}) {
  const { createApp } = await import('../server/app.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'crumb-http-'));
  const dbPath = join(dir, 'crumb.sqlite');
  const setupTokenFile = join(dir, 'setup-token');
  const setupToken = randomBytes(32).toString('base64url');
  if (writeToken) writeFileSync(setupTokenFile, `${setupToken}\n`);
  const db = openDatabase(dbPath);
  const time = { now: Date.now() };
  const clock = () => time.now;
  let config;
  const base = await serve(t, origin => {
    config = {
      publicOrigin: origin, dataDir: dir, dbPath, port: 0, host: '127.0.0.1',
      secureCookies: false, setupTokenFile, trustProxy: false, allowLocalHttp: true,
    };
    return createApp({ db, config, clock, log: () => {} });
  });
  t.after(() => {
    if (db.open) db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { base, db, dir, config, setupToken, time, clock };
}

export function orgInput(mode = 'credit', overrides = {}) {
  const base = mode === 'credit'
    ? { name: 'Test Team', mode, currency: 'CAD', unitLabel: 'Team credit', threshold: '50.00', locale: 'en' }
    : { name: 'Test Team', mode, unitLabel: 'points', threshold: '100', locale: 'en' };
  return { ...base, ...overrides };
}

/* Runs first-time setup through the real API and returns the signed-in owner. */
export async function setupOrganization(server, { mode = 'credit', org = {}, username = 'owner', displayName = 'Olive Owner' } = {}) {
  const api = client(server.base);
  await api.bootstrap();
  const response = await api.request('POST', '/api/setup', {
    setupToken: server.setupToken, username, password: PASSWORD, displayName, org: orgInput(mode, org),
  });
  if (response.status !== 201) throw new Error(`setup failed: ${response.status} ${JSON.stringify(response.body)}`);
  api.csrf = response.body.csrfToken;
  return { api, user: response.body.user };
}

/* GET with the path sent exactly as written — fetch() would normalise "../". */
export function rawGet(base, path) {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname, port, path, method: 'GET' }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.on('error', reject);
    req.end();
  });
}
