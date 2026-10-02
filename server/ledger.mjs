import { randomUUID } from 'node:crypto';
import { AppError } from './errors.mjs';
import { writeAudit } from './audit.mjs';
import { balanceOf } from './balance.mjs';
import { collectionOf, unlockEarned } from './collections.mjs';
import { withIdempotency } from './idempotency.mjs';
import { MANAGERS, freshActor, requireRole } from './permissions.mjs';
import { MAX_UNITS, assertSameMode, assertUnits } from './units.mjs';
import { invalid, isUuid, text } from './validate.mjs';

export { balanceOf };

const iso = clock => new Date(clock()).toISOString();

export const entryView = row => ({
  id: row.id,
  userId: row.user_id,
  kind: row.kind,
  deltaUnits: row.delta_units,
  reason: row.reason,
  actorId: row.actor_id,
  sourceId: row.source_id,
  batchId: row.batch_id ?? null,
  createdAt: row.created_at,
});

const readReason = text({ max: 500, optional: true, multiline: true });
const readRequiredReason = text({ min: 1, max: 500, multiline: true });

function activeRecipient(db, userId) {
  const row = isUuid(userId) ? db.prepare('SELECT id, active FROM users WHERE id = ?').get(userId) : undefined;
  if (!row) throw new AppError(404, 'MEMBER_NOT_FOUND', 'That team member does not exist.');
  if (row.active !== 1) throw new AppError(409, 'MEMBER_INACTIVE', 'Rewards can only go to active team members.');
  return row;
}

/* The only writer of ledger rows. Callers are inside a write transaction. */
export function appendEntry(db, entry) {
  const row = { id: randomUUID(), source_id: null, reason: '', batch_id: null, ...entry };
  db.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, reason, source_id, request_key, batch_id, created_at)
              VALUES (@id, @user_id, @delta_units, @kind, @actor_id, @reason, @source_id, @request_key, @batch_id, @created_at)`).run(row);
  return row;
}

/**
 * Gives a member recognition: one ledger row, any collection unlocks it
 * earns, and an audit record — all in one transaction, at most once per key.
 * `mode` is the unit the amount was read in; the API always sends it.
 */
export function grant(db, actor, { userId, units, reason, key, mode }, clock = () => Date.now()) {
  requireRole(actor, MANAGERS);
  assertUnits(units);
  const cleanReason = readReason(reason, 'reason') ?? '';
  return withIdempotency(db, actor, 'grant.create', key, { userId, units, reason: cleanReason, mode }, current => {
    assertSameMode(db, mode);
    activeRecipient(db, userId);
    const before = balanceOf(db, userId);
    if (before.postedUnits + units > MAX_UNITS || before.lifetimeUnits + units > MAX_UNITS)
      throw new AppError(422, 'LIMIT_EXCEEDED', 'This would take the balance past the largest supported amount.');
    const at = iso(clock);
    const row = appendEntry(db, {
      user_id: userId, delta_units: units, kind: 'grant', actor_id: current.id, reason: cleanReason, request_key: key, created_at: at,
    });
    const unlocked = unlockEarned(db, userId, row.id, at);
    writeAudit(db, { actorId: current.id, action: 'grant.create', targetId: row.id, detail: { userId, units } }, at);
    return {
      status: 201,
      body: { entry: entryView(row), balance: balanceOf(db, userId), collection: collectionOf(db, userId), unlocked },
    };
  }, { clock, authorize: () => freshActor(db, actor, MANAGERS) }).body;
}

export const MAX_BATCH = 500;

/**
 * One amount to several people at once: a row, any unlocks and an audit record for each of
 * them, in one transaction that either records everyone or no one, at most once per key.
 * The list is read as a set, so the same people in another order are the same batch.
 */
export function grantBatch(db, actor, { userIds, units, reason, key, mode }, clock = () => Date.now()) {
  requireRole(actor, MANAGERS);
  assertUnits(units);
  const cleanReason = readReason(reason, 'reason') ?? '';
  if (!Array.isArray(userIds) || userIds.length === 0) throw invalid('userIds', 'Choose at least one person.');
  if (userIds.length > MAX_BATCH) throw invalid('userIds', `At most ${MAX_BATCH} people at once.`);
  if (userIds.some(id => typeof id !== 'string')) throw invalid('userIds', 'userIds must be a list of ids.');
  const people = [...new Set(userIds)].sort();
  if (people.length !== userIds.length) throw invalid('userIds', 'Each person can be listed once.');
  return withIdempotency(db, actor, 'grant.batch', key, { userIds: people, units, reason: cleanReason, mode }, current => {
    assertSameMode(db, mode);
    const at = iso(clock);
    const batchId = randomUUID();
    const entries = [];
    let unlocked = 0;
    for (const userId of people) {
      activeRecipient(db, userId);
      const before = balanceOf(db, userId);
      if (before.postedUnits + units > MAX_UNITS || before.lifetimeUnits + units > MAX_UNITS)
        throw new AppError(422, 'LIMIT_EXCEEDED', 'This would take a balance past the largest supported amount.');
      const row = appendEntry(db, {
        user_id: userId, delta_units: units, kind: 'grant', actor_id: current.id, reason: cleanReason,
        request_key: key, batch_id: batchId, created_at: at,
      });
      unlocked += unlockEarned(db, userId, row.id, at).length;
      writeAudit(db, { actorId: current.id, action: 'grant.create', targetId: row.id, detail: { userId, units, batchId } }, at);
      entries.push(entryView(row));
    }
    return { status: 201, body: { batchId, count: entries.length, units, unlocked, entries } };
  }, { clock, authorize: () => freshActor(db, actor, MANAGERS) }).body;
}

/**
 * Corrects a mistaken grant with a linked, opposite entry. The original stays
 * in the ledger; the collection keeps anything already unlocked.
 */
export function revokeGrant(db, actor, { grantId, reason, key }, clock = () => Date.now()) {
  requireRole(actor, MANAGERS);
  const cleanReason = readRequiredReason(reason, 'reason');
  return withIdempotency(db, actor, 'grant.revoke', key, { grantId, reason: cleanReason }, current => {
    const source = isUuid(grantId) ? db.prepare(`SELECT * FROM ledger WHERE id = ? AND kind = 'grant'`).get(grantId) : undefined;
    if (!source) throw new AppError(404, 'GRANT_NOT_FOUND', 'That grant does not exist.');
    if (db.prepare(`SELECT 1 FROM ledger WHERE kind = 'revoke' AND source_id = ?`).get(grantId))
      throw new AppError(409, 'ALREADY_REVOKED', 'This grant has already been revoked.');
    if (balanceOf(db, source.user_id).availableUnits < source.delta_units)
      throw new AppError(409, 'INSUFFICIENT_BALANCE',
        'Part of this grant has already been spent or is reserved for a request. Settle that first, then revoke.');
    const at = iso(clock);
    const row = appendEntry(db, {
      user_id: source.user_id, delta_units: -source.delta_units, kind: 'revoke', actor_id: current.id,
      reason: cleanReason, source_id: grantId, request_key: key, created_at: at,
    });
    writeAudit(db, { actorId: current.id, action: 'grant.revoke', targetId: row.id,
      detail: { userId: source.user_id, grantId, units: source.delta_units } }, at);
    return { status: 200, body: { entry: entryView(row), balance: balanceOf(db, source.user_id) } };
  }, { clock, authorize: () => freshActor(db, actor, MANAGERS) }).body;
}
