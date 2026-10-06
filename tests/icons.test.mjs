/* The tab and home-screen icons of every collection theme. The committed files must be what
 * scripts/make-icons.mjs draws from the theme's current mascot (pixels compared, not bytes),
 * and the server answers the fixed icon addresses with the team's own theme, and each theme's
 * own addresses with that theme's. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ICON_SIZES, faviconSvg, iconPixels, loadPixel } from '../scripts/make-icons.mjs';
import { setupOrganization, startServer } from './helpers.mjs';

const APP = fileURLToPath(new URL('../app/', import.meta.url));
const Pixel = loadPixel();
const OTHER_THEMES = Object.keys(Pixel.THEMES).filter(id => id !== 'default');
const RERUN = 'Run: npm run themes';
const ADDRESSES = ['/favicon.svg', ...ICON_SIZES.map(size => `/icons/icon-${size}.png`)];

/* git may check text files out with CRLF on Windows; the drawing is what is compared. */
const svgText = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

async function assertDrawnFrom(path, mascot, size, label) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [size, size, 3], label);
  assert.ok(data.equals(iconPixels(Pixel, mascot, size)), `${label} is not the current ${mascot} drawing. ${RERUN}`);
}

/* A square tab icon whose first rect is the background over the whole box, and whose every
 * other rect leaves the outermost ring of cells to it. */
function assertMargin(svg, label) {
  const [x0, y0, width, height] = /viewBox="([^"]+)"/.exec(svg)[1].split(' ').map(Number);
  assert.deepEqual([x0, y0, width], [0, 0, height], `${label} has a square box`);
  const rects = [...svg.matchAll(/<rect ([^>]*)\/>/g)].map(([, attributes]) => Object.fromEntries(
    [...attributes.matchAll(/([a-z]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])));
  assert.deepEqual([rects[0].x ?? '0', rects[0].y ?? '0', rects[0].width, rects[0].height], ['0', '0', String(width), String(width)],
    `${label} starts with the background over the whole box`);
  for (const rect of rects.slice(1)) {
    const [x, y, w, h] = [rect.x, rect.y, rect.width, rect.height].map(Number);
    assert.ok(x >= 1 && y >= 1 && x + w <= width - 1 && y + h <= width - 1, `${label}: ${JSON.stringify(rect)} is in the margin`);
  }
}

/* The file a fixed address should send for a theme: Pastry shop's are in their 0.2 places. */
function fileFor(themeId, address) {
  const name = address.split('/').pop();
  if (themeId !== 'default') return join(APP, 'icons', themeId, name);
  return address === '/favicon.svg' ? join(APP, 'favicon.svg') : join(APP, 'icons', name);
}

async function assertServesAt(base, address, file, label) {
  const response = await fetch(base + address);
  assert.equal(response.status, 200, address);
  assert.match(response.headers.get('content-type'), address.endsWith('.svg') ? /^image[/]svg[+]xml/ : /^image[/]png$/, address);
  assert.equal(response.headers.get('cache-control'), 'no-store', address);
  const body = Buffer.from(await response.arrayBuffer());
  assert.ok(body.equals(readFileSync(file)), `${address} should be the ${label} file`);
}

async function assertServes(base, themeId) {
  for (const address of ADDRESSES) await assertServesAt(base, address, fileFor(themeId, address), themeId);
}

/* Each theme's own addresses, icons/<id>/, Pastry shop's included: always that theme's files,
 * whatever the team's theme. A page whose links leave another theme's for Pastry shop's points
 * at icons/default/ (app/pixels.js), so it never meets a picture of another theme there. */
async function assertOwnAddresses(base) {
  for (const themeId of Object.keys(Pixel.THEMES)) {
    for (const address of ADDRESSES)
      await assertServesAt(base, `/icons/${themeId}/${address.split('/').pop()}`, fileFor(themeId, address), themeId);
  }
}

