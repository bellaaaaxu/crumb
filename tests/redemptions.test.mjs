import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { balanceOf, grant } from '../server/ledger.mjs';
import { saveReward } from '../server/rewards.mjs';
import { refundRedemption, requestRedemption, resolveRedemption } from '../server/redemptions.mjs';
import { collectionOf } from '../server/collections.mjs';
import { updateMember } from '../server/members.mjs';
import { fixture } from './helpers.mjs';

const code = expected => error => {
  assert.equal(error.code, expected);
  return true;
};
let keys = 0;
const nextKey = () => `redeem-test-key-${String(++keys).padStart(4, '0')}`;
const ledgerRows = (db, userId) => db.prepare('SELECT kind, delta_units FROM ledger WHERE user_id = ? ORDER BY created_at, rowid').all(userId);

function funded(t, units = 5000) {
  const setup = fixture(t);
  grant(setup.db, setup.owner, { userId: setup.member.id, units, reason: 'Thanks', key: nextKey() });
  const reward = saveReward(setup.db, setup.owner, { name: 'Coffee', description: 'One drink', costUnits: 3000, active: true });
  return { ...setup, reward };
}

test('reservation, completion and retry use one debit', t => {
  const {db,owner,member} = fixture(t);
  grant(db,owner,{userId:member.id,units:5000,reason:'Thanks',key:'grant-request-0001'});
  const reward = saveReward(db,owner,{name:'Coffee',description:'One drink',costUnits:3000,active:true});
  const pending = requestRedemption(db,member,{rewardId:reward.id,key:'redeem-request-01'});
  assert.equal(pending.balance.availableUnits,2000);
  const input = {redemptionId:pending.redemption.id,action:'complete',key:'complete-request-01'};
  const result = resolveRedemption(db,owner,input);
  assert.deepEqual(resolveRedemption(db,owner,input),result);
  assert.equal(balanceOf(db,member.id).postedUnits,2000);
  assert.equal(balanceOf(db,member.id).reservedUnits,0);
});

test('a request freezes the name and price; completing it keeps the collection', t => {
  const { db, owner, member, reward } = funded(t);
  const { redemption } = requestRedemption(db, member, { rewardId: reward.id, key: nextKey() });
  assert.equal(redemption.status, 'pending');
  assert.equal(redemption.rewardName, 'Coffee');
  assert.equal(redemption.costUnits, 3000);
  saveReward(db, owner, { id: reward.id, name: 'Large coffee', costUnits: 4500 });
  const done = resolveRedemption(db, owner, { redemptionId: redemption.id, action: 'complete', key: nextKey() });
  assert.equal(done.redemption.rewardName, 'Coffee');
  assert.equal(done.redemption.costUnits, 3000);
  assert.equal(done.redemption.status, 'completed');
  assert.equal(done.redemption.resolvedBy, owner.id);
  assert.deepEqual(done.balance, { postedUnits: 2000, reservedUnits: 0, availableUnits: 2000, lifetimeUnits: 5000 });
  assert.deepEqual(ledgerRows(db, member.id), [{ kind: 'grant', delta_units: 5000 }, { kind: 'redeem', delta_units: -3000 }]);
  assert.equal(collectionOf(db, member.id).length, 1);
});

test('cancelling or rejecting only releases the reservation', t => {
  const { db, owner, member, reward } = funded(t);
  const first = requestRedemption(db, member, { rewardId: reward.id, key: nextKey() });
  const cancelled = resolveRedemption(db, member, { redemptionId: first.redemption.id, action: 'cancel', key: nextKey() });
  assert.equal(cancelled.redemption.status, 'cancelled');
  assert.equal(cancelled.balance.availableUnits, 5000);

  const second = requestRedemption(db, member, { rewardId: reward.id, key: nextKey() });
  const rejected = resolveRedemption(db, owner,
    { redemptionId: second.redemption.id, action: 'reject', reason: 'Machine is broken this week', key: nextKey() });
  assert.equal(rejected.redemption.status, 'rejected');
  assert.equal(rejected.redemption.reason, 'Machine is broken this week');
  assert.equal(rejected.balance.availableUnits, 5000);
  assert.deepEqual(ledgerRows(db, member.id), [{ kind: 'grant', delta_units: 5000 }]);
});

test('finished requests stay finished', t => {
  const { db, owner, member, reward } = funded(t);
  const { redemption } = requestRedemption(db, member, { rewardId: reward.id, key: nextKey() });
  resolveRedemption(db, owner, { redemptionId: redemption.id, action: 'complete', key: nextKey() });
  for (const action of ['complete', 'reject'])
    assert.throws(() => resolveRedemption(db, owner, { redemptionId: redemption.id, action, key: nextKey() }), code('INVALID_STATE'));
  assert.throws(() => resolveRedemption(db, member, { redemptionId: redemption.id, action: 'cancel', key: nextKey() }), code('INVALID_STATE'));
  assert.throws(() => resolveRedemption(db, owner, { redemptionId: redemption.id, action: 'undo', key: nextKey() }), code('INVALID_INPUT'));
  assert.equal(balanceOf(db, member.id).postedUnits, 2000);
});

