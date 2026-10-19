/* Colours in the stylesheets. Every colour comes from a variable, so a theme with colours of
 * its own only has to give its own set of them; the light set is Pastry shop's and Bakery's. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blend, contrast, parseColour, stops } from './contrast.mjs';
import { normalise, parseCss, splitSelectors, substitute, topLevel, variablesOf } from './css.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const where = rule => [...rule.context, rule.selector].join(' / ');

/* ------------------------------------------------------------------ the groups */

/* Every variable of the app's light set: the colours (and the grounds, lines and sizes that go
 * with them) a theme with colours of its own gives again. */
const APP_VARIABLES = [
  '--bg', '--page-art', '--tile', '--lift', '--lamp-bg', '--lamp-shadow', '--paper', '--chosen',
  '--ink', '--holder-ink', '--ink-soft', '--card-soft', '--tile-label', '--accent', '--price', '--plus', '--minus',
  '--digit', '--wordmark',
  '--primary-bg', '--primary-ink', '--primary-shadow', '--primary-shadow-active',
  '--confirm-bg', '--confirm-ink', '--confirm-shadow', '--confirm-shadow-active',
  '--btn-ledge', '--control-accent', '--focus',
  '--frame', '--intro-ledge', '--link-panel-border', '--bar-bg', '--bar-ink', '--bar-shadow', '--bar-dot',
  '--pill-bg', '--pill-ink', '--skip-bg', '--skip-ink', '--bubble-bg', '--bubble-ink',
  '--line', '--row-line', '--rule-style',
  '--slot-bg', '--slot-border', '--slot-shadow', '--slot-empty-bg', '--slot-empty-border', '--slot-empty-shadow', '--slot-ink',
  '--face-bg', '--face-ring', '--face-pad', '--face-box', '--face-radius', '--mascot-radius', '--row-icon-size',
  '--pic-bg', '--pic-ring', '--pic-pad', '--pic-box', '--pic-radius',
  '--brand-logo-bg', '--brand-logo-pad', '--auth-logo-bg', '--auth-logo-pad', '--auth-logo-radius', '--logo-preview-bg',
  '--field-bg', '--field-border', '--key-bg', '--key-border', '--key-ledge', '--amount-zero',
  '--warn-bg', '--warn-border', '--warn-ink', '--ok-bg', '--ok-border', '--ok-ink', '--bad-bg', '--bad-border', '--bad-ink',
  '--toast-bg', '--toast-border', '--toast-ink', '--toast-shadow',
  '--toast-error-bg', '--toast-error-border', '--toast-error-ink', '--toast-error-shadow',
];

/* 0.3's variables that each served several uses; they are split by use and gone. */
const SPLIT = ['--wood', '--wood-deep', '--gold', '--gold-deep'];

test('app/app.css: the light set sits on :root and [data-theme] and gives every themed variable once', () => {
  const rules = parseCss(read('app/app.css'));
  const light = topLevel(rules, ':root, [data-theme]');
  assert.equal(light.length, 1, 'one light set');
  const plain = light[0].declarations.filter(({ property }) => !property.startsWith('--'));
  assert.deepEqual(plain.map(({ property, value }) => `${property}: ${value}`), ['color-scheme: light']);
  const names = light[0].declarations.filter(({ property }) => property.startsWith('--')).map(({ property }) => property);
  assert.equal(new Set(names).size, names.length, 'no variable given twice');
  assert.deepEqual([...names].sort(), [...APP_VARIABLES].sort());
  // The layout constants are the same in every theme, in a :root of their own.
  const constants = topLevel(rules, ':root');
  assert.equal(constants.length, 1, 'one :root group of constants');
  assert.deepEqual([...variablesOf(constants)], [['--radius-tile', '20px'], ['--radius-btn', '16px']]);
  assert.deepEqual(constants[0].declarations.filter(({ property }) => !property.startsWith('--')), []);
});

test('app/app.css: --wood, --wood-deep, --gold and --gold-deep are split by use and gone', () => {
  const found = [];
  for (const rule of parseCss(read('app/app.css'))) {
    for (const { property, value } of rule.declarations) {
      const reads = SPLIT.filter(name => new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(value));
      if (SPLIT.includes(property) || reads.length) found.push(`${where(rule)} { ${property}: ${value} }`);
    }
  }
  assert.deepEqual(found, []);
});

/* ------------------------------------------------------------------ no colour written out */

/* CSS named colours and system colours. `transparent`, `currentColor` and `inherit` are not
 * colours of a theme and stay allowed. */
