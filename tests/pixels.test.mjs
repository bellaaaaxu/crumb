/* The theme helpers of app/pixels.js, against the real assets/sprites.js and the theme list
 * files. They touch no browser API, so Node runs them once the pixel table is where a page
 * has it: a global named Pixel. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// sprites.js touches no browser API at load time, so it runs here as it is (as in
// scripts/make-icons.mjs). new Function keeps it in this realm, so its arrays compare equal.
const source = readFileSync(new URL('../assets/sprites.js', import.meta.url), 'utf8');
const Pixel = new Function(`${source}\nreturn Pixel;`)();
globalThis.Pixel = Pixel;
const pixels = await import('../app/pixels.js');
// A second copy of the module that finds no pixel table, as a page does when sprites.js did not load.
delete globalThis.Pixel;
const bare = await import('../app/pixels.js?without-sprites');

const committed = id => JSON.parse(readFileSync(new URL(`../themes/${id}.json`, import.meta.url), 'utf8'));
const shipped = path => existsSync(new URL(`../app/${path}`, import.meta.url));
// Missing, empty, a theme from a newer Crumb, names every JavaScript object answers to, not a string.
const ODD_IDS = [undefined, null, '', 'cafe', 'constructor', '__proto__', 'toString', 42, {}];

test('every theme in sprites.js is offered, Pastry shop first', () => {
  assert.deepEqual(pixels.themeIds(), Object.keys(Pixel.THEMES));
  assert.equal(pixels.themeIds()[0], 'default');
  assert.ok(pixels.themeIds().includes('bakery'));
});

test('each theme\'s mascot and keys are its list file\'s, so a card counts what the server unlocks', () => {
  for (const id of pixels.themeIds()) {
    const list = committed(id);
    assert.equal(pixels.themeEntry(id), Pixel.THEMES[id], id);
    assert.equal(pixels.mascotKey(id), list.mascot, id);
    assert.deepEqual(pixels.themeKeysOf(id), list.keys, id);
  }
  assert.equal(pixels.mascotKey('default'), 'laopo');
  assert.equal(pixels.mascotKey('bakery'), 'toastbite');
  assert.deepEqual(pixels.themeKeysOf('default'), [...Pixel.CYCLE, ...Pixel.LIMITED]);
  assert.equal(pixels.themeKeysOf('bakery').length, 24);
  // A copy: whoever holds it cannot change the theme.
  pixels.themeKeysOf('bakery').push('unicorn');
  assert.equal(pixels.themeKeysOf('bakery').length, 24);
});

test('an unknown or missing theme id is Pastry shop\'s, and nothing throws', () => {
  for (const id of ODD_IDS) {
    const label = String(id);
    assert.equal(pixels.themeEntry(id), Pixel.THEMES.default, label);
    assert.equal(pixels.mascotKey(id), 'laopo', label);
    assert.deepEqual(pixels.themeKeysOf(id), pixels.themeKeysOf('default'), label);
    assert.equal(pixels.themeLabel(id, 'en'), 'Pastry shop', label);
    assert.equal(pixels.iconHref(id), 'favicon.svg', label);
    assert.equal(pixels.touchIconHref(id), 'icons/icon-180.png', label);
  }
});

test('crumbs take the outline colour of the drawing, or the wife cake\'s brown', () => {
  assert.equal(pixels.outlineColour('laopo'), '#5C3A1D');
  assert.equal(pixels.outlineColour('toastbite'), Pixel.SPRITES.toastbite.palette.X);
  for (const key of [undefined, null, '', 'unicorn', 'constructor', '__proto__']) {
    assert.equal(pixels.outlineColour(key), '#5C3A1D', String(key));
  }
});

test('a theme\'s name and card text come in both languages, the count worked out from its list', () => {
  assert.equal(pixels.themeLabel('default', 'en'), 'Pastry shop');
  assert.equal(pixels.themeLabel('default', 'zh-CN'), '饼店');
  assert.equal(pixels.themeLabel('bakery', 'en'), 'Bakery');
  assert.equal(pixels.themeLabel('bakery', 'zh-CN'), '面包店');
  assert.equal(pixels.themeCard('default', 'en'), 'Pastry shop · 39 pastries');
  assert.equal(pixels.themeCard('default', 'zh-CN'), '饼店 · 39 款点心');
  assert.equal(pixels.themeCard('bakery', 'en'), 'Bakery · 24 breads and cakes');
  assert.equal(pixels.themeCard('bakery', 'zh-CN'), '面包店 · 24 款面包和蛋糕');
  // A language the theme has no text in reads English.
  for (const locale of [undefined, 'fr', 'constructor']) {
    assert.equal(pixels.themeLabel('bakery', locale), 'Bakery', String(locale));
    assert.equal(pixels.themeCard('bakery', locale), 'Bakery · 24 breads and cakes', String(locale));
  }
});

test('Pastry shop keeps the icon addresses index.html names; other themes use their own folder, and every file is shipped', () => {
  assert.equal(pixels.iconHref('default'), 'favicon.svg');
  assert.equal(pixels.touchIconHref('default'), 'icons/icon-180.png');
  assert.equal(pixels.iconHref('bakery'), 'icons/bakery/favicon.svg');
  assert.equal(pixels.touchIconHref('bakery'), 'icons/bakery/icon-180.png');
  for (const id of pixels.themeIds()) {
    assert.ok(shipped(pixels.iconHref(id)), pixels.iconHref(id));
    assert.ok(shipped(pixels.touchIconHref(id)), pixels.touchIconHref(id));
  }
});

test('a link that has left index.html\'s icon addresses comes back to Pastry shop by icons/default/, never by them', () => {
  // The server answers index.html's addresses in the team's theme, so the browser may hold
  // another theme's picture for them. A page that has only ever shown Pastry shop keeps them.
  for (const current of [undefined, null, 'favicon.svg']) assert.equal(pixels.iconHref('default', current), 'favicon.svg', String(current));
  for (const current of [undefined, null, 'icons/icon-180.png']) assert.equal(pixels.touchIconHref('default', current), 'icons/icon-180.png', String(current));
  // Coming from Bakery's, and from then on: Pastry shop's own folder, whose picture never changes.
  for (const current of ['icons/bakery/favicon.svg', 'icons/default/favicon.svg']) {
    assert.equal(pixels.iconHref('default', current), 'icons/default/favicon.svg', current);
    assert.equal(pixels.iconHref('cafe', current), 'icons/default/favicon.svg', current);
  }
  for (const current of ['icons/bakery/icon-180.png', 'icons/default/icon-180.png'])
    assert.equal(pixels.touchIconHref('default', current), 'icons/default/icon-180.png', current);
  // Every other theme has one address, wherever the link was.
  for (const current of [undefined, 'favicon.svg', 'icons/default/favicon.svg']) assert.equal(pixels.iconHref('bakery', current), 'icons/bakery/favicon.svg');
  for (const current of [undefined, 'icons/icon-180.png', 'icons/default/icon-180.png']) assert.equal(pixels.touchIconHref('bakery', current), 'icons/bakery/icon-180.png');
});

test('with no pixel table nothing is drawn, the icons are Pastry shop\'s and nothing throws', () => {
  assert.deepEqual(bare.themeIds(), []);
  assert.equal(bare.themeEntry('bakery'), null);
  assert.equal(bare.mascotKey('bakery'), null);
  assert.deepEqual(bare.themeKeysOf('bakery'), []);
  assert.equal(bare.outlineColour('toastbite'), '#5C3A1D');
  assert.equal(bare.themeLabel('bakery', 'en'), '');
  assert.equal(bare.themeCard('bakery', 'en'), '');
  assert.equal(bare.iconHref('bakery'), 'favicon.svg');
  assert.equal(bare.touchIconHref('bakery'), 'icons/icon-180.png');
});
