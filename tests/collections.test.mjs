import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { openDatabase } from '../server/db.mjs';
import { grant, revokeGrant, balanceOf } from '../server/ledger.mjs';
import { collectionOf, nextSpriteKey, orderedKeys, theme } from '../server/collections.mjs';
import { buildAll, buildManifest } from '../scripts/theme-manifest.mjs';
import { fixture } from './helpers.mjs';

let keys = 0;
const nextKey = () => `collect-request-${String(++keys).padStart(4, '0')}`;
const count = (db, userId) => db.prepare('SELECT count(*) AS n FROM collection_unlocks WHERE user_id = ?').get(userId).n;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const spritesSource = () => readFileSync(join(ROOT, 'assets', 'sprites.js'), 'utf8');
const listFile = themeId => JSON.parse(readFileSync(join(ROOT, 'themes', `${themeId}.json`), 'utf8'));
/* sprites.js touches no browser API at load time, so it evaluates here as it does in the scripts. */
const loadPixel = source => vm.runInNewContext(`${source}\n;Pixel`, Object.create(null), { timeout: 1000 });
/* A test's edit of the sprite table; fails loudly if the text it edits has moved. */
function edit(source, from, to) {
  assert.ok(source.includes(from), `assets/sprites.js no longer contains ${from}`);
  return source.replace(from, to);
}

/* Every key each theme has shipped. Members' collections keep keys forever, and the server
 * names a key and caps a shelf from the team's own theme only, so a key may never leave a
 * theme it shipped in, even while another theme still has it (docs/THEMES.md). A key in
 * two themes is listed under both. A new theme or a new key is registered here in the same
 * change that adds it. */
const RELEASED_KEYS = {
  default: [
    'laopo', 'tart', 'mungbean', 'gaimei', 'taro', 'caketriangle', 'bolo', 'mochi', 'charsiu', 'eggyolk',
    'swissroll', 'sausage', 'bridecake', 'creambun', 'walnut', 'mango', 'nougat', 'coconuttart', 'shrimpchip',
    'boloyau', 'papercake', 'blackforest', 'datepastry', 'chickenpie', 'almond', 'dragonphoenix', 'centuryegg',
    'chestnut', 'porttart', 'blacksesamemochi', 'cheesehotdog', 'pumpkintuile', 'blacksesamepastry',
    'pistachiohorn', 'cnybox', 'mooncake', 'radishcake', 'tarocake', 'ricecake',
  ],
};

/* The public demo's rotation as 0.2 shipped it. Without a theme, forSlot must pick exactly
 * what 0.2 picked, so nobody's demo shelf moves. */
const CYCLE_0_2 = [
  'laopo', 'tart', 'mungbean', 'gaimei', 'taro', 'caketriangle', 'bolo', 'mochi', 'charsiu', 'eggyolk',
  'swissroll', 'sausage', 'bridecake', 'creambun', 'walnut', 'mango', 'nougat', 'coconuttart', 'shrimpchip',
  'boloyau', 'papercake', 'blackforest', 'datepastry', 'chickenpie', 'almond', 'dragonphoenix', 'centuryegg',
  'chestnut', 'porttart', 'blacksesamemochi', 'cheesehotdog', 'pumpkintuile', 'blacksesamepastry',
];

test('every theme has a list file built from assets/sprites.js, holding exactly its released keys', () => {
  const built = buildAll(spritesSource());
  const ids = Object.keys(built).sort();
  assert.deepEqual(ids, Object.keys(RELEASED_KEYS).sort(), 'every theme needs a released-key list here, and every list a theme');
  const files = readdirSync(join(ROOT, 'themes')).filter(name => name.endsWith('.json')).sort();
  assert.deepEqual(files, ids.map(themeId => `${themeId}.json`), 'themes/ holds one list file per theme: run node scripts/theme-manifest.mjs');
  for (const themeId of ids) {
    const committed = listFile(themeId);
    assert.deepEqual(committed, built[themeId], `themes/${themeId}.json is out of date: run node scripts/theme-manifest.mjs`);
    assert.equal(committed.themeId, themeId);
    for (const key of RELEASED_KEYS[themeId]) assert.ok(committed.keys.includes(key), `released key ${key} was removed from ${themeId}`);
    assert.deepEqual([...committed.keys].sort(), [...RELEASED_KEYS[themeId]].sort(), `a new key in ${themeId} must be added to RELEASED_KEYS.${themeId} too`);
    assert.equal(new Set(committed.keys).size, committed.keys.length, themeId);
    assert.ok(committed.keys.includes(committed.mascot), `${themeId}: the mascot is one of its keys`);
    for (const key of committed.keys) {
      for (const locale of ['en', 'zh-Hant', 'zh-CN']) assert.ok(committed.names[key]?.[locale], `${themeId}: ${key} needs a ${locale} name`);
    }
  }
});