test('a completed request can be refunded once; the refund is not recognition', t => {
  const { db, owner, member, reward } = funded(t);
  const { redemption } = requestRedemption(db, member, { rewardId: reward.id, key: nextKey() });
  assert.throws(() => refundRedemption(db, owner, { redemptionId: redemption.id, reason: 'Too early', key: nextKey() }), code('INVALID_STATE'));
  resolveRedemption(db, owner, { redemptionId: redemption.id, action: 'complete', key: nextKey() });
  assert.throws(() => refundRedemption(db, owner, { redemptionId: redemption.id, reason: '', key: nextKey() }), code('INVALID_INPUT'));
  const key = nextKey();
  const refund = refundRedemption(db, owner, { redemptionId: redemption.id, reason: 'Confirmed by mistake', key });
  assert.equal(refund.redemption.status, 'completed');
  assert.equal(refund.redemption.refunded, true);
  assert.deepEqual(refund.balance, { postedUnits: 5000, reservedUnits: 0, availableUnits: 5000, lifetimeUnits: 5000 });
  assert.deepEqual(refundRedemption(db, owner, { redemptionId: redemption.id, reason: 'Confirmed by mistake', key }), refund);
  assert.throws(() => refundRedemption(db, owner, { redemptionId: redemption.id, reason: 'Again', key: nextKey() }), code('ALREADY_REFUNDED'));
  assert.equal(collectionOf(db, member.id).length, 1, 'a refund unlocks nothing');
  assert.deepEqual(ledgerRows(db, member.id).map(row => row.kind), ['grant', 'redeem', 'refund']);
});

test('members act only on their own requests; confirming and refunding are for managers', t => {
  const { db, owner, member, member2, reward } = funded(t);
  grant(db, owner, { userId: member2.id, units: 5000, reason: 'Thanks', key: nextKey() });
  const { redemption } = requestRedemption(db, member, { rewardId: reward.id, key: nextKey() });
  assert.throws(() => resolveRedemption(db, member2, { redemptionId: redemption.id, action: 'cancel', key: nextKey() }), code('REDEMPTION_NOT_FOUND'));
  assert.throws(() => resolveRedemption(db, member, { redemptionId: redemption.id, action: 'complete', key: nextKey() }), code('FORBIDDEN'));
  assert.throws(() => resolveRedemption(db, member, { redemptionId: redemption.id, action: 'reject', key: nextKey() }), code('FORBIDDEN'));
  assert.throws(() => refundRedemption(db, member, { redemptionId: redemption.id, reason: 'Please', key: nextKey() }), code('FORBIDDEN'));
  assert.throws(() => resolveRedemption(db, owner, { redemptionId: randomUUID(), action: 'complete', key: nextKey() }), code('REDEMPTION_NOT_FOUND'));
  // A manager may cancel on someone's behalf.
  const cancelled = resolveRedemption(db, owner, { redemptionId: redemption.id, action: 'cancel', key: nextKey() });
  assert.equal(cancelled.redemption.resolvedBy, owner.id);
});

test('requests need an active account, an open benefit and enough available balance', t => {
  const { db, owner, member, member2, reward } = funded(t);
  const closed = saveReward(db, owner, { name: 'Retired perk', description: '', costUnits: 100, active: false });
  assert.throws(() => requestRedemption(db, member, { rewardId: closed.id, key: nextKey() }), code('REWARD_UNAVAILABLE'));
  assert.throws(() => requestRedemption(db, member, { rewardId: randomUUID(), key: nextKey() }), code('REWARD_NOT_FOUND'));
  assert.throws(() => requestRedemption(db, member2, { rewardId: reward.id, key: nextKey() }), code('INSUFFICIENT_BALANCE'));
  requestRedemption(db, member, { rewardId: reward.id, key: nextKey() });
  assert.throws(() => requestRedemption(db, member, { rewardId: reward.id, key: nextKey() }), code('INSUFFICIENT_BALANCE'));
  updateMember(db, owner, member.id, { active: false });
  assert.throws(() => requestRedemption(db, member, { rewardId: reward.id, key: nextKey() }), code('ACCOUNT_INACTIVE'));
  assert.equal(db.prepare(`SELECT count(*) AS n FROM redemptions WHERE user_id = ? AND status = 'pending'`).get(member.id).n, 0);
  assert.equal(balanceOf(db, member.id).availableUnits, 5000);
});

