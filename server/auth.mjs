import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIPv6 } from 'node:net';
import { AppError } from './errors.mjs';
import { writeTransaction } from './db.mjs';

export const SIGNED_IN_TTL_MS = 12 * 60 * 60 * 1000;
export const ANONYMOUS_TTL_MS = 30 * 60 * 1000;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LIMITS = { account: 5, address: 30 };

/* 32 random bytes in base64url is always 43 characters. */
const SECRET_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const newSecret = () => randomBytes(32).toString('base64url');
export const looksLikeSecret = value => typeof value === 'string' && SECRET_SHAPE.test(value);

/* The CSRF token is derived from the session token, so any tab holding the
 * cookie can ask for it again without rotating it under the other tabs. */
const csrfFor = rawToken => createHmac('sha256', rawToken).update('crumb-csrf-v1').digest('base64url');

export function sameHash(leftHex, rightHex) {
  const left = Buffer.from(leftHex, 'hex');
  const right = Buffer.from(rightHex, 'hex');
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

export const toSessionUser = row => ({
  id: row.id, username: row.username, displayName: row.display_name, role: row.role,
});

/* ---------------------------------------------------------------- sessions */

export function createSession(db, userId, clock) {
  const token = newSecret();
  const now = clock();
  const ttl = userId ? SIGNED_IN_TTL_MS : ANONYMOUS_TTL_MS;
  db.prepare(`INSERT INTO sessions (token_hash, user_id, csrf_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`)
    .run(sha256(token), userId, sha256(csrfFor(token)), new Date(now).toISOString(), new Date(now + ttl).toISOString());
  return { token, csrfToken: csrfFor(token), maxAgeSeconds: Math.floor(ttl / 1000) };
}

/* A session is only as good as its user: deactivating someone ends every
 * session they have on the next request, even before the rows are deleted. */
export function loadSession(db, rawToken, clock) {
  if (!looksLikeSecret(rawToken)) return null;
  const row = db.prepare(`SELECT s.token_hash, s.user_id, s.csrf_hash, s.expires_at,
                                 u.id, u.username, u.display_name, u.role, u.active
                          FROM sessions s LEFT JOIN users u ON u.id = s.user_id
                          WHERE s.token_hash = ?`).get(sha256(rawToken));
  if (!row || row.expires_at <= new Date(clock()).toISOString()) return null;
  if (row.user_id && row.active !== 1) return null;
  return {
    tokenHash: row.token_hash,
    csrfHash: row.csrf_hash,
    csrfToken: csrfFor(rawToken),
    user: row.user_id ? toSessionUser(row) : null,
  };
}

export const deleteSession = (db, tokenHash) => db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
export const revokeSessionsOf = (db, userId) => db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

/* ---------------------------------------------------------------- cookies */

export const cookieName = config => (config.secureCookies ? '__Host-crumb' : 'crumb');

export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

function cookie(config, value, maxAgeSeconds) {
  const parts = [`${cookieName(config)}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (config.secureCookies) parts.push('Secure');
  return parts.join('; ');
}

export const setSessionCookie = (res, config, created) => res.append('Set-Cookie', cookie(config, created.token, created.maxAgeSeconds));
export const clearSessionCookie = (res, config) => res.append('Set-Cookie', cookie(config, '', 0));

/* ---------------------------------------------------------------- middleware */

export function sessionMiddleware({ db, config, clock }) {
  return (req, res, next) => {
    req.session = loadSession(db, readCookie(req, cookieName(config)), clock);
    req.actor = req.session?.user ? { id: req.session.user.id, role: req.session.user.role } : null;
    next();
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/* Every change must come from this exact site and carry the session's CSRF
 * token — including sign-in, setup and the invitation and reset forms, which
 * run on a short anonymous session for exactly this reason. */
export function csrfMiddleware({ config }) {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.get('origin') !== config.publicOrigin)
      throw new AppError(403, 'BAD_ORIGIN', 'This request did not come from this Crumb site.');
    const token = req.get('x-csrf-token');
    if (!req.session || !looksLikeSecret(token) || !sameHash(sha256(token), req.session.csrfHash))
      throw new AppError(403, 'CSRF_FAILED', 'Your session has expired. Reload the page and try again.');
    next();
  };
}

/* ---------------------------------------------------------------- sign-in limits */

/* One IPv6 client usually holds a whole /64 and could rotate through it, so
 * those addresses count as one. IPv4 written as IPv6 is its IPv4 address. */
function clientNetwork(address) {
  const plain = String(address ?? '').split('%')[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(plain);
  if (mapped) return mapped[1];
  if (!isIPv6(plain)) return plain;
  const groups = part => (part ? part.split(':') : []).flatMap(group => {
    if (!group.includes('.')) return [group];
    const [a, b, c, d] = group.split('.').map(Number);
    return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
  });
  const [head, tail] = plain.split('::');
  const left = groups(head);
  const right = groups(tail);
  const full = (tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right])
    .map(group => parseInt(group, 16));
  // NAT64 (64:ff9b::/96) puts every translated IPv4 client in one /64; count each as its IPv4 address.
  if (full[0] === 0x64 && full[1] === 0xff9b && full.slice(2, 6).every(group => group === 0))
    return [full[6] >> 8, full[6] & 0xff, full[7] >> 8, full[7] & 0xff].join('.');
  return `${full.slice(0, 4).map(group => group.toString(16)).join(':')}::/64`;
}

export function loginBuckets(username, address) {
  return [
    { key: `account:${username.slice(0, 64)}`, limit: LOGIN_LIMITS.account },
    { key: `address:${clientNetwork(address)}`, limit: LOGIN_LIMITS.address },
  ];
}

function readBucket(db, key, now) {
  const row = db.prepare('SELECT attempts, window_start FROM login_limits WHERE bucket = ?').get(key);
  const start = row ? Date.parse(row.window_start) : now;
  if (!row || now - start >= LOGIN_WINDOW_MS) return { attempts: 0, start: now };
  return { attempts: row.attempts, start };
}

const upsertBucket = db => db.prepare(`INSERT INTO login_limits (bucket, attempts, window_start)
  VALUES (@key, @attempts, @start)
  ON CONFLICT (bucket) DO UPDATE SET attempts = excluded.attempts, window_start = excluded.window_start`);

/**
 * Counts the attempt before the password is checked, so a burst of parallel
 * guesses cannot all slip in under the limit. A successful sign-in gives the
 * attempt back (releaseLoginAttempt); a failed one keeps it.
 */
export function reserveLoginAttempt(db, buckets, clock) {
  const now = clock();
  writeTransaction(db, () => {
    const states = buckets.map(bucket => ({ ...bucket, ...readBucket(db, bucket.key, now) }));
    const waitMs = Math.max(0, ...states
      .filter(state => state.attempts >= state.limit)
      .map(state => state.start + LOGIN_WINDOW_MS - now));
    if (waitMs > 0) {
      const seconds = Math.ceil(waitMs / 1000);
      throw new AppError(429, 'TOO_MANY_ATTEMPTS',
        `Too many sign-in attempts. Try again in ${Math.ceil(seconds / 60)} minutes.`,
        { headers: { 'Retry-After': String(seconds) } });
    }
    const upsert = upsertBucket(db);
    for (const state of states)
      upsert.run({ key: state.key, attempts: state.attempts + 1, start: new Date(state.start).toISOString() });
  });
}

export function releaseLoginAttempt(db, buckets) {
  writeTransaction(db, () => {
    db.prepare('DELETE FROM login_limits WHERE bucket = ?').run(buckets[0].key);
    db.prepare('UPDATE login_limits SET attempts = max(attempts - 1, 0) WHERE bucket = ?').run(buckets[1].key);
  });
}

/* For an attempt that never got an answer (the server was busy): it was not a guess, so it does not count. */
export function refundLoginAttempt(db, buckets) {
  try {
    writeTransaction(db, () => {
      const refund = db.prepare('UPDATE login_limits SET attempts = max(attempts - 1, 0) WHERE bucket = ?');
      for (const bucket of buckets) refund.run(bucket.key);
    });
  } catch {
    // Still busy: the attempt stays counted, which errs on the safe side.
  }
}

/* Housekeeping: expired sessions and finished sign-in windows. */
export function sweepExpired(db, clock) {
  const now = clock();
  writeTransaction(db, () => {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date(now).toISOString());
    db.prepare('DELETE FROM login_limits WHERE window_start <= ?').run(new Date(now - LOGIN_WINDOW_MS).toISOString());
  });
}
