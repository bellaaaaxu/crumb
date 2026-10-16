/* The helpers of app/pixels.js, against the real assets/sprites.js and the theme list files,
 * with the pixel table where a page has it: a global named Pixel. Most touch no browser API,
 * so Node runs them as they are; the tests of those that do (colourToken, drawing on a canvas)
 * stub only what that code reads and remove the stub afterwards. */
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
const ODD_IDS = [undefined, null, '', 'nosuchtheme', 'constructor', '__proto__', 'toString', 42, {}];

test('every theme in sprites.js is offered, Pastry shop first', () => {
  assert.deepEqual(pixels.themeIds(), Object.keys(Pixel.THEMES));
  assert.equal(pixels.themeIds()[0], 'default');
  assert.deepEqual(pixels.themeIds(), ['default', 'bakery', 'cafe'], 'Café last: the cards come in the order the server lists the themes');
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
  assert.equal(pixels.mascotKey('cafe'), 'hotcoffee');
  assert.deepEqual(pixels.themeKeysOf('default'), [...Pixel.CYCLE, ...Pixel.LIMITED]);
  assert.equal(pixels.themeKeysOf('bakery').length, 24);
  assert.equal(pixels.themeKeysOf('cafe').length, 24);
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
  assert.equal(pixels.themeLabel('cafe', 'en'), 'Café');
  assert.equal(pixels.themeLabel('cafe', 'zh-CN'), '咖啡店');
  assert.equal(pixels.themeCard('cafe', 'en'), 'Café · 24 coffees and sweets');
  assert.equal(pixels.themeCard('cafe', 'zh-CN'), '咖啡店 · 24 款咖啡和甜点');
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
  assert.equal(pixels.iconHref('cafe'), 'icons/cafe/favicon.svg');
  assert.equal(pixels.touchIconHref('cafe'), 'icons/cafe/icon-180.png');
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
    assert.equal(pixels.iconHref('nosuchtheme', current), 'icons/default/favicon.svg', current);
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

test('only a theme with colours of its own names a page colour: Café; Pastry shop, Bakery, an id this page does not know and a page without the table have none', () => {
  assert.equal(pixels.themeBackground('cafe'), '#160F0A');
  assert.equal(pixels.themeBackground('cafe'), Pixel.THEMES.cafe.background);
  assert.deepEqual(pixels.themeIds().filter(id => pixels.themeBackground(id) !== null), ['cafe']);
  for (const id of ['default', 'bakery', ...ODD_IDS]) assert.equal(pixels.themeBackground(id), null, String(id));
  assert.equal(bare.themeBackground('cafe'), null);
});

test('a colour for a canvas is read from the page root\'s style variables on each call, without the spaces around it', t => {
  // Only what colourToken reads, and gone again afterwards, so the other tests see Node as it is.
  const root = { nodeName: 'HTML' };
  const values = { '--digit': ' #4a2f1b', '--wordmark': '#ecbc7c  ' };
  const asked = [];
  globalThis.document = { documentElement: root };
  globalThis.getComputedStyle = node => ({
    getPropertyValue: name => {
      asked.push({ node, name });
      return values[name] ?? '';
    },
  });
  t.after(() => {
    delete globalThis.document;
    delete globalThis.getComputedStyle;
  });
  assert.equal(pixels.colourToken('--digit'), '#4a2f1b');
  assert.equal(pixels.colourToken('--wordmark'), '#ecbc7c');
  // A variable the stylesheet does not set reads as nothing.
  assert.equal(pixels.colourToken('--nosuch'), '');
  assert.deepEqual(asked.map(each => each.name), ['--digit', '--wordmark', '--nosuch']);
  assert.ok(asked.every(each => each.node === root), 'always the page root, never a canvas');
});

/* ---------------------------------------------------------------- steam */

test('only a drawing marked with steam steams: Hot Coffee, never the other mascots or a key the table lacks', () => {
  assert.equal(pixels.hasSteam('hotcoffee'), true);
  for (const key of ['laopo', 'toastbite', undefined, null, '', 'unicorn', 'constructor', '__proto__', 'toString', 42]) {
    assert.equal(pixels.hasSteam(key), false, String(key));
  }
  // Each drawing answers by its own steam field, whichever themes it is in.
  for (const [key, sprite] of Object.entries(Pixel.SPRITES)) assert.equal(pixels.hasSteam(key), Boolean(sprite.steam), key);
  assert.equal(bare.hasSteam('hotcoffee'), false);
});

test('a steam cycle is the one sprites.js has: 8 steps of 120 ms, and none without the pixel table', () => {
  assert.deepEqual(pixels.steamCycle(), { steps: Pixel.STEAM_STEPS.length, stepMs: Pixel.STEAM_STEP_MS });
  // Design section 3 and its assumption 5: a tap runs one cycle, 960 ms.
  assert.deepEqual(pixels.steamCycle(), { steps: 8, stepMs: 120 });
  assert.equal(bare.steamCycle(), null);
});

/* What a drawing leaves on a canvas: `colour x,y` for each square filled, in the order filled.
 * The canvas is a stand-in with only what sprites.js's setupCanvas and drawSprite use of a
 * canvas and its 2D context. */
function cellsDrawnBy(draw) {
  const cells = [];
  const context = {
    fillStyle: '',
    setTransform() {},
    clearRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    fillRect(x, y) { cells.push(`${this.fillStyle} ${x},${y}`); },
  };
  const returned = draw({ style: {}, getContext: () => context });
  return { returned, cells };
}

test('drawCollection draws one step of the steam when given it, and the whole drawing without', t => {
  // setupCanvas reads the screen's pixel ratio from window, which Node does not have: lent here
  // and taken back when the test ends, so the other tests see Node as it is.
  assert.equal(typeof globalThis.window, 'undefined', 'Node has no window of its own');
  globalThis.window = { devicePixelRatio: 1 };
  t.after(() => { delete globalThis.window; });
  const bySprites = (key, step) => cellsDrawnBy(canvas => Pixel.drawSprite(canvas, Pixel.SPRITES[key], 3, 0, step)).cells;
  const whole = bySprites('hotcoffee');

  // Left out, it is the whole drawing, as before there was steam.
  const plain = cellsDrawnBy(canvas => pixels.drawCollection(canvas, 'hotcoffee', 3));
  assert.equal(plain.returned, true);
  assert.deepEqual(plain.cells, whole);
  for (let step = 0; step < Pixel.STEAM_STEPS.length; step += 1) {
    const stepped = cellsDrawnBy(canvas => pixels.drawCollection(canvas, 'hotcoffee', 3, step));
    assert.equal(stepped.returned, true, `step ${step}`);
    assert.deepEqual(stepped.cells, bySprites('hotcoffee', step), `step ${step}`);
    // Some of the steam is hidden at every step: none looks like the cup at rest.
    assert.ok(stepped.cells.length < whole.length, `step ${step}`);
  }
  // A drawing with no steam is whole at any step.
  assert.deepEqual(cellsDrawnBy(canvas => pixels.drawCollection(canvas, 'laopo', 3, 5)).cells, bySprites('laopo'));
  // Without the pixel table nothing is drawn.
  const none = cellsDrawnBy(canvas => bare.drawCollection(canvas, 'hotcoffee', 3, 2));
  assert.equal(none.returned, false);
  assert.deepEqual(none.cells, []);
});
