import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { balanceOf, grant } from '../server/ledger.mjs';
import { saveReward } from '../server/rewards.mjs';
import { requestRedemption } from '../server/redemptions.mjs';
import { updateMember } from '../server/members.mjs';
import { updateOrg } from '../server/org.mjs';
import { recordSpend } from '../server/spending.mjs';
import { fixture } from './helpers.mjs';

const WORKER = new URL('./fixtures/redemption-worker.mjs', import.meta.url);

/* Starts one worker per task, waits until all have opened their connection,
 * then releases them together and collects what each one reports. */
async function race(path, tasks) {
  const gate = new SharedArrayBuffer(4);
  const running = tasks.map(task => {
    const worker = new Worker(WORKER, { workerData: { path, gate, task } });
    let markReady;
    const ready = new Promise(resolve => { markReady = resolve; });
    const result = new Promise((resolve, reject) => {
      worker.on('message', message => (message.ready ? markReady() : resolve(message)));
      worker.on('error', reject);
    });
    const exited = new Promise((resolve, reject) => worker.on('exit', exitCode =>
      (exitCode === 0 ? resolve() : reject(new Error(`worker exited with ${exitCode}`)))));
    return { ready, result, exited };
  });
  await Promise.all(running.map(run => run.ready));
  const flag = new Int32Array(gate);
  Atomics.store(flag, 0, 1);
  Atomics.notify(flag, 0);
  const settled = await Promise.all(running.map(run => run.result));
  await Promise.all(running.map(run => run.exited));
  return settled;
}

function prepared(t) {
  const setup = fixture(t, { spending: 'confirm' });
  grant(setup.db, setup.owner, { userId: setup.member.id, units: 5000, reason: 'Thanks', key: 'concurrency-grant-01' });
  const reward = saveReward(setup.db, setup.owner, { name: 'Coffee', description: '', costUnits: 3000, active: true });
  return { ...setup, reward };
}

const pendingOf = (db, userId) => db.prepare(`SELECT id FROM redemptions WHERE user_id = ? AND status = 'pending'`).all(userId);

test('two devices spending the same balance at once: one wins, nothing is overdrawn', async t => {
  const { db, path, member, reward } = prepared(t);
  const results = await race(path, [
    { kind: 'request', userId: member.id, rewardId: reward.id, key: 'device-one-request-1' },
    { kind: 'request', userId: member.id, rewardId: reward.id, key: 'device-two-request-1' },
  ]);
  assert.deepEqual(results.map(r => r.ok).sort(), [false, true]);
  assert.equal(results.find(r => !r.ok).code, 'INSUFFICIENT_BALANCE');
  assert.equal(pendingOf(db, member.id).length, 1);
});