const COLOUR_NAMES = new Set(`
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
  burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan
  darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid
  darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet
  deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro
  ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
  lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow
  lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine
  mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen
  mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace
  olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred
  papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue
  saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey
  snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow
  yellowgreen
  accentcolor accentcolortext activetext buttonborder buttonface buttontext canvas canvastext field
  fieldtext graytext highlight highlighttext linktext mark marktext selecteditem selecteditemtext visitedtext
`.trim().split(/\s+/));
const COLOUR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix']);

/* The colours written out in one declaration's value: whole value tokens only, after quoted
 * strings and url(…) are taken out, so `white-space: nowrap` or a font called 'Snow' are not
 * colours. */
function literalsIn(value) {
  const text = value.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, ' ').replace(/url\([^)]*\)/gi, ' ');
  const found = [];
  for (const [, name] of text.matchAll(/([a-z][a-z-]*)\(/gi)) {
    if (COLOUR_FUNCTIONS.has(name.toLowerCase())) found.push(`${name}(`);
  }
  for (const word of text.split(/[\s,/()]+/)) {
    if (word.startsWith('#') || COLOUR_NAMES.has(word.toLowerCase())) found.push(word);
  }
  return found;
}

/* Every declaration outside a custom property (--x: …) that writes a colour out. */
function writtenOut(rules) {
  const found = [];
  for (const rule of rules) {
    for (const { property, value } of rule.declarations) {
      if (property.startsWith('--') || !literalsIn(value).length) continue;
      found.push({ rule, property, value });
    }
  }
  return found;
}

/* The stylesheets whose every colour is a variable, and the few literals each keeps on purpose
 * (matched by the rule's selector, the property and the value). */
const STYLESHEETS = [
  {
    file: 'app/app.css',
    allowed: [
      // A QR code needs a white ground to scan, in every theme.
      { selector: '.qr-image', property: 'background', value: '#fff' },
      // The dialog scrim: older browsers do not let ::backdrop inherit a variable from the
      // dialog, so each theme's scrim is written out and chosen by the page's data-theme.
      { selector: '.dialog::backdrop', property: 'background', value: 'rgba(58, 36, 17, 0.45)' },
      { selector: '[data-theme="cafe"] .dialog::backdrop', property: 'background', value: 'rgba(0, 0, 0, 0.6)' },
    ],
  },
  {
    file: 'assets/style.css',
    // None: the demo has no QR code and no dialog. Its confetti and the crumbs' fallback colour
    // are in assets/app.js, not in the stylesheet.
    allowed: [],
  },
];

test('the colour scan reads values only, whole tokens, and knows every way to write a colour', () => {
  assert.deepEqual(literalsIn('nowrap'), []); // the value of white-space: the property name is never scanned
  assert.deepEqual(literalsIn("ui-rounded, 'Snow White', Roboto, sans-serif"), []);
  assert.deepEqual(literalsIn("url('#fff') no-repeat"), []);
  assert.deepEqual(literalsIn('transparent'), []);
  assert.deepEqual(literalsIn('currentColor'), []);
  assert.deepEqual(literalsIn('inherit'), []);
  assert.deepEqual(literalsIn('var(--tile)'), []);
  assert.deepEqual(literalsIn('repeating-linear-gradient(0deg, var(--x) 0 2px, transparent 2px 24px)'), []);
  assert.deepEqual(literalsIn('white'), ['white']);
  assert.deepEqual(literalsIn('2px solid Tan'), ['Tan']);
  assert.deepEqual(literalsIn('0 4px 0 #D3BC92'), ['#D3BC92']);
  assert.deepEqual(literalsIn('0 10px 26px rgba(74, 47, 27, 0.35)'), ['rgba(']);
  assert.deepEqual(literalsIn('hsl(30 40% 50%)'), ['hsl(']);
  assert.deepEqual(literalsIn('color-mix(in srgb, var(--a) 50%, var(--b))'), ['color-mix(']);
  assert.deepEqual(literalsIn('CanvasText'), ['CanvasText']);
});

