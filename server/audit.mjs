import { randomUUID } from 'node:crypto';

/* Called inside the transaction that makes the change, so the record and the
 * change commit together. `detail` must never hold passwords, tokens or cookies. */
export function writeAudit(db, { actorId, action, targetId = null, detail = {} }, at) {
  db.prepare(`INSERT INTO audit (id, actor_id, action, target_id, detail_json, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), actorId ?? null, action, targetId, JSON.stringify(detail), at);
}