test('the same request sent twice at once creates one request', async t => {
  const { db, path, member, reward } = prepared(t);
  const results = await race(path, [
    { kind: 'request', userId: member.id, rewardId: reward.id, key: 'same-key-from-a-retry' },
    { kind: 'request', userId: member.id, rewardId: reward.id, key: 'same-key-from-a-retry' },
  ]);
  assert.deepEqual(results.map(r => r.ok), [true, true]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(db.prepare('SELECT count(*) AS n FROM redemptions').get().n, 1);
});

test('requesting first then being deactivated: the request is cancelled', t => {
  const { db, owner, member, reward } = prepared(t);
  requestRedemption(db, member, { rewardId: reward.id, key: 'request-before-leave' });
  updateMember(db, owner, member.id, { active: false });
  assert.equal(pendingOf(db, member.id).length, 0);
  assert.equal(db.prepare(`SELECT status FROM redemptions WHERE user_id = ?`).get(member.id).status, 'cancelled');
});

test('being deactivated first then requesting: the request is refused', t => {
  const { db, owner, member, reward } = prepared(t);
  updateMember(db, owner, member.id, { active: false });
  assert.throws(() => requestRedemption(db, member, { rewardId: reward.id, key: 'request-after-leave' }),
    error => error.code === 'ACCOUNT_INACTIVE');
  assert.equal(db.prepare('SELECT count(*) AS n FROM redemptions').get().n, 0);
});

test('deactivation racing a request never leaves a pending request behind', async t => {
  for (let round = 0; round < 5; round += 1) {
    const { db, path, owner, member, reward } = prepared(t);
    const results = await race(path, [
      { kind: 'request', userId: member.id, rewardId: reward.id, key: `racing-request-${round}-xx` },
      { kind: 'deactivate', actorId: owner.id, userId: member.id },
    ]);
    assert.equal(results[1].ok, true);
    assert.equal(db.prepare('SELECT active FROM users WHERE id = ?').get(member.id).active, 0);
    assert.equal(pendingOf(db, member.id).length, 0, `round ${round}: ${JSON.stringify(results)}`);
  }
});

/* A team that spends on trust (the default), with 5000 to spend. */
function fundedSelf(t) {
  const setup = fixture(t);
  grant(setup.db, setup.owner, { userId: setup.member.id, units: 5000, reason: 'Thanks', key: 'concurrency-grant-01' });
  return setup;
}

const postedOf = (db, userId) => db.prepare('SELECT COALESCE(SUM(delta_units), 0) AS n FROM ledger WHERE user_id = ?').get(userId).n;

test('two devices recording entries against the same balance at once: one wins, nothing is overdrawn', async t => {
  for (let round = 0; round < 5; round += 1) {
    const { db, path, member } = fundedSelf(t);
    const results = await race(path, [
      { kind: 'spend', userId: member.id, units: 3000, key: `device-one-spend-${round}-xx` },
      { kind: 'spend', userId: member.id, units: 3000, key: `device-two-spend-${round}-xx` },
    ]);
    const note = `round ${round}: ${JSON.stringify(results)}`;
    assert.deepEqual(results.map(r => r.ok).sort(), [false, true], note);
    assert.equal(results.find(r => !r.ok).code, 'INSUFFICIENT_BALANCE', note);
    assert.equal(postedOf(db, member.id), 2000, note);
  }
});

test('an entry racing the confirmation of a request left waiting from confirmed mode never overdraws', async t => {
  for (let round = 0; round < 5; round += 1) {
    const { db, path, owner, member, reward } = prepared(t);
    const { redemption } = requestRedemption(db, member, { rewardId: reward.id, key: `waiting-request-${round}-xx` });
    updateOrg(db, owner, { spending: 'self' });
    // 3000 of the 5000 is held for the request whichever way the race goes, so 2000 is all an entry can take.
    const results = await race(path, [
      { kind: 'spend', userId: member.id, units: 3000, key: `racing-spend-${round}-xxxx` },
      { kind: 'complete', actorId: owner.id, redemptionId: redemption.id, key: `racing-confirm-${round}-xx` },
    ]);
    const note = `round ${round}: ${JSON.stringify(results)}`;
    assert.deepEqual(results[0], { ok: false, code: 'INSUFFICIENT_BALANCE' }, note);
    assert.equal(results[1].ok, true, note);
    assert.deepEqual(balanceOf(db, member.id), { postedUnits: 2000, reservedUnits: 0, availableUnits: 2000, lifetimeUnits: 5000 }, note);
  }
});

test('two corrections of the same entry at once, with different keys: one is recorded', async t => {
  for (let round = 0; round < 5; round += 1) {
    const { db, path, owner, member } = fundedSelf(t);
    const spend = recordSpend(db, member, { units: 3000, mode: 'credit', key: `entry-to-correct-${round}-xx` });
    const results = await race(path, [
      { kind: 'void', actorId: owner.id, spendId: spend.entry.id, reason: 'Keyed in twice', key: `first-correction-${round}-xx` },
      { kind: 'void', actorId: owner.id, spendId: spend.entry.id, reason: 'Keyed in twice', key: `second-correction-${round}-xx` },
    ]);
    const note = `round ${round}: ${JSON.stringify(results)}`;
    assert.deepEqual(results.map(r => r.ok).sort(), [false, true], note);
    assert.equal(results.find(r => !r.ok).code, 'ALREADY_CORRECTED', note);
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ledger WHERE kind = 'void'`).get().n, 1, note);
    assert.equal(postedOf(db, member.id), 5000, note);
  }
});