test('the colour scan finds what 0.3.0 wrote out: every place the design lists', () => {
  const places = writtenOut(parseCss(read('tests/fixtures/0.3.0/app.css'))).map(({ rule, property }) => `${where(rule)} { ${property} }`);
  assert.deepEqual(places, [
    'body { background-image }',
    '.skip-link { color }',
    '.main-nav a[aria-current=\'page\'] { color }',
    '.menu a[aria-current=\'page\'] { color }',
    '.slot { box-shadow }',
    '.slot-name { color }',
    '.btn { box-shadow }',
    '.btn:active:not(:disabled) { box-shadow }',
    '.btn-primary { color }',
    '.quest-head { color }',
    '.badge-pending { background }',
    '.badge-pending { border-color }',
    '.badge-pending { color }',
    '.badge-completed, .badge-open, .badge-member-active { background }',
    '.badge-completed, .badge-open, .badge-member-active { border-color }',
    '.badge-completed, .badge-open, .badge-member-active { color }',
    '.badge-rejected, .badge-revoked, .badge-voided, .badge-closed, .badge-member-deactivated { background }',
    '.badge-rejected, .badge-revoked, .badge-voided, .badge-closed, .badge-member-deactivated { border-color }',
    '.badge-rejected, .badge-revoked, .badge-voided, .badge-closed, .badge-member-deactivated { color }',
    '.form-error { background }',
    '.form-error { color }',
    '.notice { background }',
    '.notice { border }',
    '.home-tip { background }',
    '.home-tip { border }',
    '.radio:has(input:checked) { background }',
    '.link-panel { background }',
    '.qr-image { background }',
    '.dialog::backdrop { background }',
    '.sheet-amount.zero { color }',
    '.key { background }',
    '.key { border }',
    '.key { box-shadow }',
    '.key:active { box-shadow }',
    '.btn-confirm { box-shadow }',
    '.btn-confirm:active:not(:disabled) { box-shadow }',
    '.toast { color }',
    '.toast { box-shadow }',
    '.toast-error { border-color }',
    '.toast-error { box-shadow }',
  ]);
});

for (const { file, allowed } of STYLESHEETS) {
  test(`${file}: every colour comes from a variable, but for the literals kept on purpose`, () => {
    const keep = ({ rule, property, value }) => allowed.some(entry =>
      entry.selector === rule.selector && entry.property === property && normalise(entry.value) === normalise(value));
    const found = writtenOut(parseCss(read(file))).filter(item => !keep(item))
      .map(({ rule, property, value }) => `${where(rule)} { ${property}: ${value} }`);
    assert.deepEqual(found, []);
  });
}

/* ------------------------------------------------------------------ the demo's stylesheet */

/* Every variable of the demo's light set: spec §8's table, plus the app's slot-shadow,
 * empty-slot, medallion and row-line variables (spec §2's table puts the demo's mascot, person
 * buttons, cards and empty slots on the app's porcelain; assumptions 21 and 22). A shop with
 * colours of its own gives each of them a value of its own. */
const DEMO_VARIABLES = [
  '--bg', '--page-art', '--phone-art', '--tile', '--paper', '--chosen',
  '--ink', '--ink-soft', '--accent', '--plus', '--minus',
  '--digit', '--wordmark', '--chevron',
  '--select',
  '--get-bg', '--get-ink', '--get-ledge', '--switch-on-bg', '--switch-on-ink',
  '--grant-bg', '--grant-ledge', '--grant-ink', '--confirm-bg', '--confirm-border', '--confirm-ink',
  '--frame', '--highlight',
  '--app-icon-bg', '--app-icon-border', '--app-icon-shadow', '--bezel', '--bezel-shadow', '--dot-on', '--bar-dot',
  '--slot-bg', '--slot-border', '--slot-shadow', '--slot-empty-bg', '--slot-empty-border', '--slot-empty-shadow',
  '--limited-bg', '--rule-bg', '--rule-ink',
  '--face-bg', '--face-ring', '--face-pad', '--face-box', '--face-radius',
  '--bubble-bg', '--bubble-ink', '--sheet-scrim', '--toast-bg', '--toast-ink', '--toast-error-bg', '--toast-error-ink',
  '--line', '--row-line', '--rule-style',
  '--tour-fade', // how far the counter fades while the tour plays: an opacity, not a colour
];

/* The demo's layout constants, the same in every shop. */
const DEMO_CONSTANTS = [['--radius-tile', '20px'], ['--radius-btn', '16px'], ['--phone-screen', '700px'], ['--phone-bezel', '12px']];

/* The shutter and its sign: 0.3's wood, seam, cream and dark brown in every shop (spec §8,
 * assumption 9a), so in a :root group of their own and never in a [data-theme] set. */
const DEMO_SHUTTER = [
  ['--shutter-slat', '#7a4a26'], ['--shutter-seam', '#5c3a1d'],
  ['--sign-bg', '#fffdf6'], ['--sign-border', '#5c3a1d'], ['--sign-ink', '#4a2f1b'],
];

