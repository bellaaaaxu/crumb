/* One "device": its own thread and its own database connection.
 * It learns the acting user's role from the database, never from the parent. */
import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '../../server/db.mjs';
import { requestRedemption } from '../../server/redemptions.mjs';
import { updateMember } from '../../server/members.mjs';

const { path, gate, task } = workerData;
const db = openDatabase(path);
const actorFor = id => {
  const row = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  return { id: row.id, role: row.role };
};

try {
  parentPort.postMessage({ ready: true });
  // Wait for the parent to open the gate so both devices go at the same moment.
  Atomics.wait(new Int32Array(gate), 0, 0);
  try {
    if (task.kind === 'request') {
      const result = requestRedemption(db, actorFor(task.userId), { rewardId: task.rewardId, key: task.key });
      parentPort.postMessage({ ok: true, id: result.redemption.id });
    } else {
      updateMember(db, actorFor(task.actorId), task.userId, { active: false });
      parentPort.postMessage({ ok: true });
    }
  } catch (error) {
    parentPort.postMessage({ ok: false, code: error.code });
  }
} finally {
  db.close();
}
