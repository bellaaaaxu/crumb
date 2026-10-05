/* Builds one list file per collection theme, themes/<id>.json (the collectibles the
 * server unlocks for a team on that theme), from the THEMES table in assets/sprites.js.
 * This script holds no theme data of its own: it checks the rules every theme keeps.
 *
 *   node scripts/theme-manifest.mjs           write every themes/<id>.json, remove stale ones
 *   node scripts/theme-manifest.mjs --check   fail if a list file is out of date, missing or stale
 *
 * The keys in a list are stored in members' collections forever, so a key may be added to
 * a theme but never removed from it, renamed or reused (docs/THEMES.md). */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPRITES_PATH = join(root, 'assets', 'sprites.js');
const THEMES_DIR = join(root, 'themes');

const GRID = 12;
/* Sprite keys and theme ids alike: they end up in members' rows, file names and URLs. */
const ID = /^[a-z][a-z0-9]{1,31}$/;
/* The languages a theme's name and card text come in. */
const LOCALES = ['en', 'zh-CN'];

function fail(message) {
  throw new Error(`assets/sprites.js: ${message}`);
}

const hasText = value => typeof value === 'string' && value.trim() !== '';

function checkSprite(key, sprite) {
  if (!ID.test(key)) fail(`key "${key}" must be lowercase letters and digits`);
  if (!sprite || typeof sprite.palette !== 'object' || !Array.isArray(sprite.rows)) fail(`${key} needs a palette and rows`);
  for (const [symbol, colour] of Object.entries(sprite.palette)) {
    if (symbol.length !== 1 || symbol === '.') fail(`${key} palette symbol "${symbol}" must be one character other than "."`);
    if (!/^#[0-9A-Fa-f]{6}$/.test(colour)) fail(`${key} palette colour "${colour}" must look like #A1B2C3`);
  }
  if (sprite.rows.length !== GRID) fail(`${key} must have ${GRID} rows`);
  let painted = 0;
  sprite.rows.forEach((row, index) => {
    if (typeof row !== 'string' || row.length !== GRID) fail(`${key} row ${index + 1} must have ${GRID} columns`);
    for (const cell of row) {
      if (cell === '.') continue;
      if (!Object.hasOwn(sprite.palette, cell)) fail(`${key} row ${index + 1} uses "${cell}", which is not in its palette`);
      painted += 1;
    }
  });
  if (painted === 0) fail(`${key} has no painted cells`);
}

/* Evaluates the sprite table in an empty context. */
function load(source) {
  const Pixel = vm.runInNewContext(`${source}\n;Pixel`, Object.create(null), { timeout: 1000 });
  if (!Pixel || typeof Pixel.THEMES !== 'object' || Pixel.THEMES === null) fail('THEMES is missing');
  return Pixel;
}

/* One theme's list file, after every rule that concerns that theme alone. Everything
 * returned is built here, outside the evaluated table, so it compares equal to parsed JSON. */
function manifestOf(Pixel, themeId) {
  if (!Object.hasOwn(Pixel.THEMES, themeId)) fail(`no theme "${themeId}" in THEMES`);
  if (!ID.test(themeId)) fail(`theme id "${themeId}" must be 2 to 32 lowercase letters and digits, starting with a letter`);
  const where = `THEMES.${themeId}`;
  const { mascot, rotation, limited, version, label, card } = Pixel.THEMES[themeId];
  if (!Array.isArray(rotation) || !Array.isArray(limited)) fail(`${where}.rotation and .limited must be lists of keys`);
  for (const list of [rotation, limited]) {
    const seen = new Set();
    for (const key of list) {
      if (seen.has(key)) fail(`${where} repeats the key "${key}"`);
      seen.add(key);
    }
  }
  for (const key of limited) if (rotation.includes(key)) fail(`${where} has "${key}" in both rotation and limited`);
  if (!rotation.includes(mascot)) fail(`${where}.mascot "${mascot}" must be in its rotation`);
  if (!Number.isInteger(version) || version < 1) fail(`${where}.version must be a positive whole number`);
  for (const [field, texts] of [['label', label], ['card', card]]) {
    for (const locale of LOCALES) if (!hasText(texts?.[locale])) fail(`${where}.${field} needs "${locale}" text`);
  }
  for (const locale of LOCALES) {
    if (!card[locale].includes('{count}')) fail(`${where}.card.${locale} must contain {count}`);
    if (/\p{Nd}/u.test(card[locale])) fail(`${where}.card.${locale} must not type a number: {count} is filled in from the list`);
  }
  const keys = [...rotation, ...limited];
  const names = {};
  for (const key of keys) {
    if (typeof key !== 'string' || !Object.hasOwn(Pixel.SPRITES, key)) fail(`"${key}" in ${where} is not drawn in SPRITES`);
    checkSprite(key, Pixel.SPRITES[key]);
    const name = Object.hasOwn(Pixel.NAMES, key) ? Pixel.NAMES[key] : undefined;
    if (!hasText(name?.en) || !hasText(name?.zh) || !hasText(name?.cn)) {
      fail(`${key} needs English (en), Traditional (zh) and Simplified (cn) names in NAMES`);
    }
    names[key] = { en: name.en, 'zh-Hant': name.zh, 'zh-CN': name.cn };
  }
  return { themeId, version, source: 'assets/sprites.js', mascot, keys, names };
}

/** The list file of one theme. Throws on any rule that theme breaks. */
export function buildManifest(source, themeId) {
  return manifestOf(load(source), themeId);
}

/** Every theme's list file, keyed by theme id, once every drawing belongs to a theme. */
export function buildAll(source) {
  const Pixel = load(source);
  const manifests = {};
  for (const themeId of Object.keys(Pixel.THEMES)) manifests[themeId] = manifestOf(Pixel, themeId);
  const listed = new Set(Object.values(manifests).flatMap(manifest => manifest.keys));
  for (const key of Object.keys(Pixel.SPRITES)) {
    if (!listed.has(key)) fail(`${key} is drawn but is in no theme's rotation or limited`);
  }
  return manifests;
}

function main(args) {
  const manifests = buildAll(readFileSync(SPRITES_PATH, 'utf8'));
  const wanted = new Set(Object.keys(manifests).map(themeId => `${themeId}.json`));
  const stale = existsSync(THEMES_DIR)
    ? readdirSync(THEMES_DIR).filter(name => name.endsWith('.json') && !wanted.has(name)).sort()
    : [];

  if (args.includes('--check')) {
    const problems = [];
    for (const [themeId, manifest] of Object.entries(manifests)) {
      const path = join(THEMES_DIR, `${themeId}.json`);
      if (!existsSync(path)) {
        problems.push(`themes/${themeId}.json is missing`);
        continue;
      }
      let committed;
      try {
        committed = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        problems.push(`themes/${themeId}.json is not valid JSON`);
        continue;
      }
      if (isDeepStrictEqual(committed, manifest)) continue;
      const dropped = (Array.isArray(committed.keys) ? committed.keys : []).filter(key => !manifest.keys.includes(key));
      problems.push(`themes/${themeId}.json does not match assets/sprites.js`
        + (dropped.length ? `, which drops ${dropped.join(', ')}: a released key must never leave its theme` : ''));
    }
    for (const name of stale) problems.push(`themes/${name} belongs to no theme in assets/sprites.js`);
    if (problems.length) {
      for (const problem of problems) console.error(problem);
      console.error('Run: node scripts/theme-manifest.mjs');
      process.exitCode = 1;
      return;
    }
    for (const [themeId, manifest] of Object.entries(manifests)) {
      console.log(`themes/${themeId}.json is current (${manifest.keys.length} collectibles).`);
    }
    return;
  }

  mkdirSync(THEMES_DIR, { recursive: true });
  for (const [themeId, manifest] of Object.entries(manifests)) {
    writeFileSync(join(THEMES_DIR, `${themeId}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`wrote themes/${themeId}.json — ${manifest.keys.length} collectibles`);
  }
  for (const name of stale) {
    rmSync(join(THEMES_DIR, name));
    console.log(`removed themes/${name} — no theme in assets/sprites.js has that id`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
