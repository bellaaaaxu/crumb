import { createHash } from 'node:crypto';
import { AppError } from './errors.mjs';
import { writeTransaction } from './db.mjs';

const KEY_SHAPE = /^[\x21-\x7E]{16,128}$/;

export function assertIdempotencyKey(key) {
  if (typeof key !== 'string' || !KEY_SHAPE.test(key))
    throw new AppError(422, 'IDEMPOTENCY_KEY_REQUIRED',
      'Every change needs an Idempotency-Key header of 16 to 128 printable characters.');
  return key;
}

/* JSON with sorted keys, so the same request always hashes the same way. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

/**
 * Runs `operation` at most once per (actor, route, key).
 *
 * The lookup, the operation and the stored response share one IMMEDIATE
 * transaction: a retry that arrives while the first attempt is still running
 * waits for it and then gets its answer. A refused operation stores nothing,
 * so the same key can be used again once the problem is fixed. The same key
 * with a different request is a conflict, never a silent replay.
 *
 * `payload` must be the fixed set of fields the domain function acts on.
 * `authorize` runs first, inside the same transaction, on every call —
 * including replays — so an actor who has since been demoted, deactivated or
 * who never owned the resource gets a refusal, not a stored answer. Its
 * return value is handed to `operation`, which returns { status, body } and
 * must be synchronous.
 */
export function withIdempotency(db, actor, route, key, payload, operation, { clock = () => Date.now(), authorize } = {}) {
  assertIdempotencyKey(key);
  const requestHash = createHash('sha256').update(canonical(payload)).digest('hex');
  return writeTransaction(db, () => {
    const authorized = authorize ? authorize() : undefined;
    const stored = db.prepare(`SELECT request_hash, response_json, status_code FROM idempotency
                               WHERE actor_id = ? AND route = ? AND key = ?`).get(actor.id, route, key);
    if (stored) {
      if (stored.request_hash !== requestHash)
        throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This request key was already used for a different request.');
      return { status: stored.status_code, body: JSON.parse(stored.response_json), replayed: true };
    }
    const result = operation(authorized);
    const json = JSON.stringify(result.body);
    db.prepare(`INSERT INTO idempotency (actor_id, route, key, request_hash, response_json, status_code, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(actor.id, route, key, requestHash, json, result.status, new Date(clock()).toISOString());
    // Hand back exactly what a replay would return.
    return { status: result.status, body: JSON.parse(json), replayed: false };
  });
}
