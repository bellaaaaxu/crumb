import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { balanceOf, grant, revokeGrant } from '../server/ledger.mjs';
import { saveReward } from '../server/rewards.mjs';
import { fixture } from './helpers.mjs';

const code = expected => error => {
  assert.equal(error.code, expected);
  return true;
};
let keys = 0;
const nextKey = () => `test-request-key-${String(++keys).padStart(4, '0')}`;

function reserve(db, userId, costUnits, status = 'pending') {
  const now = new Date().toISOString();
  const rewardId = randomUUID();
  db.prepare(`INSERT INTO rewards (id, name, description, cost_units, active, created_at, updated_at)
              VALUES (?, 'Coffee', '', ?, 1, ?, ?)`).run(rewardId, costUnits, now, now);
  const id = randomUUID();
  db.prepare(`INSERT INTO redemptions (id, user_id, reward_id, reward_name, cost_units, status, created_at, resolved_at)
              VALUES (?, ?, ?, 'Coffee', ?, ?, ?, ?)`).run(id, userId, rewardId, costUnits, status, now, status === 'pending' ? null : now);
  return id;
}

test('a retried grant creates one entry and one collection unlock', t => {
  const {db,owner,member} = fixture(t);
  const input = {userId:member.id,units:5000,reason:'Thanks for helping',key:'grant-request-0001'};
  const first = grant(db,owner,input);
  assert.deepEqual(grant(db,owner,input), first);
  assert.equal(balanceOf(db,member.id).postedUnits,5000);
  assert.equal(first.collection.length,1);
  assert.throws(() => grant(db,owner,{...input,units:10000}),
    error => error.code === 'IDEMPOTENCY_CONFLICT');
  revokeGrant(db,owner,{grantId:first.entry.id,reason:'Wrong recipient',key:'revoke-request-01'});
  assert.equal(balanceOf(db,member.id).lifetimeUnits,0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM collection_unlocks WHERE user_id=?').get(member.id).n,1);
});

test('a grant returns the entry, the new balance and what it unlocked', t => {
  const { db, owner, member } = fixture(t);
  const result = grant(db, owner, { userId: member.id, units: 5000, reason: '  Covered a shift  ', key: nextKey() });
  assert.equal(result.entry.kind, 'grant');
  assert.equal(result.entry.deltaUnits, 5000);
  assert.equal(result.entry.reason, 'Covered a shift');
  assert.equal(result.entry.actorId, owner.id);
  assert.deepEqual(result.balance, { postedUnits: 5000, reservedUnits: 0, availableUnits: 5000, lifetimeUnits: 5000 });
  assert.equal(result.unlocked.length, 1);
  assert.equal(result.unlocked[0].spriteKey, result.collection[0].spriteKey);
  const audit = db.prepare(`SELECT actor_id, target_id FROM audit WHERE action = 'grant.create'`).get();
  assert.deepEqual(audit, { actor_id: owner.id, target_id: result.entry.id });
  assert.equal(grant(db, owner, { userId: member.id, units: 1, key: nextKey() }).entry.reason, '', 'a reason is optional');
});

test('available balance subtracts pending requests; refunds never count as recognition', t => {
  const { db, owner, member } = fixture(t);
  grant(db, owner, { userId: member.id, units: 5000, reason: 'Thanks', key: nextKey() });
  const pending = reserve(db, member.id, 3000);
  assert.deepEqual(balanceOf(db, member.id), { postedUnits: 5000, reservedUnits: 3000, availableUnits: 2000, lifetimeUnits: 5000 });
  reserve(db, member.id, 1000, 'cancelled');
  assert.equal(balanceOf(db, member.id).reservedUnits, 3000, 'finished requests reserve nothing');

  const now = new Date().toISOString();
  db.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, reason, source_id, request_key, created_at)
              VALUES (?, ?, -3000, 'redeem', ?, '', ?, 'redeem-key-000001', ?)`).run(randomUUID(), member.id, owner.id, pending, now);
  db.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, reason, source_id, request_key, created_at)
              VALUES (?, ?, 3000, 'refund', ?, 'Wrong item', ?, 'refund-key-000001', ?)`).run(randomUUID(), member.id, owner.id, pending, now);
  assert.equal(balanceOf(db, member.id).lifetimeUnits, 5000);
});

