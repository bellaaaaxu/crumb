/* Test-only helpers. Nothing here is imported by the server. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import sharp from 'sharp';
import jsqr from 'jsqr';
import { openDatabase } from '../server/db.mjs';

export const PASSWORD = 'correct horse battery staple';

/* Fixture users cannot log in: the marker below is not a valid password hash. */
export const FIXTURE_PASSWORD_HASH = 'fixture-no-login';

/**
 * A fresh on-disk database with an organization and three active users.
 * Without `spending` the column is left to the schema's default ('self').
 * Cleans up only its own temporary directory.
 */
export function fixture(t, { mode = 'credit', thresholdUnits = 5000, spending } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'crumb-test-'));
  const path = join(dir, 'crumb.sqlite');
  const db = openDatabase(path);
  const createdAt = new Date().toISOString();
  const chosen = spending === undefined ? { column: '', value: '', params: {} } : { column: ', spending', value: ', @spending', params: { spending } };
  db.prepare(`INSERT INTO organization (id, name, mode, currency, unit_label, threshold_units, locale${chosen.column}, created_at)
              VALUES (1, 'Test Team', @mode, @currency, @unitLabel, @thresholdUnits, 'en'${chosen.value}, @createdAt)`).run({
    mode,
    currency: mode === 'credit' ? 'CAD' : null,
    unitLabel: mode === 'credit' ? 'Team credit' : 'points',
    thresholdUnits,
    ...chosen.params,
    createdAt,
  });
  const insertUser = db.prepare(`INSERT INTO users (id, username, display_name, password_hash, role, active, joined_at, created_at)
                                 VALUES (@id, @username, @displayName, @passwordHash, @role, 1, @createdAt, @createdAt)`);
  // Owners and admins have a password; team members sign in with links and have none.
  const user = (username, displayName, role) => {
    const row = { id: randomUUID(), username, displayName, role, passwordHash: role === 'member' ? null : FIXTURE_PASSWORD_HASH, createdAt };
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

export const tokenFrom = (url, kind) => new URL(url).hash.slice(`#${kind}=`.length);

/* Invites someone through the API and signs them in: a team member with their
 * sign-in link, an owner or admin by setting a password and signing in with it. */
export async function joinTeam(server, owner, { username, displayName = username, role = 'member' }) {
  const invite = await owner.request('POST', '/api/admin/invitations', { username, displayName, role });
  if (invite.status !== 201) throw new Error(`invite failed: ${invite.status} ${JSON.stringify(invite.body)}`);
  const api = client(server.base);
  await api.bootstrap();
  if (role === 'member') {
    const signedIn = await api.request('POST', '/api/signin/accept', { token: tokenFrom(invite.body.signinUrl, 'signin') });
    if (signedIn.status !== 200) throw new Error(`sign-in link failed: ${signedIn.status} ${JSON.stringify(signedIn.body)}`);
    api.csrf = signedIn.body.csrfToken;
    return { api, user: signedIn.body.user };
  }
  const accepted = await api.request('POST', '/api/invitations/accept',
    { token: tokenFrom(invite.body.invitationUrl, 'invite'), password: PASSWORD });
  if (accepted.status !== 200) throw new Error(`accept failed: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  const login = await api.request('POST', '/api/login', { username, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
  api.csrf = login.body.csrfToken;
  return { api, user: login.body.user };
}

/* A signed-in client with a real cookie, obtained through setup (and an invitation for non-owners). */
export async function authenticatedClient(t, { role = 'owner', mode = 'credit' } = {}) {
  const server = await startServer(t);
  const { api: owner, user: ownerUser } = await setupOrganization(server, { mode });
  if (role === 'owner')
    return { api: owner, db: server.db, actor: { id: ownerUser.id, role: 'owner' }, base: server.base, server, owner };
  const { api, user } = await joinTeam(server, owner, { username: `${role}.one`, role });
  return { api, db: server.db, actor: { id: user.id, role }, base: server.base, server, owner };
}

const decodeQr = jsqr.default ?? jsqr;

/* Reads a QR code picture back the way a phone camera would: pixels in, text out. */
export async function readQr(image) {
  const png = Buffer.isBuffer(image) ? image : Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // As it is drawn, dark on light: many phone cameras read no other way round.
  return decodeQr(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height,
    { inversionAttempts: 'dontInvert' })?.data ?? null;
}
