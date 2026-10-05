/* Builds the tab and home-screen icons of every collection theme from the same sprite table
 * the app draws from, the way make-og.mjs builds the share card. `npm run themes` runs it
 * after the theme lists; on its own: node scripts/make-icons.mjs
 *
 *   Pastry shop (default)  app/icons/icon-{180,192,512}.png. Its tab icon, app/favicon.svg,
 *                          is drawn by hand and never written here.
 *   every other theme      app/icons/<id>/icon-{180,192,512}.png and app/icons/<id>/favicon.svg
 *
 * Importing this file writes nothing: tests/icons.test.mjs draws the icons again with the
 * functions below and compares pixels, so a mascot changed without a rerun fails the tests.
 * It is not part of serving the app — there is still no build step. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTRY_SHOP = 'default';
const GRID = 12;
const BACKGROUND = '#F2E7CE';
export const ICON_SIZES = [180, 192, 512];

const hex = value => [1, 3, 5].map(at => parseInt(value.slice(at, at + 2), 16));
const shown = path => relative(root, path).split(sep).join('/');

/** The sprite table, evaluated in an empty context: sprites.js touches no browser API at load time. */
export function loadPixel() {
  const source = readFileSync(join(root, 'assets', 'sprites.js'), 'utf8');
  return vm.runInNewContext(`${source}\n;Pixel`, Object.create(null), { timeout: 1000 });
}

/** A size x size RGB picture: the sprite on the cream background, 72% of the icon wide in whole
 * pixels per cell, centred by its drawn content (Pixel.offset) as everywhere else. */
export function iconPixels(Pixel, spriteKey, size) {
  const sprite = Pixel.SPRITES[spriteKey];
  const pixels = Buffer.alloc(size * size * 3);
  const background = hex(BACKGROUND);
  for (let i = 0; i < size * size; i += 1) pixels.set(background, i * 3);
  const scale = Math.floor((size * 0.72) / GRID);
  const origin = Math.floor((size - GRID * scale) / 2);
  const { dx, dy } = Pixel.offset(sprite);
  sprite.rows.forEach((row, r) => [...row].forEach((key, c) => {
    const colour = sprite.palette[key];
    if (!colour) return;
    const rgb = hex(colour);
    for (let y = 0; y < scale; y += 1) {
      for (let x = 0; x < scale; x += 1) {
        pixels.set(rgb, ((origin + (r + dy) * scale + y) * size + origin + (c + dx) * scale + x) * 3);
      }
    }
  }));
  return pixels;
}

/** The tab icon: the sprite as a 12x12 SVG, one square per painted cell, centred the same way,
 * on the background of the hand-drawn Pastry shop favicon. */
export function faviconSvg(Pixel, spriteKey) {
  const sprite = Pixel.SPRITES[spriteKey];
  const { dx, dy } = Pixel.offset(sprite);
  const cells = [];
  sprite.rows.forEach((row, r) => [...row].forEach((key, c) => {
    const colour = sprite.palette[key];
    if (colour) cells.push(`<rect x="${c + dx}" y="${r + dy}" width="1" height="1" fill="${colour}"/>`);
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges">`
    + `<rect width="${GRID}" height="${GRID}" fill="${BACKGROUND}"/>${cells.join('')}</svg>\n`;
}

/* Pastry shop's files stay where 0.2 put them; every other theme gets a folder of its own. */
async function writeIcons(Pixel, themeId) {
  const { mascot } = Pixel.THEMES[themeId];
  const dir = themeId === PASTRY_SHOP ? join(root, 'app', 'icons') : join(root, 'app', 'icons', themeId);
  mkdirSync(dir, { recursive: true });
  for (const size of ICON_SIZES) {
    const out = join(dir, `icon-${size}.png`);
    await sharp(iconPixels(Pixel, mascot, size), { raw: { width: size, height: size, channels: 3 } }).png().toFile(out);
    console.log(`wrote ${shown(out)}`);
  }
  if (themeId === PASTRY_SHOP) return;
  const favicon = join(dir, 'favicon.svg');
  writeFileSync(favicon, faviconSvg(Pixel, mascot));
  console.log(`wrote ${shown(favicon)}`);
}

async function main() {
  const Pixel = loadPixel();
  for (const themeId of Object.keys(Pixel.THEMES)) await writeIcons(Pixel, themeId);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
