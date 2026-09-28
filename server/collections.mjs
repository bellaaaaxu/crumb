import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/* The collectible set: keys and names generated from assets/sprites.js by
 * scripts/theme-manifest.mjs. Keys are stored in members' rows for good. */
export const theme = JSON.parse(readFileSync(new URL('../themes/default.json', import.meta.url), 'utf8'));

const rank = (userId, key) => createHash('sha256').update(`${userId}:${key}`).digest('hex');

/* Each member's shelf fills in its own fixed order: sorted by
 * SHA-256(userId + ':' + key). Same member, same order, on every device and
 * after every restart; different members, different shelves. */
export function orderedKeys(userId, keys = theme.keys) {
  return keys
    .map(key => ({ key, rank: rank(userId, key) }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
    .map(entry => entry.key);
}

export const collectionOf = (db, userId) => db.prepare(`SELECT ordinal, sprite_key, unlocked_at
    FROM collection_unlocks WHERE user_id = ? ORDER BY ordinal`).all(userId)
  .map(row => ({ ordinal: row.ordinal, spriteKey: row.sprite_key, unlockedAt: row.unlocked_at }));

/* The next one on this member's shelf, or null once every sprite is collected. */
export function nextSpriteKey(db, userId) {
  const have = new Set(db.prepare('SELECT sprite_key FROM collection_unlocks WHERE user_id = ?').all(userId).map(row => row.sprite_key));
  return orderedKeys(userId).find(key => !have.has(key)) ?? null;
}

/**
 * Unlocks whatever this member has newly earned. Must run inside the grant's
 * transaction, after the grant row is written.
 *
 * Earned = floor(lifetime recognition / threshold), capped at the theme size.
 * Unlocks are never removed: after a revoke, `earned` can fall below what is
 * already on the shelf, and nothing new unlocks until recognition climbs past
 * the next threshold again.
 */
export function unlockEarned(db, userId, grantId, at) {
  const { threshold_units: threshold } = db.prepare('SELECT threshold_units FROM organization WHERE id = 1').get();
  const { lifetime } = db.prepare(`SELECT COALESCE(SUM(delta_units), 0) AS lifetime FROM ledger
                                   WHERE user_id = ? AND kind IN ('grant', 'revoke')`).get(userId);
  const existing = db.prepare('SELECT sprite_key FROM collection_unlocks WHERE user_id = ?').all(userId).map(row => row.sprite_key);
  const earned = Math.min(theme.keys.length, Math.floor(lifetime / threshold));
  if (earned <= existing.length) return [];

  // Skipping keys already held keeps this correct even if a future theme version adds keys.
  const have = new Set(existing);
  const upcoming = orderedKeys(userId).filter(key => !have.has(key));
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