test('the theme table: Pastry shop is the 0.2 list, and every card counts its keys instead of typing a number', () => {
  const Pixel = loadPixel(spritesSource());
  assert.equal(Pixel.THEMES.default.rotation, Pixel.CYCLE, 'Pastry shop rotates the CYCLE array itself');
  assert.equal(Pixel.THEMES.default.limited, Pixel.LIMITED);
  assert.equal(Pixel.THEMES.default.mascot, 'laopo');
  assert.equal(Pixel.THEMES.default.version, 1);
  for (const [themeId, entry] of Object.entries(Pixel.THEMES)) {
    assert.deepEqual([...Pixel.themeKeys(themeId)], listFile(themeId).keys, themeId);
    for (const locale of ['en', 'zh-CN']) {
      assert.ok(entry.label[locale], `${themeId}: label.${locale}`);
      assert.ok(entry.card[locale].includes('{count}'), `${themeId}: card.${locale} has {count}`);
      assert.doesNotMatch(entry.card[locale], /\p{Nd}/u, `${themeId}: card.${locale} types no number`);
    }
  }
});

test('forSlot without a theme, or with Pastry shop, picks what 0.2 picked; other themes rotate their own list', () => {
  const Pixel = loadPixel(spritesSource());
  for (const seed of ['sam', 'alex', 'p-3', 'Mina Member', '小明']) {
    let sum = 0;
    for (let i = 0; i < seed.length; i += 1) sum += seed.charCodeAt(i);
    for (let index = 0; index < 70; index += 1) {
      const before = CYCLE_0_2[(index + sum) % 33];
      assert.equal(Pixel.forSlot(seed, index), before, `${seed} #${index}`);
      assert.equal(Pixel.forSlot(seed, index, 'default'), before, `${seed} #${index}`);
      for (const [themeId, entry] of Object.entries(Pixel.THEMES)) {
        assert.equal(Pixel.forSlot(seed, index, themeId), entry.rotation[(index + sum) % entry.rotation.length], `${themeId}: ${seed} #${index}`);
      }
    }
  }
});

test('a malformed sprite table is refused', () => {
  const source = spritesSource();
  assert.throws(() => buildManifest(edit(source, '"....XXXX....",', '"....XXXX...",'), 'default'), /12 columns/);
  assert.throws(() => buildManifest(edit(source, 'X: "#5C3A1D", b:', 'X: "brown", b:'), 'default'), /colour/);
  assert.throws(() => buildManifest(edit(source, '"..XXbbbbXX..",', '"..XXbbZbXX..",'), 'default'), /not in its palette/);
  assert.throws(() => buildManifest(source, 'nope'), /no theme "nope" in THEMES/);
});