test('a grant is revoked at most once, and a retry of the revoke is a replay', t => {
  const { db, owner, member } = fixture(t);
  const { entry } = grant(db, owner, { userId: member.id, units: 500, reason: 'Oops', key: nextKey() });
  const key = nextKey();
  const first = revokeGrant(db, owner, { grantId: entry.id, reason: 'Duplicate', key });
  assert.equal(first.entry.deltaUnits, -500);
  assert.equal(first.entry.sourceId, entry.id);
  assert.deepEqual(revokeGrant(db, owner, { grantId: entry.id, reason: 'Duplicate', key }), first);
  assert.throws(() => revokeGrant(db, owner, { grantId: entry.id, reason: 'Again', key: nextKey() }), code('ALREADY_REVOKED'));
  assert.throws(() => revokeGrant(db, owner, { grantId: first.entry.id, reason: 'Revoke the revoke', key: nextKey() }), code('GRANT_NOT_FOUND'));
  assert.throws(() => revokeGrant(db, owner, { grantId: randomUUID(), reason: 'Nothing', key: nextKey() }), code('GRANT_NOT_FOUND'));
  assert.equal(balanceOf(db, member.id).postedUnits, 0);
});

test('a revoke cannot take the available balance below zero', t => {
  const { db, owner, member } = fixture(t);
  const { entry } = grant(db, owner, { userId: member.id, units: 5000, reason: 'Thanks', key: nextKey() });
  const pending = reserve(db, member.id, 3000);
  assert.throws(() => revokeGrant(db, owner, { grantId: entry.id, reason: 'Wrong person', key: nextKey() }), code('INSUFFICIENT_BALANCE'));
  db.prepare(`UPDATE redemptions SET status = 'cancelled', resolved_at = ? WHERE id = ?`).run(new Date().toISOString(), pending);
  revokeGrant(db, owner, { grantId: entry.id, reason: 'Wrong person', key: nextKey() });
  assert.deepEqual(balanceOf(db, member.id), { postedUnits: 0, reservedUnits: 0, availableUnits: 0, lifetimeUnits: 0 });
});

test('a revoke needs a reason; reasons are limited to 500 characters', t => {
  const { db, owner, member } = fixture(t);
  const { entry } = grant(db, owner, { userId: member.id, units: 10, key: nextKey() });
  for (const reason of [undefined, '', '   '])
    assert.throws(() => revokeGrant(db, owner, { grantId: entry.id, reason, key: nextKey() }), code('INVALID_INPUT'));
  assert.throws(() => grant(db, owner, { userId: member.id, units: 10, reason: 'x'.repeat(501), key: nextKey() }), code('INVALID_INPUT'));
  assert.equal(grant(db, owner, { userId: member.id, units: 10, reason: '谢'.repeat(500), key: nextKey() }).entry.reason.length, 500);
});

test('units are checked by the ledger itself, not only by the API', t => {
  const { db, owner, member } = fixture(t);
  for (const units of [0, -1, 1.5, 1_000_000_000_001, '100', Number.NaN, null, undefined])
    assert.throws(() => grant(db, owner, { userId: member.id, units, key: nextKey() }), code('INVALID_AMOUNT'), String(units));
  grant(db, owner, { userId: member.id, units: 1_000_000_000_000, key: nextKey() });
  assert.throws(() => grant(db, owner, { userId: member.id, units: 1, key: nextKey() }), code('LIMIT_EXCEEDED'));
});