test('the catalog is edited by managers with validated fields', t => {
  const { db, owner, member } = fixture(t);
  assert.throws(() => saveReward(db, member, { name: 'Free lunch', description: '', costUnits: 10, active: true }), code('FORBIDDEN'));
  assert.throws(() => saveReward(db, owner, { name: '', description: '', costUnits: 10, active: true }), code('INVALID_INPUT'));
  assert.throws(() => saveReward(db, owner, { name: 'x'.repeat(81), description: '', costUnits: 10, active: true }), code('INVALID_INPUT'));
  assert.throws(() => saveReward(db, owner, { name: 'Lunch', description: 'x'.repeat(501), costUnits: 10, active: true }), code('INVALID_INPUT'));
  assert.throws(() => saveReward(db, owner, { name: 'Lunch', description: '', costUnits: 0, active: true }), code('INVALID_AMOUNT'));
  assert.throws(() => saveReward(db, owner, { name: 'Lunch', description: '', costUnits: 10, active: 'yes' }), code('INVALID_INPUT'));
  assert.throws(() => saveReward(db, owner, { name: 'Lunch', description: '', costUnits: 10, active: true, stock: 5 }), code('UNKNOWN_FIELD'));
  assert.throws(() => saveReward(db, owner, { id: randomUUID(), name: 'Ghost' }), code('REWARD_NOT_FOUND'));
  const lunch = saveReward(db, owner, { name: '  Team lunch ', description: 'Up to one meal', costUnits: 2500, active: true });
  assert.deepEqual({ name: lunch.name, costUnits: lunch.costUnits, active: lunch.active }, { name: 'Team lunch', costUnits: 2500, active: true });
  const hidden = saveReward(db, owner, { id: lunch.id, active: false });
  assert.equal(hidden.active, false);
  assert.equal(hidden.name, 'Team lunch');
});

test('every transition is audited with who did it', t => {
  const { db, owner, member, reward } = funded(t);
  const { redemption } = requestRedemption(db, member, { rewardId: reward.id, key: nextKey() });
  resolveRedemption(db, owner, { redemptionId: redemption.id, action: 'complete', key: nextKey() });
  refundRedemption(db, owner, { redemptionId: redemption.id, reason: 'Oops', key: nextKey() });
  const actions = db.prepare(`SELECT action, actor_id FROM audit WHERE target_id = ? ORDER BY created_at, rowid`).all(redemption.id);
  assert.deepEqual(actions, [
    { action: 'redemption.request', actor_id: member.id },
    { action: 'redemption.complete', actor_id: owner.id },
    { action: 'redemption.refund', actor_id: owner.id },
  ]);
});

test('a replayed request is authorized again before its stored answer is returned', t => {
  const { db, owner, member, member2, reward } = funded(t);
  updateMember(db, owner, member2.id, { role: 'admin' });
  const admin = { id: member2.id, role: 'admin' };
  const requestKey = nextKey();
  const { redemption } = requestRedemption(db, member, { rewardId: reward.id, key: requestKey });
  const cancelKey = nextKey();
  resolveRedemption(db, admin, { redemptionId: redemption.id, action: 'cancel', key: cancelKey });
  const grantInput = { userId: member.id, units: 100, reason: 'Replay me', key: nextKey() };
  grant(db, admin, grantInput);
  updateMember(db, owner, member2.id, { role: 'member' });
  // Demoted: replaying an old key must not hand back someone else's request…
  assert.throws(() => resolveRedemption(db, { id: member2.id, role: 'member' }, { redemptionId: redemption.id, action: 'cancel', key: cancelKey }),
    code('REDEMPTION_NOT_FOUND'));
  // …and a stale actor object that still claims to be an admin gets nothing either.
  assert.throws(() => grant(db, admin, grantInput), code('FORBIDDEN'));
  updateMember(db, owner, member.id, { active: false });
  // A member who has left cannot replay their own request to read it back.
  assert.throws(() => requestRedemption(db, member, { rewardId: reward.id, key: requestKey }), code('ACCOUNT_INACTIVE'));
});

test('a request is refused if the price changed after the member saw it', t => {
  const { db, owner, member, reward } = funded(t);
  saveReward(db, owner, { id: reward.id, name: 'Team lunch', costUnits: 4500 });
  assert.throws(() => requestRedemption(db, member, { rewardId: reward.id, expectedCostUnits: 3000, key: nextKey() }),
    code('PRICE_CHANGED'));
  assert.equal(balanceOf(db, member.id).reservedUnits, 0);
  const ok = requestRedemption(db, member, { rewardId: reward.id, expectedCostUnits: 4500, key: nextKey() });
  assert.equal(ok.redemption.costUnits, 4500);
});
