import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError } from './errors.mjs';

const derive = promisify(scrypt);
const OPTIONS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const KEY_BYTES = 64;
const SALT_BYTES = 16;

/* scrypt at these settings needs about 128 MiB per hash, so at most two run
 * at once and a short queue waits behind them; beyond that the server says
 * "busy" instead of running out of memory. */
const MAX_RUNNING = 2;
const MAX_WAITING = 16;
let running = 0;
const waiting = [];

function limited(task) {
  if (running >= MAX_RUNNING && waiting.length >= MAX_WAITING)
    return Promise.reject(new AppError(503, 'RETRY_LATER', 'Crumb is busy right now. Please try again.'));
  return new Promise((resolve, reject) => {
    const start = () => {
      running += 1;
      task().then(resolve, reject).finally(() => {
        running -= 1;
        waiting.shift()?.();
      });
    };
    if (running < MAX_RUNNING) start(); else waiting.push(start);
  });
}

export function validatePassword(password) {
  const length = typeof password === 'string' ? [...password].length : 0;
  if (length < 12 || length > 128 || !password.isWellFormed())
    throw new AppError(422, 'INVALID_PASSWORD', 'Use a password of 12 to 128 characters.', { field: 'password' });
  return password;
}

/* The same characters typed on different devices can arrive in different
 * Unicode forms; normalising first means they still match. */
const prepare = password => password.normalize('NFC');

export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(SALT_BYTES);
  const key = await limited(() => derive(prepare(password), salt, KEY_BYTES, OPTIONS));
  return ['scrypt', OPTIONS.N, OPTIONS.r, OPTIONS.p, salt.toString('hex'), key.toString('hex')].join('$');
}

function parse(encoded) {
  if (typeof encoded !== 'string') return null;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  const powerOfTwo = Number.isInteger(N) && N >= 16384 && N <= OPTIONS.N && (N & (N - 1)) === 0;
  if (!powerOfTwo || !Number.isInteger(r) || r < 1 || r > 8 || !Number.isInteger(p) || p < 1 || p > 2) return null;
  if (!/^[0-9a-f]{32}$/.test(parts[4]) || !/^[0-9a-f]{128}$/.test(parts[5])) return null;
  return { N, r, p, salt: Buffer.from(parts[4], 'hex'), key: Buffer.from(parts[5], 'hex') };
}

export const isPasswordHash = encoded => parse(encoded) !== null;

/* Compared against when the account does not exist, is inactive or has no
 * password yet, so every failed sign-in costs the same amount of work. */
export const DUMMY_HASH = ['scrypt', OPTIONS.N, OPTIONS.r, OPTIONS.p,
  randomBytes(SALT_BYTES).toString('hex'), randomBytes(KEY_BYTES).toString('hex')].join('$');

export async function verifyPassword(password, encoded) {
  const stored = parse(encoded);
  if (!stored || typeof password !== 'string' || !password.isWellFormed()) return false;
  if ([...password].length > 128) return false;
  const key = await limited(() => derive(prepare(password), stored.salt, stored.key.length,
    { N: stored.N, r: stored.r, p: stored.p, maxmem: OPTIONS.maxmem }));
  return timingSafeEqual(key, stored.key);
}