test('assets/style.css opens with its light set, its layout constants and the shutter\'s own group', () => {
  const rules = parseCss(read('assets/style.css'));
  assert.deepEqual(rules.slice(0, 3).map(rule => rule.selector), [':root, [data-theme]', ':root', ':root']);
  const [light, constants, shutter] = rules;
  const plain = light.declarations.filter(({ property }) => !property.startsWith('--'));
  assert.deepEqual(plain.map(({ property, value }) => `${property}: ${value}`), ['color-scheme: light']);
  const names = light.declarations.filter(({ property }) => property.startsWith('--')).map(({ property }) => property);
  assert.equal(new Set(names).size, names.length, 'no variable given twice');
  assert.deepEqual([...names].sort(), [...DEMO_VARIABLES].sort());
  assert.deepEqual(constants.declarations.map(({ property, value }) => [property, value]), DEMO_CONSTANTS);
  assert.deepEqual(shutter.declarations.map(({ property, value }) => [property, value]), DEMO_SHUTTER);
  // And nowhere else: one light set, and no third :root group.
  assert.equal(topLevel(rules, ':root, [data-theme]').length, 1, 'one light set');
  assert.equal(topLevel(rules, ':root').length, 2, 'two :root groups');
});

test('assets/style.css: --wood, --wood-deep, --gold and --gold-deep are split by use and gone', () => {
  const found = [];
  for (const rule of parseCss(read('assets/style.css'))) {
    for (const { property, value } of rule.declarations) {
      const reads = SPLIT.filter(name => new RegExp(`var\\(\\s*${name}\\s*[,)]`).test(value));
      if (SPLIT.includes(property) || reads.length) found.push(`${where(rule)} { ${property}: ${value} }`);
    }
  }
  assert.deepEqual(found, []);
});

test('the colour scan finds what 0.3.0\'s demo wrote out: every place the design lists', () => {
  const places = writtenOut(parseCss(read('tests/fixtures/0.3.0/style.css'))).map(({ rule, property }) => `${where(rule)} { ${property} }`);
  assert.deepEqual(places, [
    'body { background-image }',
    '.app-icon { box-shadow }',
    '.get { color }',
    '.person.pressed { background }',
    '.person[aria-pressed=\'true\'] { background }',
    '.phone-frame { box-shadow }',
    '.pastry-name { color }',
    '.sheet-scrim { background }',
    '.toast { color }',
    '.case .slot.limited { background }',
    '.legend i.limited { background }',
  ]);
});

