import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { balanceOf, grant, grantBatch } from '../server/ledger.mjs';
import { collectionOf } from '../server/collections.mjs';
import { updateMember } from '../server/members.mjs';
import { recordSpend } from '../server/spending.mjs';
import { MAX_UNITS } from '../server/units.mjs';
import { fixture } from './helpers.mjs';

const code = expected => error => {
  assert.equal(error.code, expected);
  return true;
};
let keys = 0;
const nextKey = () => `batch-test-key-${String(++keys).padStart(4, '0')}`;

test('one amount to several people: one row and one unlock each, one batch id, one audit row each', t => {
  const { db, owner, member, member2 } = fixture(t);
  const key = nextKey();
  const result = grantBatch(db, owner, { userIds: [member2.id, member.id], units: 5000, reason: 'Mid-Autumn', mode: 'credit', key });
  assert.equal(result.count, 2);
  assert.equal(result.units, 5000);
  assert.equal(result.unlocked, 2);
  assert.match(result.batchId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(result.entries.map(entry => entry.userId).sort(), [member.id, member2.id].sort());
  for (const entry of result.entries) {
    assert.equal(entry.batchId, result.batchId);
    assert.equal(entry.reason, 'Mid-Autumn');
  }
  assert.equal(balanceOf(db, member.id).availableUnits, 5000);
  assert.equal(balanceOf(db, member2.id).availableUnits, 5000);
  assert.equal(collectionOf(db, member.id).length, 1);
  assert.equal(collectionOf(db, member2.id).length, 1);
  assert.deepEqual(grantBatch(db, owner, { userIds: [member.id, member2.id], units: 5000, reason: 'Mid-Autumn', mode: 'credit', key }), result,
    'the same people in another order with the same key is the same batch');
  const audits = db.prepare(`SELECT detail_json FROM audit WHERE action = 'grant.create'`).all().map(row => JSON.parse(row.detail_json));
  assert.equal(audits.length, 2);
  assert.ok(audits.every(detail => detail.batchId === result.batchId && detail.units === 5000));
});

test('a batch is all or nothing', t => {
  const { db, owner, member, member2 } = fixture(t);
  updateMember(db, owner, member2.id, { active: false });
  assert.throws(() => grantBatch(db, owner, { userIds: [member.id, member2.id], units: 100, reason: '', mode: 'credit', key: nextKey() }), code('MEMBER_INACTIVE'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM ledger').get().n, 0);
  // People are written in sorted order; this id sorts after any other, so Mina's row is written
  // before the refusal and the count below shows it was rolled back.
  const lastId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
  assert.throws(() => grantBatch(db, owner, { userIds: [member.id, lastId], units: 100, reason: '', mode: 'credit', key: nextKey() }), code('MEMBER_NOT_FOUND'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM ledger').get().n, 0);
  assert.throws(() => grantBatch(db, owner, { userIds: [], units: 100, reason: '', mode: 'credit', key: nextKey() }), code('INVALID_INPUT'));
  assert.throws(() => grantBatch(db, owner, { userIds: [member.id, member.id], units: 100, reason: '', mode: 'credit', key: nextKey() }), code('INVALID_INPUT'));
  assert.throws(() => grantBatch(db, owner, { userIds: Array.from({ length: 501 }, () => randomUUID()), units: 100, reason: '', mode: 'credit', key: nextKey() }), code('INVALID_INPUT'));
  assert.throws(() => grantBatch(db, member, { userIds: [member.id], units: 100, reason: '', mode: 'credit', key: nextKey() }), code('FORBIDDEN'));
  assert.equal(db.prepare('SELECT count(*) AS n FROM ledger').get().n, 0);
});

test('a batch is read in the team\'s unit, and checked against the supported amounts', t => {
  const { db, owner, member, member2 } = fixture(t);
  const batch = (units, mode = 'credit') => () =>
    grantBatch(db, owner, { userIds: [member.id, member2.id], units, reason: '', mode, key: nextKey() });
  const ledgerRows = () => db.prepare('SELECT count(*) AS n FROM ledger').get().n;
  // "20" read as points while the team counts credit would be the wrong amount for everyone: refused.
  assert.throws(batch(20, 'points'), code('RULES_CHANGED'));
  for (const units of [0, -1, 1.5, '100', Number.NaN, MAX_UNITS + 1])
    assert.throws(batch(units), code('INVALID_AMOUNT'), String(units));
  assert.equal(ledgerRows(), 0);

  // One person already at the largest balance stops the whole batch, for everyone.
  grant(db, owner, { userId: member.id, units: MAX_UNITS, key: nextKey() });
  assert.throws(batch(1), code('LIMIT_EXCEEDED'));
  assert.equal(ledgerRows(), 1);
  // Spending lowers the balance but not what was received, which has the same ceiling.
  recordSpend(db, member, { units: 10, mode: 'credit', key: nextKey() });
  assert.throws(batch(5), code('LIMIT_EXCEEDED'));
  assert.equal(ledgerRows(), 2);
  assert.equal(balanceOf(db, member2.id).postedUnits, 0);
});

test('a single treat keeps working beside batches, without a batch id', t => {
  const { db, owner, member } = fixture(t);
  const single = grant(db, owner, { userId: member.id, units: 100, reason: '', key: nextKey() });
  assert.equal(single.entry.batchId, null);
});
