import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { grant } from '../server/ledger.mjs';
import { saveReward } from '../server/rewards.mjs';
import { requestRedemption } from '../server/redemptions.mjs';
import { updateMember } from '../server/members.mjs';
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
  const setup = fixture(t);
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
