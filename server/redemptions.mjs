import { randomUUID } from 'node:crypto';
import { AppError } from './errors.mjs';
import { writeAudit } from './audit.mjs';
import { appendEntry, balanceOf } from './ledger.mjs';
import { withIdempotency } from './idempotency.mjs';
import { MANAGERS, freshActor, requireActor, requireRole } from './permissions.mjs';
import { MAX_UNITS, assertUnits } from './units.mjs';
import { invalid, isUuid, text } from './validate.mjs';

/* pending → completed | cancelled | rejected, once. Nothing moves back. */
const NEXT_STATUS = { complete: 'completed', cancel: 'cancelled', reject: 'rejected' };
const readReason = text({ max: 500, optional: true, multiline: true });
const readRequiredReason = text({ min: 1, max: 500, multiline: true });
const iso = clock => new Date(clock()).toISOString();
const notFound = () => new AppError(404, 'REDEMPTION_NOT_FOUND', 'That request does not exist.');

export const redemptionView = row => ({
  id: row.id,
  userId: row.user_id,
  rewardId: row.reward_id,
  rewardName: row.reward_name,
  costUnits: row.cost_units,
  status: row.status,
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
  resolvedBy: row.resolved_by,
  reason: row.resolution_reason,
  refunded: row.refunded === 1,
});

export const REDEMPTION_COLUMNS = `r.*, EXISTS (SELECT 1 FROM ledger l WHERE l.kind = 'refund' AND l.source_id = r.id) AS refunded`;

function loadRedemption(db, redemptionId) {
  const row = isUuid(redemptionId)
    ? db.prepare(`SELECT ${REDEMPTION_COLUMNS} FROM redemptions r WHERE r.id = ?`).get(redemptionId)
    : undefined;
  if (!row) throw notFound();
  return row;
}

/**
 * A member asks for a benefit. The price is reserved, not spent: the check
 * of the available balance and the new pending row happen in one IMMEDIATE
 * transaction, so two devices cannot both spend the same balance, and a
 * deactivation that commits first makes this fail. `expectedCostUnits` is
 * the price the member was shown (the API always sends it): if a manager
 * changed the price since, nothing is reserved.
 */
export function requestRedemption(db, actor, { rewardId, expectedCostUnits, key }, clock = () => Date.now()) {
  requireActor(actor);
  if (expectedCostUnits !== undefined) assertUnits(expectedCostUnits);
  return withIdempotency(db, actor, 'redemption.create', key, { rewardId, expectedCostUnits }, current => {
    const reward = isUuid(rewardId) ? db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId) : undefined;
    if (!reward) throw new AppError(404, 'REWARD_NOT_FOUND', 'That benefit does not exist.');
    if (reward.active !== 1) throw new AppError(409, 'REWARD_UNAVAILABLE', 'This benefit is not available right now.');
    if (expectedCostUnits !== undefined && reward.cost_units !== expectedCostUnits)
      throw new AppError(409, 'PRICE_CHANGED', 'The price of this benefit has changed. Check the new price before asking again.');
    if (balanceOf(db, current.id).availableUnits < reward.cost_units)
      throw new AppError(409, 'INSUFFICIENT_BALANCE', 'There is not enough available balance for this benefit.');
    const at = iso(clock);
    const id = randomUUID();
    db.prepare(`INSERT INTO redemptions (id, user_id, reward_id, reward_name, cost_units, status, created_at)
                VALUES (?, ?, ?, ?, ?, 'pending', ?)`).run(id, current.id, reward.id, reward.name, reward.cost_units, at);
    writeAudit(db, { actorId: current.id, action: 'redemption.request', targetId: id,
      detail: { rewardId: reward.id, costUnits: reward.cost_units } }, at);
    return { status: 201, body: { redemption: redemptionView(loadRedemption(db, id)), balance: balanceOf(db, current.id) } };
  }, { clock, authorize: () => freshActor(db, actor) }).body;
}

