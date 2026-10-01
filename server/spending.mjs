import { AppError } from './errors.mjs';
import { writeAudit } from './audit.mjs';
import { appendEntry, balanceOf, entryView } from './ledger.mjs';
import { withIdempotency } from './idempotency.mjs';
import { requireOrg } from './org.mjs';
import { MANAGERS, freshActor, requireActor, requireRole } from './permissions.mjs';
import { MAX_UNITS, assertSameMode, assertUnits } from './units.mjs';
import { isUuid, text } from './validate.mjs';

const iso = clock => new Date(clock()).toISOString();
const readRequiredReason = text({ min: 1, max: 500, multiline: true });

export const wrongSpendingMode = () => new AppError(409, 'SPENDING_MODE',
  'This team records spending the other way. Reload the page to see the current one.');

/**
 * A member's own entry for something they took, in a team that spends on trust:
 * one negative ledger row, deducted at once, at most once per key. Never counts
 * against the collection, which only follows treats received.
 */
export function recordSpend(db, actor, { units, mode, key }, clock = () => Date.now()) {
  requireActor(actor);
  assertUnits(units);
  return withIdempotency(db, actor, 'spend.create', key, { units, mode }, current => {
    assertSameMode(db, mode);
    if (requireOrg(db).spending !== 'self') throw wrongSpendingMode();
    if (balanceOf(db, current.id).availableUnits < units)
      throw new AppError(409, 'INSUFFICIENT_BALANCE', 'That is more than the available balance.');
    const at = iso(clock);
    const row = appendEntry(db, { user_id: current.id, delta_units: -units, kind: 'spend', actor_id: current.id, request_key: key, created_at: at });
    writeAudit(db, { actorId: current.id, action: 'spend.create', targetId: row.id, detail: { units } }, at);
    return { status: 201, body: { entry: entryView(row), balance: balanceOf(db, current.id) } };
  }, { clock, authorize: () => freshActor(db, actor) }).body;
}

/* A manager's correction of a mistaken entry: one linked, opposite row. The entry stays. */
export function voidSpend(db, actor, { spendId, reason, key }, clock = () => Date.now()) {
  requireRole(actor, MANAGERS);
  const cleanReason = readRequiredReason(reason, 'reason');
  return withIdempotency(db, actor, 'spend.void', key, { spendId, reason: cleanReason }, current => {
    const source = isUuid(spendId) ? db.prepare(`SELECT * FROM ledger WHERE id = ? AND kind = 'spend'`).get(spendId) : undefined;
    if (!source) throw new AppError(404, 'ENTRY_NOT_FOUND', 'That entry does not exist.');
    if (db.prepare(`SELECT 1 FROM ledger WHERE kind = 'void' AND source_id = ?`).get(spendId))
      throw new AppError(409, 'ALREADY_CORRECTED', 'This entry has already been corrected.');
    const units = -source.delta_units;
    if (balanceOf(db, source.user_id).postedUnits + units > MAX_UNITS)
      throw new AppError(422, 'LIMIT_EXCEEDED', 'This would take the balance past the largest supported amount.');
    const at = iso(clock);
    const row = appendEntry(db, { user_id: source.user_id, delta_units: units, kind: 'void', actor_id: current.id,
      reason: cleanReason, source_id: spendId, request_key: key, created_at: at });
    writeAudit(db, { actorId: current.id, action: 'spend.void', targetId: row.id, detail: { userId: source.user_id, spendId, units } }, at);
    return { status: 200, body: { entry: entryView(row), balance: balanceOf(db, source.user_id) } };
  }, { clock, authorize: () => freshActor(db, actor, MANAGERS) }).body;
}
