import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { openDatabase } from '../server/db.mjs';
import { grant, revokeGrant, balanceOf } from '../server/ledger.mjs';
import { collectionOf, nextSpriteKey, orderedKeys, theme } from '../server/collections.mjs';
import { buildManifest } from '../scripts/theme-manifest.mjs';
import { fixture } from './helpers.mjs';

let keys = 0;
const nextKey = () => `collect-request-${String(++keys).padStart(4, '0')}`;
const count = (db, userId) => db.prepare('SELECT count(*) AS n FROM collection_unlocks WHERE user_id = ?').get(userId).n;

/* Every key a release has shipped. Collections store keys forever, so none may ever
 * disappear from the theme (docs/THEMES.md); add new keys here in the same change. */
const RELEASED_KEYS = [
  'laopo', 'tart', 'mungbean', 'gaimei', 'taro', 'caketriangle', 'bolo', 'mochi', 'charsiu', 'eggyolk',
  'swissroll', 'sausage', 'bridecake', 'creambun', 'walnut', 'mango', 'nougat', 'coconuttart', 'shrimpchip',
  'boloyau', 'papercake', 'blackforest', 'datepastry', 'chickenpie', 'almond', 'dragonphoenix', 'centuryegg',
  'chestnut', 'porttart', 'blacksesamemochi', 'cheesehotdog', 'pumpkintuile', 'blacksesamepastry',
  'pistachiohorn', 'cnybox', 'mooncake', 'radishcake', 'tarocake', 'ricecake',
];

test('the default theme is the sprites of assets/sprites.js, validated one by one', async () => {
  const committed = JSON.parse(await readFile(new URL('../themes/default.json', import.meta.url), 'utf8'));
  const rebuilt = buildManifest(await readFile(new URL('../assets/sprites.js', import.meta.url), 'utf8'));
  assert.deepEqual(committed, rebuilt, 'themes/default.json is out of date: run node scripts/theme-manifest.mjs');
  assert.equal(committed.themeId, 'default');
  for (const key of RELEASED_KEYS) assert.ok(committed.keys.includes(key), `released key ${key} was removed`);
  assert.deepEqual([...committed.keys].sort(), [...RELEASED_KEYS].sort(), 'a new key must be added to RELEASED_KEYS too');
  assert.equal(new Set(committed.keys).size, committed.keys.length);
  for (const key of committed.keys) {
    assert.ok(committed.names[key].en, key);
    assert.ok(committed.names[key]['zh-CN'], key);
  }
  assert.deepEqual(theme.keys, committed.keys);
});

test('a malformed sprite table is refused', async () => {
  const source = await readFile(new URL('../assets/sprites.js', import.meta.url), 'utf8');
  assert.throws(() => buildManifest(source.replace('"....XXXX....",', '"....XXXX...",')), /12 columns/);
  assert.throws(() => buildManifest(source.replace('X: "#5C3A1D", b:', 'X: "brown", b:')), /colour/);
  assert.throws(() => buildManifest(source.replace('"..XXbbbbXX..",', '"..XXbbZbXX..",')), /not in its palette/);
});

test('revoked recognition keeps what was unlocked but must be earned again before the next one', t => {
  const { db, owner, member } = fixture(t);
  const counts = [];
  const first = grant(db, owner, { userId: member.id, units: 5000, reason: 'Thanks', key: nextKey() });
  counts.push(count(db, member.id));
  revokeGrant(db, owner, { grantId: first.entry.id, reason: 'Wrong person', key: nextKey() });
  counts.push(count(db, member.id));
  grant(db, owner, { userId: member.id, units: 5000, reason: 'Thanks', key: nextKey() });
  counts.push(count(db, member.id));
  grant(db, owner, { userId: member.id, units: 5000, reason: 'Thanks again', key: nextKey() });
  counts.push(count(db, member.id));
  assert.deepEqual(counts, [1, 1, 1, 2]);
});

test('one large grant can unlock several at once', t => {
  const { db, owner, member } = fixture(t);
  const result = grant(db, owner, { userId: member.id, units: 16000, reason: 'Big month', key: nextKey() });
  assert.deepEqual(result.unlocked.map(item => item.ordinal), [0, 1, 2]);
  assert.equal(result.collection.length, 3);
});

test('the order is a fixed hash of the member and the key, never random', t => {
  const { db, owner, member, member2, path } = fixture(t, { mode: 'points', thresholdUnits: 1 });
  const expected = [...theme.keys].sort((a, b) => {
    const ha = createHash('sha256').update(`${member.id}:${a}`).digest('hex');
    const hb = createHash('sha256').update(`${member.id}:${b}`).digest('hex');
    return ha < hb ? -1 : 1;
  });
  assert.deepEqual(orderedKeys(member.id), expected);
  assert.notDeepEqual(orderedKeys(member.id), orderedKeys(member2.id));

  grant(db, owner, { userId: member.id, units: 5, reason: 'Five', key: nextKey() });
  const before = collectionOf(db, member.id);
  assert.deepEqual(before.map(item => item.spriteKey), expected.slice(0, 5));
  assert.deepEqual(before.map(item => item.ordinal), [0, 1, 2, 3, 4]);
  assert.equal(nextSpriteKey(db, member.id), expected[5]);
  db.close();
  const reopened = openDatabase(path);
  try {
    assert.deepEqual(collectionOf(reopened, member.id), before);
  } finally {
    reopened.close();
  }
});

test('a finished collection says so, and recognition keeps working after it', t => {
  const { db, owner, member } = fixture(t, { mode: 'points', thresholdUnits: 1 });
  grant(db, owner, { userId: member.id, units: 38, reason: 'Nearly', key: nextKey() });
  assert.equal(count(db, member.id), 38);
  const last = grant(db, owner, { userId: member.id, units: 500, reason: 'All of them', key: nextKey() });
  assert.equal(last.unlocked.length, 1);
  assert.equal(last.collection.length, 39);
  assert.equal(new Set(last.collection.map(item => item.spriteKey)).size, 39);
  assert.equal(nextSpriteKey(db, member.id), null);
  const after = grant(db, owner, { userId: member.id, units: 10, reason: 'Still counts', key: nextKey() });
  assert.deepEqual(after.unlocked, []);
  assert.equal(after.collection.length, 39);
  assert.equal(balanceOf(db, member.id).postedUnits, 548);
});

test('spending never takes anything off the shelf', t => {
  const { db, owner, member } = fixture(t);
  grant(db, owner, { userId: member.id, units: 10000, reason: 'Thanks', key: nextKey() });
  db.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, reason, source_id, request_key, created_at)
              VALUES ('spend-1', ?, -10000, 'redeem', ?, '', 'some-redemption', 'spend-key-00000001', ?)`)
    .run(member.id, owner.id, new Date().toISOString());
  assert.equal(balanceOf(db, member.id).postedUnits, 0);
  assert.equal(collectionOf(db, member.id).length, 2);
  grant(db, owner, { userId: member.id, units: 5000, reason: 'Thanks', key: nextKey() });
  assert.equal(collectionOf(db, member.id).length, 3);
});