test('every theme but Pastry shop has its four icon files, drawn from its current mascot', async () => {
  assert.ok(OTHER_THEMES.includes('bakery'), 'Bakery is one of the themes, so the loop below is not empty');
  for (const themeId of OTHER_THEMES) {
    const { mascot } = Pixel.THEMES[themeId];
    const dir = join(APP, 'icons', themeId);
    for (const file of ['favicon.svg', ...ICON_SIZES.map(size => `icon-${size}.png`)])
      assert.ok(existsSync(join(dir, file)), `app/icons/${themeId}/${file} is missing. ${RERUN}`);
    assert.equal(svgText(join(dir, 'favicon.svg')), faviconSvg(Pixel, mascot),
      `app/icons/${themeId}/favicon.svg is not the current ${mascot} drawing. ${RERUN}`);
    assertMargin(faviconSvg(Pixel, mascot), `app/icons/${themeId}/favicon.svg`);
    for (const size of ICON_SIZES)
      await assertDrawnFrom(join(dir, `icon-${size}.png`), mascot, size, `app/icons/${themeId}/icon-${size}.png`);
  }
  const folders = readdirSync(join(APP, 'icons'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  assert.deepEqual(folders, [...OTHER_THEMES].sort(),
    'app/icons/ has one folder per theme other than Pastry shop: add a theme\'s with npm run themes, and delete the folder of a theme no longer in THEMES');
});

test('a generated tab icon keeps a margin of background one cell wide, like the hand-drawn one', () => {
  // Bitten Toast fills every edge of its grid, so it is the case that needs the margin.
  assert.ok(Pixel.SPRITES.toastbite.rows.some(row => row[0] !== '.' && row.at(-1) !== '.'), 'toastbite reaches both side edges');
  for (const themeId of Object.keys(Pixel.THEMES)) assertMargin(faviconSvg(Pixel, Pixel.THEMES[themeId].mascot), themeId);
  assertMargin(svgText(join(APP, 'favicon.svg')), 'app/favicon.svg');
});

test('Pastry shop keeps its 0.2 icons: PNGs drawn from its mascot and the hand-drawn favicon.svg', async () => {
  const { mascot } = Pixel.THEMES.default;
  for (const size of ICON_SIZES)
    await assertDrawnFrom(join(APP, 'icons', `icon-${size}.png`), mascot, size, `app/icons/icon-${size}.png`);
  // make-icons never writes app/favicon.svg, so it is not the generated drawing of the mascot.
  assert.match(svgText(join(APP, 'favicon.svg')), /^<svg /);
  assert.notEqual(svgText(join(APP, 'favicon.svg')), faviconSvg(Pixel, mascot));
});

test('importing scripts/make-icons.mjs writes no file', async () => {
  const files = [join(APP, 'favicon.svg'), ...ICON_SIZES.map(size => join(APP, 'icons', `icon-${size}.png`))];
  const before = files.map(file => statSync(file).mtimeMs);
  await import(`../scripts/make-icons.mjs?again=${Date.now()}`);
  assert.deepEqual(files.map(file => statSync(file).mtimeMs), before);
});

test('before setup the icon addresses serve the Pastry shop icons', async t => {
  const server = await startServer(t);
  await assertServes(server.base, 'default');
  await assertOwnAddresses(server.base);
});

test('each team gets the icons of its own theme at the same addresses', async t => {
  const server = await startServer(t);
  await setupOrganization(server);
  await assertServes(server.base, 'default');
  await assertOwnAddresses(server.base);
  // Set directly: this is about the icons, not about how a team picks its theme.
  server.db.prepare(`UPDATE organization SET theme = 'bakery'`).run();
  assert.ok(!readFileSync(fileFor('bakery', '/favicon.svg')).equals(readFileSync(fileFor('default', '/favicon.svg'))),
    'the Bakery tab icon differs from the Pastry shop one, so the check below can tell them apart');
  await assertServes(server.base, 'bakery');
  await assertOwnAddresses(server.base);
});
