import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendEntry, balanceOf, grant } from '../server/ledger.mjs';
import { recordSpend, voidSpend } from '../server/spending.mjs';
import { MAX_UNITS } from '../server/units.mjs';
import { collectionOf } from '../server/collections.mjs';
import { updateOrg } from '../server/org.mjs';
import { updateMember } from '../server/members.mjs';
import { fixture } from './helpers.mjs';

const code = expected => error => {
  assert.equal(error.code, expected);
  return true;
};
let keys = 0;
const nextKey = () => `spend-test-key-${String(++keys).padStart(4, '0')}`;
const rows = (db, userId) => db.prepare('SELECT kind, delta_units, source_id FROM ledger WHERE user_id = ? ORDER BY created_at, rowid').all(userId);

function funded(t, options) {
  const setup = fixture(t, options);
  grant(setup.db, setup.owner, { userId: setup.member.id, units: 5000, reason: '', key: nextKey() });
  return setup;
}

test('a member records what they took; it is deducted at once and the shelf stays', t => {
  const { db, member } = funded(t);
  const key = nextKey();
  const result = recordSpend(db, member, { units: 1250, mode: 'credit', key });
  assert.equal(result.entry.kind, 'spend');
  assert.equal(result.entry.deltaUnits, -1250);
  assert.equal(result.entry.actorId, member.id);
  assert.deepEqual(result.balance, { postedUnits: 3750, reservedUnits: 0, availableUnits: 3750, lifetimeUnits: 5000 });
  assert.deepEqual(recordSpend(db, member, { units: 1250, mode: 'credit', key }), result, 'same key, same answer');
  assert.equal(collectionOf(db, member.id).length, 1);
  assert.deepEqual(rows(db, member.id).map(row => row.kind), ['grant', 'spend']);
  const audit = db.prepare(`SELECT actor_id, detail_json FROM audit WHERE action = 'spend.create'`).get();
  assert.equal(audit.actor_id, member.id);
  assert.deepEqual(JSON.parse(audit.detail_json), { units: 1250 });
});

test('an entry needs a positive amount within the available balance, in the current unit', t => {
  const { db, member, member2 } = funded(t);
  for (const units of [0, -5, 1.5, 5001]) {
    const expected = units === 5001 ? 'INSUFFICIENT_BALANCE' : 'INVALID_AMOUNT';
    assert.throws(() => recordSpend(db, member, { units, mode: 'credit', key: nextKey() }), code(expected), String(units));
  }
  assert.throws(() => recordSpend(db, member2, { units: 1, mode: 'credit', key: nextKey() }), code('INSUFFICIENT_BALANCE'));
  assert.throws(() => recordSpend(db, member, { units: 100, mode: 'points', key: nextKey() }), code('RULES_CHANGED'));
  assert.equal(balanceOf(db, member.id).availableUnits, 5000);
});

test('entries are refused in confirmed mode and for inactive accounts', t => {
  const { db, owner, member } = funded(t);
  updateOrg(db, owner, { spending: 'confirm' });
  assert.throws(() => recordSpend(db, member, { units: 100, mode: 'credit', key: nextKey() }), code('SPENDING_MODE'));
  updateOrg(db, owner, { spending: 'self' });
  updateMember(db, owner, member.id, { active: false });
  assert.throws(() => recordSpend(db, member, { units: 100, mode: 'credit', key: nextKey() }), code('ACCOUNT_INACTIVE'));
});

test('a manager corrects an entry once; the amount comes back and nothing unlocks', t => {
  const { db, owner, member } = funded(t);
  const spend = recordSpend(db, member, { units: 2000, mode: 'credit', key: nextKey() });
  assert.throws(() => voidSpend(db, member, { spendId: spend.entry.id, reason: 'Oops', key: nextKey() }), code('FORBIDDEN'));
  assert.throws(() => voidSpend(db, owner, { spendId: spend.entry.id, reason: '', key: nextKey() }), code('INVALID_INPUT'));
  const key = nextKey();
  const fixed = voidSpend(db, owner, { spendId: spend.entry.id, reason: 'Keyed in twice', key });
  assert.equal(fixed.entry.kind, 'void');
  assert.equal(fixed.entry.deltaUnits, 2000);
  assert.equal(fixed.entry.sourceId, spend.entry.id);
  assert.deepEqual(fixed.balance, { postedUnits: 5000, reservedUnits: 0, availableUnits: 5000, lifetimeUnits: 5000 });
  assert.deepEqual(voidSpend(db, owner, { spendId: spend.entry.id, reason: 'Keyed in twice', key }), fixed);
  assert.throws(() => voidSpend(db, owner, { spendId: spend.entry.id, reason: 'Again', key: nextKey() }), code('ALREADY_CORRECTED'));
  assert.throws(() => voidSpend(db, owner, { spendId: randomUUID(), reason: 'x', key: nextKey() }), code('ENTRY_NOT_FOUND'));
  const grantRow = rows(db, member.id)[0];
  assert.equal(grantRow.kind, 'grant');
  const grantId = db.prepare(`SELECT id FROM ledger WHERE kind = 'grant' AND user_id = ?`).get(member.id).id;
  assert.throws(() => voidSpend(db, owner, { spendId: grantId, reason: 'x', key: nextKey() }), code('ENTRY_NOT_FOUND'));
  assert.equal(collectionOf(db, member.id).length, 1);
  const audit = db.prepare(`SELECT detail_json FROM audit WHERE action = 'spend.void'`).get();
  assert.deepEqual(JSON.parse(audit.detail_json), { userId: member.id, spendId: spend.entry.id, units: 2000 });
});

test('points mode takes whole numbers only', t => {
  const { db, member } = funded(t, { mode: 'points', thresholdUnits: 100 });
  assert.throws(() => recordSpend(db, member, { units: 1.5, mode: 'points', key: nextKey() }), code('INVALID_AMOUNT'));
  assert.equal(balanceOf(db, member.id).availableUnits, 5000);
  assert.equal(recordSpend(db, member, { units: 40, mode: 'points', key: nextKey() }).balance.availableUnits, 4960);
});

test('a correction that would take the balance past the largest amount is refused', t => {
  const { db, owner, member } = funded(t);
  const spend = recordSpend(db, member, { units: 2000, mode: 'credit', key: nextKey() });
  // No run of treats and entries gets here (a balance never exceeds what was received, which has
  // the same ceiling), so the rest of the balance is written straight in: the check is a backstop.
  db.transaction(() => appendEntry(db, { user_id: member.id, delta_units: MAX_UNITS - 3000, kind: 'grant',
    actor_id: owner.id, request_key: null, created_at: new Date().toISOString() }))();
  assert.equal(balanceOf(db, member.id).postedUnits, MAX_UNITS);
  assert.throws(() => voidSpend(db, owner, { spendId: spend.entry.id, reason: 'Keyed in twice', key: nextKey() }), code('LIMIT_EXCEEDED'));
  assert.equal(db.prepare(`SELECT count(*) AS n FROM ledger WHERE kind = 'void'`).get().n, 0);
});
