/**
 * A member's balance, computed from the ledger every time — there is no
 * stored balance to drift out of step.
 *
 *   posted     sum of every ledger row
 *   reserved   total of pending requests
 *   available  posted − reserved: what can be spent or revoked right now
 *   lifetime   grants minus revokes: the recognition that unlocks the
 *              collection; spending and refunds never change it
 *
 * Both queries run in one read transaction so they see the same snapshot.
 */
export function balanceOf(db, userId) {
  return db.transaction(() => {
    const ledger = db.prepare(`SELECT COALESCE(SUM(delta_units), 0) AS posted_units,
        COALESCE(SUM(CASE WHEN kind IN ('grant', 'revoke') THEN delta_units ELSE 0 END), 0) AS lifetime_units
      FROM ledger WHERE user_id = ?`).get(userId);
    const { reserved_units: reservedUnits } = db.prepare(`SELECT COALESCE(SUM(cost_units), 0) AS reserved_units
      FROM redemptions WHERE user_id = ? AND status = 'pending'`).get(userId);
    return {
      postedUnits: ledger.posted_units,
      reservedUnits,
      availableUnits: ledger.posted_units - reservedUnits,
      lifetimeUnits: ledger.lifetime_units,
    };
  })();
}
