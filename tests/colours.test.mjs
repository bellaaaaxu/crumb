/* Colours in the stylesheets. Every colour comes from a variable, so a theme with colours of
 * its own only has to give its own set of them; the light set is Pastry shop's and Bakery's. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalise, parseCss, topLevel, variablesOf } from './css.mjs';

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
