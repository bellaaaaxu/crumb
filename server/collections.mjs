import { createHash } from 'node:crypto';
import { orgTheme } from './themes.mjs';

/* A team collects from its own theme's list (server/themes.mjs, generated from
 * assets/sprites.js). There is no global list: callers pass the team theme's
 * keys, and unlockEarned reads them with orgTheme(db). Keys are stored in
 * members' rows for good. */

const rank = (userId, key) => createHash('sha256').update(`${userId}:${key}`).digest('hex');

/* Each member's shelf fills in its own fixed order: `keys` (the team theme's)
 * sorted by SHA-256(userId + ':' + key). Same member, same order, on every
 * device and after every restart; different members, different shelves. The
 * order of the list itself does not matter. */
export function orderedKeys(userId, keys) {
  return keys
    .map(key => ({ key, rank: rank(userId, key) }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
    .map(entry => entry.key);
}

export const collectionOf = (db, userId) => db.prepare(`SELECT ordinal, sprite_key, unlocked_at
    FROM collection_unlocks WHERE user_id = ? ORDER BY ordinal`).all(userId)
  .map(row => ({ ordinal: row.ordinal, spriteKey: row.sprite_key, unlockedAt: row.unlocked_at }));

/* The next one on this member's shelf among `keys` (the team theme's), or null once every one is collected. */
export function nextSpriteKey(db, userId, keys) {
  const have = new Set(db.prepare('SELECT sprite_key FROM collection_unlocks WHERE user_id = ?').all(userId).map(row => row.sprite_key));
  return orderedKeys(userId, keys).find(key => !have.has(key)) ?? null;
}

/**
 * Unlocks whatever this member has newly earned. Must run inside the grant's
 * transaction, after the grant row is written.
 *
 * Earned = floor(lifetime recognition / threshold), capped at the size of the
 * team's theme. Unlocks are never removed: after a revoke, `earned` can fall
 * below what is already on the shelf, and nothing new unlocks until
 * recognition climbs past the next threshold again.
 */
export function unlockEarned(db, userId, grantId, at) {
  const { threshold_units: threshold } = db.prepare('SELECT threshold_units FROM organization WHERE id = 1').get();
  const { keys } = orgTheme(db);
  const { lifetime } = db.prepare(`SELECT COALESCE(SUM(delta_units), 0) AS lifetime FROM ledger
                                   WHERE user_id = ? AND kind IN ('grant', 'revoke')`).get(userId);
  const existing = db.prepare('SELECT sprite_key FROM collection_unlocks WHERE user_id = ?').all(userId).map(row => row.sprite_key);
  const earned = Math.min(keys.length, Math.floor(lifetime / threshold));
  if (earned <= existing.length) return [];

  // Skipping keys already held keeps this correct even if a future theme version adds keys.
  const have = new Set(existing);
  const upcoming = orderedKeys(userId, keys).filter(key => !have.has(key));
  const insert = db.prepare(`INSERT INTO collection_unlocks (user_id, ordinal, sprite_key, unlocked_at, grant_id)
                             VALUES (?, ?, ?, ?, ?)`);
  const unlocked = [];
  for (let ordinal = existing.length; ordinal < earned; ordinal += 1) {
    const spriteKey = upcoming[ordinal - existing.length];
    insert.run(userId, ordinal, spriteKey, at, grantId);
    unlocked.push({ ordinal, spriteKey, unlockedAt: at });
  }
  return unlocked;
}
