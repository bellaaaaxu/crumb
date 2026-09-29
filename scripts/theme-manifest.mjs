/* Builds themes/default.json — the list of collectible sprites the server
 * unlocks — from the sprite table in assets/sprites.js.
 *
 *   node scripts/theme-manifest.mjs           write themes/default.json
 *   node scripts/theme-manifest.mjs --check   fail if the committed file is stale
 *
 * The keys in the manifest are stored in members' collections forever, so a
 * key may be added but never removed, renamed or reused (docs/THEMES.md). */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPRITES_PATH = join(root, 'assets', 'sprites.js');
const MANIFEST_PATH = join(root, 'themes', 'default.json');

export const THEME_ID = 'default';
export const THEME_VERSION = 1;
const GRID = 12;

/* sprites.js carries Traditional Chinese names; the zh-CN interface shows these. */
const SIMPLIFIED = {
  laopo: '老婆饼', tart: '蛋挞', bolo: '菠萝包', gaimei: '鸡尾包', sausage: '肠仔包',
  caketriangle: '三角蛋糕', papercake: '纸包蛋糕', swissroll: '瑞士卷', boloyau: '菠萝油',
  coconuttart: '椰挞', eggyolk: '蛋黄酥', centuryegg: '皮蛋酥', taro: '芋头酥', bridecake: '嫁女饼',
  dragonphoenix: '龙凤饼', mungbean: '绿豆糕', mochi: '绿茶红豆糯米糍', charsiu: '叉烧酥',
  walnut: '核桃酥', chickenpie: '鸡批', blackforest: '黑森林蛋糕', mango: '芒果慕斯蛋糕',
  almond: '杏仁条', creambun: '奶油面包', mooncake: '莲蓉蛋黄月饼', shrimpchip: '虾片',
  cnybox: '贺年全盒', porttart: '葡式蛋挞', nougat: '咸蛋黄肉松牛轧糖', datepastry: '蛋黄枣泥酥',
  blacksesamepastry: '黑芝麻酥', blacksesamemochi: '黑芝麻糯米糍', pumpkintuile: '南瓜子薄脆',
  cheesehotdog: '芝士热狗包', pistachiohorn: '开心果奶油号角', radishcake: '萝卜糕',
  tarocake: '芋头腊肠糕', ricecake: '椰汁黄糖年糕', chestnut: '栗子蛋糕',
};

function fail(message) {
  throw new Error(`assets/sprites.js: ${message}`);
}

function checkSprite(key, sprite) {
  if (!/^[a-z][a-z0-9]{1,31}$/.test(key)) fail(`key "${key}" must be lowercase letters and digits`);
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

/** Evaluates the sprite table in an empty context and returns the manifest object. */
export function buildManifest(source) {
  const Pixel = vm.runInNewContext(`${source}\n;Pixel`, Object.create(null), { timeout: 1000 });
  const keys = [...Pixel.CYCLE, ...Pixel.LIMITED];
  if (new Set(keys).size !== keys.length) fail('CYCLE and LIMITED repeat a key');
  const drawn = Object.keys(Pixel.SPRITES).sort();
  if (JSON.stringify([...keys].sort()) !== JSON.stringify(drawn)) fail('every sprite must be in CYCLE or LIMITED, exactly once');
  const names = {};
  for (const key of keys) {
    checkSprite(key, Pixel.SPRITES[key]);
    const name = Pixel.NAMES[key];
    if (!name?.en || !name?.zh) fail(`${key} needs an English and a Chinese name`);
    if (!SIMPLIFIED[key]) fail(`${key} needs a Simplified Chinese name in scripts/theme-manifest.mjs`);
    names[key] = { en: name.en, 'zh-Hant': name.zh, 'zh-CN': SIMPLIFIED[key] };
  }
  return { themeId: THEME_ID, version: THEME_VERSION, source: 'assets/sprites.js', keys, names };
}

function main(args) {
  const manifest = buildManifest(readFileSync(SPRITES_PATH, 'utf8'));
  if (args.includes('--check')) {
    const committed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    if (!isDeepStrictEqual(committed, manifest)) {
      console.error('themes/default.json does not match assets/sprites.js. Run: node scripts/theme-manifest.mjs');
      process.exit(1);
    }
    for (const key of committed.keys) if (!manifest.keys.includes(key)) fail(`key "${key}" was removed`);
    console.log(`themes/default.json is current (${manifest.keys.length} sprites).`);
    return;
  }
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote themes/default.json — ${manifest.keys.length} sprites`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