test('only active members receive rewards, and only managers grant them', t => {
  const { db, owner, member, member2 } = fixture(t);
  db.prepare(`UPDATE users SET active = 0, deactivated_at = ? WHERE id = ?`).run(new Date().toISOString(), member2.id);
  assert.throws(() => grant(db, owner, { userId: member2.id, units: 10, key: nextKey() }), code('MEMBER_INACTIVE'));
  assert.throws(() => grant(db, owner, { userId: randomUUID(), units: 10, key: nextKey() }), code('MEMBER_NOT_FOUND'));
  assert.throws(() => grant(db, owner, { userId: 'not-a-uuid', units: 10, key: nextKey() }), code('MEMBER_NOT_FOUND'));
  assert.throws(() => grant(db, member, { userId: member.id, units: 10, key: nextKey() }), code('FORBIDDEN'));
  const { entry } = grant(db, owner, { userId: member.id, units: 10, key: nextKey() });
  assert.throws(() => revokeGrant(db, member, { grantId: entry.id, reason: 'mine', key: nextKey() }), code('FORBIDDEN'));
});

test('idempotency keys are 16 to 128 printable ASCII characters', t => {
  const { db, owner, member } = fixture(t);
  for (const key of [undefined, '', 'short-key', 'x'.repeat(129), 'has a space in the key', 'ключ-ключ-ключ-ключ', 'tab\tinside-the-key-0'])
    assert.throws(() => grant(db, owner, { userId: member.id, units: 10, key }), code('IDEMPOTENCY_KEY_REQUIRED'), String(key));
  grant(db, owner, { userId: member.id, units: 10, key: 'x'.repeat(128) });
  grant(db, owner, { userId: member.id, units: 10, key: randomUUID() });
});

test('a key belongs to one actor and one route', t => {
  const { db, owner, member, member2 } = fixture(t);
  db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(member2.id);
  const admin = { id: member2.id, role: 'admin' };
  const shared = 'shared-request-key-01';
  const a = grant(db, owner, { userId: member.id, units: 100, reason: 'From the owner', key: shared });
  const b = grant(db, admin, { userId: member.id, units: 100, reason: 'From the admin', key: shared });
  assert.notEqual(a.entry.id, b.entry.id);
  revokeGrant(db, owner, { grantId: a.entry.id, reason: 'Same key, other route', key: shared });
  assert.equal(balanceOf(db, member.id).postedUnits, 100);
});

test('a refused operation stores nothing, so the same key works once the problem is fixed', t => {
  const { db, owner, member } = fixture(t);
  db.prepare(`UPDATE users SET active = 0, deactivated_at = ? WHERE id = ?`).run(new Date().toISOString(), member.id);
  const input = { userId: member.id, units: 250, reason: 'Welcome back', key: 'retry-after-fix-0001' };
  assert.throws(() => grant(db, owner, input), code('MEMBER_INACTIVE'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM idempotency').get().n, 0);
  db.prepare(`UPDATE users SET active = 1, deactivated_at = NULL WHERE id = ?`).run(member.id);
  assert.equal(grant(db, owner, input).balance.postedUnits, 250);
});

test('an amount parsed for one reward type is refused if the type changed meanwhile', t => {
  const { db, owner, member } = fixture(t);
  assert.throws(() => grant(db, owner, { userId: member.id, units: 1250, reason: '', key: nextKey(), mode: 'points' }),
    code('RULES_CHANGED'));
  assert.throws(() => saveReward(db, owner, { name: 'Coffee', costUnits: 1250, mode: 'points', active: true }), code('RULES_CHANGED'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM ledger').get().n + db.prepare('SELECT count(*) AS n FROM rewards').get().n, 0);
  assert.equal(grant(db, owner, { userId: member.id, units: 1250, reason: '', key: nextKey(), mode: 'credit' }).entry.deltaUnits, 1250);
  assert.equal(saveReward(db, owner, { name: 'Coffee', costUnits: 1250, mode: 'credit', active: true }).costUnits, 1250);
});
