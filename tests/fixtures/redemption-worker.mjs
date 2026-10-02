/* One "device": its own thread and its own database connection.
 * It learns the acting user's role from the database, never from the parent. */
import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '../../server/db.mjs';
import { requestRedemption, resolveRedemption } from '../../server/redemptions.mjs';
import { updateMember } from '../../server/members.mjs';
import { recordSpend, voidSpend } from '../../server/spending.mjs';

const { path, gate, task } = workerData;
const db = openDatabase(path);
const actorFor = id => {
  const row = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  return { id: row.id, role: row.role };
};

/* Each task returns what the parent needs to know about a success. */
const TASKS = {
  request: () => ({ id: requestRedemption(db, actorFor(task.userId), { rewardId: task.rewardId, key: task.key }).redemption.id }),
  deactivate: () => {
    updateMember(db, actorFor(task.actorId), task.userId, { active: false });
    return {};
  },
  complete: () => ({ id: resolveRedemption(db, actorFor(task.actorId),
    { redemptionId: task.redemptionId, action: 'complete', key: task.key }).redemption.id }),
  spend: () => ({ id: recordSpend(db, actorFor(task.userId), { units: task.units, mode: 'credit', key: task.key }).entry.id }),
  void: () => ({ id: voidSpend(db, actorFor(task.actorId), { spendId: task.spendId, reason: task.reason, key: task.key }).entry.id }),
};

try {
  parentPort.postMessage({ ready: true });
  // Wait for the parent to open the gate so both devices go at the same moment.
  Atomics.wait(new Int32Array(gate), 0, 0);
  try {
    parentPort.postMessage({ ok: true, ...TASKS[task.kind]() });
  } catch (error) {
    parentPort.postMessage({ ok: false, code: error.code });
  }
} finally {
  db.close();
}