/**
 * Moves a pending request to its final state. Completing it (a manager
 * confirming the benefit was handed over) posts the debit at the snapshot
 * price in the same transaction that releases the reservation. Cancelling
 * or rejecting only releases the reservation.
 */
export function resolveRedemption(db, actor, { redemptionId, action, reason, key }, clock = () => Date.now()) {
  if (!Object.hasOwn(NEXT_STATUS, action)) throw invalid('action', 'Action must be complete, cancel or reject.');
  if (action === 'cancel') requireActor(actor); else requireRole(actor, MANAGERS);
  const cleanReason = readReason(reason, 'reason') ?? '';
  // Runs on every call, replays included: someone demoted since the first
  // attempt must not be handed back a request that is not theirs.
  const authorize = () => {
    const current = freshActor(db, actor, action === 'cancel' ? undefined : MANAGERS);
    const request = loadRedemption(db, redemptionId);
    // Members may only cancel their own; someone else's request looks like it does not exist.
    if (!MANAGERS.includes(current.role) && request.user_id !== current.id) throw notFound();
    return { current, request };
  };
  return withIdempotency(db, actor, `redemption.${action}`, key, { redemptionId, reason: cleanReason }, ({ current, request }) => {
    const at = iso(clock);
    const moved = db.prepare(`UPDATE redemptions SET status = @status, resolved_at = @at, resolved_by = @by,
                                resolution_reason = @reason WHERE id = @id AND status = 'pending'`)
      .run({ status: NEXT_STATUS[action], at, by: current.id, reason: cleanReason, id: request.id });
    if (moved.changes !== 1) throw new AppError(409, 'INVALID_STATE', `This request is already ${request.status}.`);
    if (action === 'complete') {
      appendEntry(db, { user_id: request.user_id, delta_units: -request.cost_units, kind: 'redeem',
        actor_id: current.id, source_id: request.id, request_key: key, created_at: at });
    }
    writeAudit(db, { actorId: current.id, action: `redemption.${action}`, targetId: request.id,
      detail: { userId: request.user_id, costUnits: request.cost_units } }, at);
    return { status: 200, body: { redemption: redemptionView(loadRedemption(db, request.id)), balance: balanceOf(db, request.user_id) } };
  }, { clock, authorize }).body;
}

/**
 * For a request confirmed by mistake: one linked refund entry gives the
 * amount back. The request stays "completed" (it did happen) and is marked
 * refunded; refunds never count as recognition, so nothing unlocks.
 */
export function refundRedemption(db, actor, { redemptionId, reason, key }, clock = () => Date.now()) {
  requireRole(actor, MANAGERS);
  const cleanReason = readRequiredReason(reason, 'reason');
  return withIdempotency(db, actor, 'redemption.refund', key, { redemptionId, reason: cleanReason }, current => {
    const request = loadRedemption(db, redemptionId);
    if (request.status !== 'completed') throw new AppError(409, 'INVALID_STATE', 'Only a completed request can be refunded.');
    if (request.refunded === 1) throw new AppError(409, 'ALREADY_REFUNDED', 'This request has already been refunded.');
    if (balanceOf(db, request.user_id).postedUnits + request.cost_units > MAX_UNITS)
      throw new AppError(422, 'LIMIT_EXCEEDED', 'This would take the balance past the largest supported amount.');
    const at = iso(clock);
    appendEntry(db, { user_id: request.user_id, delta_units: request.cost_units, kind: 'refund',
      actor_id: current.id, reason: cleanReason, source_id: request.id, request_key: key, created_at: at });
    writeAudit(db, { actorId: current.id, action: 'redemption.refund', targetId: request.id,
      detail: { userId: request.user_id, costUnits: request.cost_units } }, at);
    return { status: 200, body: { redemption: redemptionView(loadRedemption(db, request.id)), balance: balanceOf(db, request.user_id) } };
  }, { clock, authorize: () => freshActor(db, actor, MANAGERS) }).body;
}