test('assets/style.css: what scripts read and every text colour are one plain colour, in every set', () => {
  const rules = parseCss(read('assets/style.css'));
  // Every variable some rule writes text in (`color: var(--x)`).
  const textColours = new Set();
  for (const rule of rules) {
    for (const { property, value } of rule.declarations) {
      const match = property === 'color' && /^var\((--[\w-]+)\)$/.exec(value);
      if (match) textColours.add(match[1]);
    }
  }
  // All of these are text colours, so finding them proves the search finds what it looks for.
  const known = ['--ink', '--ink-soft', '--accent', '--plus', '--minus', '--get-ink', '--switch-on-ink', '--grant-ink',
    '--confirm-ink', '--rule-ink', '--bubble-ink', '--toast-ink', '--toast-error-ink'];
  assert.deepEqual(known.filter(name => !textColours.has(name)), []);
  // --bg goes into the tab icon's SVG; the other four are read to draw on canvases (spec §8).
  const plain = new Set(['--bg', '--digit', '--wordmark', '--chevron', '--sign-ink', ...textColours]);
  // The light set, the two :root groups and any [data-theme="<id>"] set, at the top level.
  const sets = rules.filter(rule => rule.context.length === 0 && (rule.selector === ':root, [data-theme]'
    || rule.selector === ':root' || /^\[data-theme=(["'])[^"']*\1\]$/.test(rule.selector)));
  const seen = new Set();
  const mixed = [];
  for (const rule of sets) {
    for (const { property, value } of rule.declarations) {
      if (!plain.has(property)) continue;
      seen.add(property);
      if (!/^#[0-9a-f]{6}$/i.test(value)) mixed.push(`${rule.selector} { ${property}: ${value} }`);
    }
  }
  assert.deepEqual(mixed, []);
  assert.deepEqual([...plain].filter(name => !seen.has(name)), [], 'every one of them is given a value');
});

/* ------------------------------------------------------------------ themes with colours of their own */

/* A theme's own colour set: a top-level rule [data-theme="<id>"] { … }. */
const THEME_SET = /^\[data-theme="([a-z][a-z0-9]{1,31})"\]$/;

/* The sprite table: each theme's page colour (THEMES.<id>.background) and its mascot. */
const Pixel = new Function(`${read('assets/sprites.js')}\nreturn Pixel;`)();

/* Text and the grounds it sits on in the app, by variable name and the same for every theme:
 * spec §4.6 (b)'s "Used for" column in full, as spec §13 asks (its list, and the prices on a
 * tile). Every text colour reaches 4.5:1 against every stop of each of its grounds. */
const APP_TEXT = [
  ['--ink', ['--bg', '--page-art', '--tile', '--lamp-bg', '--paper', '--chosen', '--field-bg', '--key-bg', '--warn-bg', '--toast-bg']],
  ['--holder-ink', ['--lamp-bg']],
  ['--card-soft', ['--lamp-bg']],
  ['--tile-label', ['--lamp-bg']],
  ['--digit', ['--lamp-bg']],
  ['--ink-soft', ['--bg', '--page-art', '--tile', '--paper', '--chosen']],
  ['--accent', ['--bg', '--page-art', '--tile', '--paper', '--chosen', '--warn-bg']],
  ['--price', ['--tile']],
  ['--plus', ['--tile', '--lamp-bg']],
  ['--minus', ['--tile', '--paper', '--chosen']],
  ['--bar-ink', ['--bar-bg']],
  ['--primary-ink', ['--primary-bg']],
  ['--confirm-ink', ['--confirm-bg']],
  ['--pill-ink', ['--pill-bg']],
  ['--skip-ink', ['--skip-bg']],
  ['--bubble-ink', ['--bubble-bg']],
  ['--warn-ink', ['--warn-bg']],
  ['--ok-ink', ['--ok-bg']],
  ['--bad-ink', ['--bad-bg']],
  ['--toast-ink', ['--toast-bg']],
  ['--toast-error-ink', ['--toast-error-bg']],
  ['--slot-ink', ['--slot-bg']],
  ['--amount-zero', ['--tile']],
  ['--wordmark', ['--tile']],
];

/* What must be seen without being text, against what it sits on or next to: 3:1. */
const APP_NON_TEXT = [
  ['--focus', ['--bg', '--page-art', '--tile', '--lamp-bg', '--paper', '--chosen', '--field-bg', '--warn-bg', '--bar-bg']],
  ['--field-border', ['--tile', '--field-bg', '--paper', '--chosen']],
  ['--frame', ['--tile', '--chosen', '--bg']],
  ['--slot-border', ['--tile', '--lamp-bg']],
];

/* A stylesheet's light set and each theme's own set, with every value worked out: the theme's
 * variables stand in for the light ones, and var() is put in. */
function colourSets(file) {
  const rules = parseCss(read(file));
  const [light] = topLevel(rules, ':root, [data-theme]');
  const themes = rules.filter(rule => rule.context.length === 0 && THEME_SET.test(rule.selector)).map(rule => {
    const variables = new Map([...variablesOf([light]), ...variablesOf([rule])]);
    const values = new Map([...variables].map(([name, value]) => [name, substitute(value, variables)]));
    return { id: THEME_SET.exec(rule.selector)[1], rule, values };
  });
  return { light, themes };
}

const asRgb = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;

/* The pairs of one theme's set that fall below `least`, each as "--ink on --tile: 3.20 < 4.5 at
 * rgb(34, 25, 18)". A text or line colour must be one opaque colour, a ground opaque colours. */
function belowRatio(values, pairs, least) {
  const short = [];
  for (const [ink, grounds] of pairs) {
    const [colour, ...more] = stops(values.get(ink));
    if (!colour || more.length || colour.a !== 1) {
      short.push(`${ink} is not one opaque colour: ${values.get(ink)}`);
      continue;
    }
    for (const ground of grounds) {
      const under = stops(values.get(ground));
      if (!under.length || under.some(stop => stop.a !== 1)) {
        short.push(`${ground} is not opaque colours only: ${values.get(ground)}`);
        continue;
      }
      for (const stop of under) {
        const ratio = contrast(colour, stop);
        if (ratio < least) short.push(`${ink} on ${ground}: ${ratio.toFixed(2)} < ${least} at ${asRgb(stop)}`);
      }
    }
  }
  return short;
}

/* The tests every stylesheet with colour sets gets: `text` and `nonText` are its pairs. */
function colourSetTests({ file, text, nonText }) {
  test(`${file}: each theme's colour set gives every variable of the light set again, and its color-scheme`, () => {
    const { light, themes } = colourSets(file);
    const names = [...variablesOf([light]).keys()].sort();
    for (const [ink, grounds] of [...text, ...nonText]) {
      for (const name of [ink, ...grounds]) assert.ok(names.includes(name), `${name} is a variable of the light set`);
    }
    assert.ok(themes.length > 0, 'a theme has colours of its own');
    for (const { id, rule } of themes) {
      assert.ok(Object.hasOwn(Pixel.THEMES, id), `${id} is a theme of assets/sprites.js`);
      const own = rule.declarations.filter(({ property }) => property.startsWith('--')).map(({ property }) => property);
      assert.equal(new Set(own).size, own.length, `${id}: no variable given twice`);
      assert.deepEqual([...own].sort(), names, `${id}: every variable of the light set`);
      const plain = rule.declarations.filter(({ property }) => !property.startsWith('--')).map(({ property }) => property);
      assert.deepEqual(plain, ['color-scheme'], `${id}: its color-scheme, and nothing else that is not a variable`);
    }
  });

  test(`${file}: in each theme's colour set every text reaches 4.5:1 against every stop of its grounds`, () => {
    const { themes } = colourSets(file);
    assert.ok(themes.length > 0, 'a theme has colours of its own');
    assert.deepEqual(themes.flatMap(({ id, values }) => belowRatio(values, text, 4.5).map(line => `${id}: ${line}`)), []);
  });

  test(`${file}: in each theme's colour set the focus ring, input borders, frames and slot rings reach 3:1`, () => {
    const { themes } = colourSets(file);
    assert.ok(themes.length > 0, 'a theme has colours of its own');
    assert.deepEqual(themes.flatMap(({ id, values }) => belowRatio(values, nonText, 3).map(line => `${id}: ${line}`)), []);
  });

  test(`${file}: a theme with a page colour of its own has a colour set, whose --bg is that colour`, () => {
    const { themes } = colourSets(file);
    const withBackground = Object.keys(Pixel.THEMES).filter(id => Pixel.THEMES[id].background !== undefined);
    assert.deepEqual(themes.map(({ id }) => id).sort(), withBackground.sort());
    for (const { id, values } of themes) {
      // As colours, not as text: THEMES writes #160F0A, the stylesheet #160f0a.
      assert.deepEqual(parseColour(values.get('--bg')), parseColour(Pixel.THEMES[id].background), id);
    }
  });
}

test('the colour arithmetic gives the figures WCAG contrast checkers give', () => {
  assert.equal(contrast(parseColour('#000'), parseColour('#ffffff')), 21);
  assert.equal(contrast(parseColour('#767676'), parseColour('#fff')).toFixed(2), '4.54');
  assert.equal(contrast(parseColour('#fff'), parseColour('#777777')).toFixed(2), '4.48');
  assert.deepEqual(parseColour('rgba(255, 214, 160, .10)'), { r: 255, g: 214, b: 160, a: 0.1 });
  assert.deepEqual(parseColour('rgb(22 15 10 / 50%)'), { r: 22, g: 15, b: 10, a: 0.5 });
  assert.deepEqual(parseColour('transparent'), { r: 0, g: 0, b: 0, a: 0 });
  assert.deepEqual(stops('radial-gradient(120% 600px at 50% 0%, #251910 0%, #160f0a 55%, #0f0a07 100%)').map(asRgb),
    ['rgb(37, 25, 16)', 'rgb(22, 15, 10)', 'rgb(15, 10, 7)']);
  assert.deepEqual(stops('linear-gradient(rgb(34, 25, 18) 0%, rgb(27, 20, 15) 100%)').map(asRgb), ['rgb(34, 25, 18)', 'rgb(27, 20, 15)']);
  assert.deepEqual(stops('none'), []);
  assert.deepEqual(blend(parseColour('#000'), parseColour('#fff'), 0.5), { r: 127.5, g: 127.5, b: 127.5, a: 1 });
  assert.throws(() => contrast(parseColour('rgba(0, 0, 0, 0.5)'), parseColour('#fff')), /see-through/);
  assert.throws(() => parseColour('white'), /Not a colour/);
  // A stop in a form the helper cannot read is never left out unmeasured: it throws.
  for (const value of [
    'linear-gradient(#221912, hsl(30 20% 60%))',
    'linear-gradient(#221912, hsla(30, 20%, 60%, 0.5))',
    'linear-gradient(#221912 0%, oklch(70% 0.1 60) 100%)',
    'linear-gradient(#221912, color-mix(in srgb, #fff 40%, #221912))',
    'linear-gradient(to right, #221912, white)',
    'currentColor',
  ]) assert.throws(() => stops(value), /Not a colour/, value);
  assert.deepEqual(stops('url("assets/tan-red.png"), linear-gradient(to right, #000, transparent)').map(asRgb),
    ['rgb(0, 0, 0)', 'rgb(0, 0, 0)']);
  assert.deepEqual(stops('0 6px 0 rgba(122, 74, 38, 0.18) inset').map(asRgb), ['rgb(122, 74, 38)']);
});

colourSetTests({ file: 'app/app.css', text: APP_TEXT, nonText: APP_NON_TEXT });

test('no stylesheet follows the system’s light or dark setting: the colours are the team’s theme', () => {
  for (const file of ['app/app.css', 'assets/style.css']) {
    const following = parseCss(read(file)).filter(rule => rule.context.some(at => at.includes('prefers-color-scheme')));
    assert.deepEqual(following.map(where), [], file);
  }
});

test('app/app.css: the café is always dark, and its own rules are only the dialog scrim, the locked card and the forced-colours override', () => {
  const rules = parseCss(read('app/app.css'));
  const [cafe] = topLevel(rules, '[data-theme="cafe"]');
  assert.ok(cafe, 'the café has a colour set');
  assert.equal(cafe.declarations.find(({ property }) => property === 'color-scheme')?.value, 'dark');
  // A rule that starts from a data-theme matches everything inside such a page, the theme cards
  // of other themes included: only these, where a variable cannot do it.
  const own = rules
    .filter(rule => !(rule.context.length === 0 && (rule.selector === ':root, [data-theme]' || THEME_SET.test(rule.selector))))
    .filter(rule => splitSelectors(rule.selector).some(selector => selector.startsWith('[data-theme')))
    .map(rule => `${where(rule)} { ${rule.declarations.map(({ property, value }) => `${property}: ${value}`).join('; ')} }`);
  assert.deepEqual(own, [
    '[data-theme="cafe"] .dialog::backdrop { background: rgba(0, 0, 0, 0.6) }',
    '[data-theme="cafe"] .theme-card:has(input:disabled) { opacity: 1 }',
    '[data-theme="cafe"] .theme-card:has(input:disabled) > * { opacity: 0.65 }',
    '@media (forced-colors: active) / [data-theme="cafe"] { --digit: CanvasText; --wordmark: CanvasText }',
  ]);
});

/* The cells of a drawing that a round medallion would cut off. A canvas with a border-radius
 * shows its drawing only inside the curve of its content box (the radius less the padding), so
 * at 50% only inside the circle inscribed in the drawing itself, whatever the padding. Each cell
 * is where drawSprite puts it, centred by Pixel.offset; "column,row" as in the drawing. */
function cutByCircle(sprite) {
  const { dx, dy } = Pixel.offset(sprite);
  const rows = sprite.rows.length;
  const cols = sprite.rows[0].length;
  const radius = Math.min(rows, cols) / 2;
  const cut = [];
  sprite.rows.forEach((row, y) => [...row].forEach((symbol, x) => {
    if (!sprite.palette[symbol]) return;
    const across = Math.max(Math.abs(x + dx - cols / 2), Math.abs(x + dx + 1 - cols / 2));
    const down = Math.max(Math.abs(y + dy - rows / 2), Math.abs(y + dy + 1 - rows / 2));
    if (Math.hypot(across, down) > radius) cut.push(`${x},${y}`);
  }));
  return cut;
}

test('app/app.css: the café’s medallions are round only when its mascot fits inside the circle, and rounded squares like the slots otherwise', t => {
  const mascot = Pixel.THEMES.cafe.mascot;
  const cut = cutByCircle(Pixel.SPRITES[mascot]);
  t.diagnostic(cut.length
    ? `${mascot}: a circle would cut ${cut.length} cells (column,row): ${cut.join(' ')}`
    : `${mascot} fits inside the circle`);
  const shape = cut.length ? '10px' : '50%';
  const cafe = variablesOf(topLevel(parseCss(read('app/app.css')), '[data-theme="cafe"]'));
  // Every medallion and the header button's corners (and so its focus ring) go together.
  assert.equal(cafe.get('--face-radius'), shape);
  assert.equal(cafe.get('--mascot-radius'), shape);
});

/* ------------------------------------------------------------------ the demo's café */

/* Text and the grounds it sits on in the demo, by variable name (spec §8's table and the rules
 * of assets/style.css): the page and the phone's screen, a tile, the counter (--paper), a pressed
 * person (--chosen), and each button, rule strip, bubble and toast on its own ground. */
const DEMO_TEXT = [
  ['--ink', ['--bg', '--page-art', '--phone-art', '--tile', '--paper', '--chosen']],
  ['--ink-soft', ['--bg', '--page-art', '--phone-art', '--tile', '--paper', '--chosen']],
  ['--accent', ['--bg', '--page-art', '--phone-art', '--tile', '--paper', '--chosen']],
  ['--plus', ['--tile', '--paper']],
  ['--minus', ['--tile']],
  ['--digit', ['--tile']],
  ['--wordmark', ['--bg', '--page-art']],
  ['--get-ink', ['--get-bg']],
  ['--switch-on-ink', ['--switch-on-bg']],
  ['--grant-ink', ['--grant-bg']],
  ['--confirm-ink', ['--confirm-bg']],
  ['--rule-ink', ['--rule-bg']],
  ['--bubble-ink', ['--bubble-bg']],
  ['--toast-ink', ['--toast-bg']],
  ['--toast-error-ink', ['--toast-error-bg']],
];

/* What must be seen without being text, 3:1: the focus ring (drawn outside its control, on the
 * ground around it), a pressed person's frame, the slot rings on the phone and in the cabinet,
 * and the chevron under the phone. */
const DEMO_NON_TEXT = [
  ['--select', ['--bg', '--page-art', '--phone-art', '--tile', '--paper']],
  ['--frame', ['--paper', '--chosen']],
  ['--slot-border', ['--tile', '--paper']],
  ['--chevron', ['--bg', '--page-art']],
];

colourSetTests({ file: 'assets/style.css', text: DEMO_TEXT, nonText: DEMO_NON_TEXT });

test('assets/style.css: the demo’s café is always dark, and its only rule of its own is the forced-colours override', () => {
  const rules = parseCss(read('assets/style.css'));
  const [cafe] = topLevel(rules, '[data-theme="cafe"]');
  assert.ok(cafe, 'the café has a colour set');
  assert.equal(cafe.declarations.find(({ property }) => property === 'color-scheme')?.value, 'dark');
  // As in the app: a rule that starts from a data-theme matches everything inside such a page.
  // The demo needs one only where a variable cannot reach: inside a canvas, under forced colours.
  const own = rules
    .filter(rule => !(rule.context.length === 0 && (rule.selector === ':root, [data-theme]' || THEME_SET.test(rule.selector))))
    .filter(rule => splitSelectors(rule.selector).some(selector => selector.startsWith('[data-theme')))
    .map(rule => `${where(rule)} { ${rule.declarations.map(({ property, value }) => `${property}: ${value}`).join('; ')} }`);
  assert.deepEqual(own, ['@media (forced-colors: active) / [data-theme="cafe"] { --digit: CanvasText; --wordmark: CanvasText }']);
});

test('assets/style.css: the demo’s café has the app’s café values wherever the two share a variable', t => {
  const cafeOf = file => colourSets(file).themes.find(({ id }) => id === 'cafe');
  const demo = cafeOf('assets/style.css');
  const app = cafeOf('app/app.css');
  assert.ok(demo && app, 'both stylesheets have a café set');
  const inApp = variablesOf([app.rule]);
  const shared = [...variablesOf([demo.rule]).keys()].filter(name => inApp.has(name));
  t.diagnostic(`${shared.length} variables in both`);
  for (const name of ['--bg', '--ink', '--slot-bg', '--face-radius']) assert.ok(shared.includes(name), `${name} is in both`);
  // Worked out, var() put in: the app's --confirm-bg: var(--primary-bg) is the honey it names.
  const differ = shared.filter(name => normalise(demo.values.get(name)) !== normalise(app.values.get(name)))
    .map(name => `${name}: ${demo.values.get(name)} in the demo, ${app.values.get(name)} in the app`);
  assert.deepEqual(differ, []);
});

/* The counter's text and what it sits on (assets/style.css: the counter is --paper, a person
 * button --tile and a pressed one --chosen, the $ buttons --grant-bg). While the tour drives the
 * demo, the whole counter fades to --tour-fade. */
const DEMO_COUNTER_TEXT = [
  ['--ink', ['--paper', '--tile', '--chosen']],
  ['--ink-soft', ['--paper', '--tile', '--chosen']],
  ['--accent', ['--paper', '--chosen']],
  ['--plus', ['--paper']],
  ['--grant-ink', ['--grant-bg']],
];

test('assets/style.css: in each theme’s colour set the counter’s text still reaches 4.5:1 while the tour fades it', t => {
  const { themes } = colourSets('assets/style.css');
  assert.ok(themes.length > 0, 'a theme has colours of its own');
  const short = [];
  for (const { id, values } of themes) {
    const fade = Number(values.get('--tour-fade'));
    assert.ok(fade > 0 && fade <= 1, `${id}: --tour-fade is an opacity: ${values.get('--tour-fade')}`);
    let lowest = Infinity;
    for (const [ink, grounds] of DEMO_COUNTER_TEXT) {
      const [colour] = stops(values.get(ink));
      for (const ground of grounds) {
        for (const stop of stops(values.get(ground))) {
          // As spec §13 measures it: the text's colour, faded, laid on the ground it sits on.
          const ratio = contrast(blend(colour, stop, colour.a * fade), stop);
          lowest = Math.min(lowest, ratio);
          if (ratio < 4.5) short.push(`${id}: ${ink} on ${ground} faded to ${fade}: ${ratio.toFixed(2)} < 4.5 at ${asRgb(stop)}`);
        }
      }
    }
    t.diagnostic(`${id}: the lowest, faded to ${fade}, is ${lowest.toFixed(2)}`);
  }
  assert.deepEqual(short, []);
});