test('every theme rule of the design is checked', () => {
  const source = spritesSource();
  const refused = (from, to, message) => assert.throws(() => buildAll(edit(source, from, to)), message);
  refused('rotation: CYCLE,', 'rotation: CYCLE.concat(["tart"]),', /THEMES\.default repeats the key "tart"/);
  refused('limited: LIMITED,', 'limited: LIMITED.concat(["tart"]),', /THEMES\.default has "tart" in both rotation and limited/);
  refused('mascot: "laopo",', 'mascot: "pistachiohorn",', /THEMES\.default\.mascot "pistachiohorn" must be in its rotation/);
  refused('rotation: CYCLE,', 'rotation: CYCLE.concat(["unicorn"]),', /"unicorn" in THEMES\.default is not drawn in SPRITES/);
  refused(', cn: "蛋挞" },', ' },', /tart needs English \(en\), Traditional \(zh\) and Simplified \(cn\) names/);
  refused('version: 1,', 'version: 0,', /THEMES\.default\.version must be a positive whole number/);
  refused('version: 1,', 'version: 1.5,', /THEMES\.default\.version must be a positive whole number/);
  refused('label: { en: "Pastry shop", "zh-CN": "饼店" }', 'label: { en: "Pastry shop" }', /THEMES\.default\.label needs "zh-CN" text/);
  refused('card: { en: "Pastry shop · {count} pastries",', 'card: {', /THEMES\.default\.card needs "en" text/);
  refused('en: "Pastry shop · {count} pastries"', 'en: "Pastry shop · 39 pastries"', /THEMES\.default\.card\.en must contain \{count\}/);
  refused('en: "Pastry shop · {count} pastries"', 'en: "Pastry shop · {count} pastries in 2 rows"', /THEMES\.default\.card\.en must not type a number/);
  refused('"zh-CN": "饼店 · {count} 款点心"', '"zh-CN": "饼店 · {count} 款点心（３９）"', /THEMES\.default\.card\.zh-CN must not type a number/);
  refused('const THEMES = {', 'const THEMES = {\n    Pastry: { mascot: "laopo", rotation: ["laopo"], limited: [], version: 1, label: { en: "x", "zh-CN": "x" }, card: { en: "{count}", "zh-CN": "{count}" } },',
    /theme id "Pastry" must be 2 to 32 lowercase letters and digits/);
  const stray = `stray: { palette: { X: "#7A4A1E" }, rows: [${Array(12).fill('"XXXXXXXXXXXX"').join(', ')}] },`;
  refused('  const SPRITES = {', `  const SPRITES = {\n    ${stray}`, /stray is drawn but is in no theme's rotation or limited/);
});

/* The generator, the sprite table and the list files, copied to a scratch folder so the
 * command runs for real without touching this checkout's themes/. */
function scratchCopy(t) {
  const dir = mkdtempSync(join(tmpdir(), 'crumb-themes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const folder of ['scripts', 'assets', 'themes']) mkdirSync(join(dir, folder));
  copyFileSync(join(ROOT, 'scripts', 'theme-manifest.mjs'), join(dir, 'scripts', 'theme-manifest.mjs'));
  copyFileSync(join(ROOT, 'assets', 'sprites.js'), join(dir, 'assets', 'sprites.js'));
  for (const name of readdirSync(join(ROOT, 'themes'))) copyFileSync(join(ROOT, 'themes', name), join(dir, 'themes', name));
  return dir;
}
const generate = (dir, ...args) => spawnSync(process.execPath, [join(dir, 'scripts', 'theme-manifest.mjs'), ...args], { encoding: 'utf8' });

test('the generator writes every list file and removes stale ones; --check reports a stale, edited or missing file', t => {
  const dir = scratchCopy(t);
  const themes = join(dir, 'themes');
  let run = generate(dir, '--check');
  assert.equal(run.status, 0, run.stderr);
  for (const [themeId, released] of Object.entries(RELEASED_KEYS)) {
    assert.ok(run.stdout.includes(`themes/${themeId}.json is current (${released.length} collectibles).`), run.stdout);
  }

  writeFileSync(join(themes, 'retired.json'), '{}\n');
  const edited = JSON.parse(readFileSync(join(themes, 'default.json'), 'utf8'));
  edited.version += 1;
  writeFileSync(join(themes, 'default.json'), JSON.stringify(edited));
  run = generate(dir, '--check');
  assert.equal(run.status, 1);
  assert.match(run.stderr, /themes\/retired\.json belongs to no theme in assets\/sprites\.js/);
  assert.match(run.stderr, /themes\/default\.json does not match assets\/sprites\.js/);
  assert.ok(existsSync(join(themes, 'retired.json')), '--check changes nothing');

  run = generate(dir);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /removed themes\/retired\.json/);
  assert.equal(existsSync(join(themes, 'retired.json')), false);
  assert.deepEqual(JSON.parse(readFileSync(join(themes, 'default.json'), 'utf8')), listFile('default'));
  assert.equal(generate(dir, '--check').status, 0);

  rmSync(join(themes, 'default.json'));
  run = generate(dir, '--check');
  assert.equal(run.status, 1);
  assert.match(run.stderr, /themes\/default\.json is missing/);
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
