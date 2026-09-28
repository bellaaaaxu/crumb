import express from 'express';
import { AppError } from '../errors.mjs';
import { grant, revokeGrant } from '../ledger.mjs';
import { listRewards, saveReward } from '../rewards.mjs';
import { refundRedemption, requestRedemption, resolveRedemption } from '../redemptions.mjs';
import { MANAGERS, requireActor, requireRole } from '../permissions.mjs';
import { parseUnits } from '../units.mjs';
import { amount, invalid, isUuid, oneOf, readObject } from '../validate.mjs';
import { readQuery } from './read-models.mjs';

/* Field is present; its content is checked by the domain function. */
const any = () => value => value;
const required = () => (value, field) => {
  if (value === undefined) throw invalid(field, `${field} is required.`);
  return value;
};
/* The unit the person typed the amount in, as their page showed it. */
const mode = ({ optional = false } = {}) => oneOf(['credit', 'points'], { optional });
const idempotencyKey = req => req.get('Idempotency-Key');

/* Routes only check shape, turn amounts into units in the mode the client
 * says it used (the domain refuses the write if that is no longer the
 * organization's mode), and call the domain. Permissions are checked first,
 * so a member learns nothing from a malformed body. */
export function rewardRoutes({ db, clock }) {
  const router = express.Router();

  router.get('/rewards', (req, res) => {
    requireActor(req.actor);
    readQuery(req.query, []);
    res.json({ items: listRewards(db) });
  });

  router.get('/admin/rewards', (req, res) => {
    requireRole(req.actor, MANAGERS);
    readQuery(req.query, []);
    res.json({ items: listRewards(db, { includeInactive: true }) });
  });

  function rewardInput(req, { editing }) {
    const body = readObject(req.body, {
      name: any(), description: any(), amount: amount({ optional: editing }), mode: mode({ optional: true }), active: any(),
    });
    const input = { name: body.name, description: body.description, active: body.active, mode: body.mode };
    if (body.amount !== undefined) {
      if (body.mode === undefined) throw invalid('mode', 'mode is required with an amount.');
      input.costUnits = parseUnits(body.amount, body.mode);
    }
    for (const key of Object.keys(input)) if (input[key] === undefined) delete input[key];
    return input;
  }

  router.post('/admin/rewards', (req, res) => {
    requireRole(req.actor, MANAGERS);
    res.status(201).json(saveReward(db, req.actor, rewardInput(req, { editing: false }), clock));
  });

  router.patch('/admin/rewards/:id', (req, res) => {
    requireRole(req.actor, MANAGERS);
    if (!isUuid(req.params.id)) throw new AppError(404, 'REWARD_NOT_FOUND', 'That benefit does not exist.');
    res.json(saveReward(db, req.actor, { id: req.params.id, ...rewardInput(req, { editing: true }) }, clock));
  });

  router.post('/admin/grants', (req, res) => {
    requireRole(req.actor, MANAGERS);
    const body = readObject(req.body, { userId: any(), amount: amount(), mode: mode(), reason: any() });
    const units = parseUnits(body.amount, body.mode);
    res.status(201).json(grant(db, req.actor,
      { userId: body.userId, units, mode: body.mode, reason: body.reason, key: idempotencyKey(req) }, clock));
  });

  router.post('/admin/grants/:id/revoke', (req, res) => {
    requireRole(req.actor, MANAGERS);
    const body = readObject(req.body, { reason: any() });
    res.json(revokeGrant(db, req.actor, { grantId: req.params.id, reason: body.reason, key: idempotencyKey(req) }, clock));
  });

  router.post('/redemptions', (req, res) => {
    requireActor(req.actor);
    // The price the member was shown travels with the request, so a price
    // change they have not seen yet refuses the request instead of charging it.
    const body = readObject(req.body, { rewardId: any(), expectedCostUnits: required() });
    res.status(201).json(requestRedemption(db, req.actor,
      { rewardId: body.rewardId, expectedCostUnits: body.expectedCostUnits, key: idempotencyKey(req) }, clock));
  });

  router.post('/redemptions/:id/cancel', (req, res) => {
    requireActor(req.actor);
    readObject(req.body ?? {}, {});
    res.json(resolveRedemption(db, req.actor,
      { redemptionId: req.params.id, action: 'cancel', key: idempotencyKey(req) }, clock));
  });

  router.post('/admin/redemptions/:id/complete', (req, res) => {
    requireRole(req.actor, MANAGERS);
    readObject(req.body ?? {}, {});
    res.json(resolveRedemption(db, req.actor,
      { redemptionId: req.params.id, action: 'complete', key: idempotencyKey(req) }, clock));
  });

  router.post('/admin/redemptions/:id/reject', (req, res) => {
    requireRole(req.actor, MANAGERS);
    const body = readObject(req.body ?? {}, { reason: any() });
    res.json(resolveRedemption(db, req.actor,
      { redemptionId: req.params.id, action: 'reject', reason: body.reason, key: idempotencyKey(req) }, clock));
  });

  router.post('/admin/redemptions/:id/refund', (req, res) => {
    requireRole(req.actor, MANAGERS);
    const body = readObject(req.body, { reason: any() });
    res.json(refundRedemption(db, req.actor,
      { redemptionId: req.params.id, reason: body.reason, key: idempotencyKey(req) }, clock));
  });

  return router;
}
