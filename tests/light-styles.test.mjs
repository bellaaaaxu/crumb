/* Pastry shop and Bakery do not change by one pixel. With the light set's values put in for
 * var(), every rule of 0.3.0's stylesheet (kept in tests/fixtures/0.3.0/) computes the same
 * declarations in today's, and whatever is new and also applies in light is listed below with
 * the reason it changes nothing. Rules that apply only under a theme with colours of its own
 * ([data-theme="<id>"] …) are not counted. tests/e2e/light-unchanged.spec.mjs checks the same
 * in a browser, element by element. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalise, parseCss, splitSelectors, substitute, variablesOf } from './css.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/* The themes with colours of their own: those with a page colour (THEMES.<id>.background) in
 * the sprite table. Pastry shop and Bakery have none, so their rules are counted. */
const Pixel = new Function(`${read('assets/sprites.js')}\nreturn Pixel;`)();
const OWN_COLOURS = Object.keys(Pixel.THEMES).filter(id => Pixel.THEMES[id].background !== undefined);

/* A rule that applies only inside a theme with colours of its own. */
const themedOnly = selector => {
  const theme = /^\[data-theme=(["'])([^"']*)\1\]/.exec(selector);
  return theme !== null && OWN_COLOURS.includes(theme[2]);
};

/* The light set: the custom properties of the top-level :root rules (0.3.0 has one) and of
 * :root, [data-theme] (today's light set), in source order. */
const lightVariables = rules => variablesOf(rules.filter(rule =>
  rule.context.length === 0 && (rule.selector === ':root' || rule.selector === ':root, [data-theme]')));

/* What a stylesheet does in light: for each selector (inside its at-rules), each property's
 * value with var() put in from the light set. A later declaration wins, unless an earlier one
 * is !important. Keys keep the order each selector first appears in. */
function inLight(rules) {
  const variables = lightVariables(rules);
  const bySelector = new Map();
  for (const rule of rules) {
    for (const selector of splitSelectors(rule.selector)) {
      if (themedOnly(selector)) continue;
      const key = [...rule.context, selector].join(' / ');
      if (!bySelector.has(key)) bySelector.set(key, new Map());
      const declarations = bySelector.get(key);
      for (const { property, value, important } of rule.declarations) {
        if (property.startsWith('--')) continue;
        if (declarations.get(property)?.endsWith(' !important') && !important) continue;
        declarations.set(property, normalise(substitute(value, variables)) + (important ? ' !important' : ''));
      }
    }
  }
  return bySelector;
}

const said = (key, property, value) => `${key} { ${property}: ${value} }`;

/* ------------------------------------------------------------------ what is new in light */

/* Declarations today's app/app.css adds that also apply in light, written as the light set
 * resolves them, each with the reason it changes nothing there. */
const APP_ADDITIONS = [
  {
    selectors: ['[data-theme]'],
    declarations: { 'color-scheme': 'light' },
    why: 'the light set also sits on any element with data-theme; in a light page such an element inherits light anyway',
  },
  {
    selectors: ['.mascot canvas', '.auth-mascot', '.oven-caption canvas', '.row-icon canvas'],
    declarations: { background: 'none', 'box-shadow': 'none', padding: '0', 'box-sizing': 'border-box', 'border-radius': '0' },
    why: 'the ground under a single drawing; in light it is what the canvas has today: no background, shadow or rounding, and * gives it border-box and no padding',
  },
  {
    selectors: ['.theme-card-pics canvas'],
    declarations: { background: 'none', 'box-shadow': 'none', padding: '0', 'box-sizing': 'border-box', 'border-radius': '0' },
    why: 'the ground under a theme card\'s pictures; in light what the canvas has today, as above',
  },
  {
    selectors: ['.theme-card'],
    declarations: { color: '#4a2f1b' },
    why: 'a card states its own text colour; in light that is the --ink it inherits from the page today',
  },
  {
    selectors: ['.slots > .slot:not(.filled)'],
    declarations: {
      background: '#efdcb6',
      'border-color': '#a9793f',
      'box-shadow': 'inset 0 3px 0 rgba(122, 74, 38, 0.22), inset 0 -2px 0 rgba(255, 250, 235, 0.7)',
    },
    why: 'an empty place on the shelf; in light the same ground, border colour and shadow .slot gives it',
  },
  {
    selectors: ['.slot'],
    declarations: { color: '#4a2f1b' },
    why: 'the text in a slot (the icon picker\'s dash); in light the --ink it inherits today',
  },
  {
    selectors: ['.main-tile'],
    declarations: { background: '#fffdf6', 'box-shadow': '0 6px 0 rgba(122, 74, 38, 0.18), 0 10px 26px rgba(74, 47, 27, 0.1)' },
    why: 'the balance tile is also a .tile, which gives it this same ground and shadow',
  },
  {
    selectors: ['.holder'],
    declarations: { color: '#4a2f1b' },
    why: 'the name on the balance tile; in light the --ink it inherits today',
  },
  {
    selectors: ['.brand-logo'],
    declarations: { padding: '0' },
    why: '* already gives every element no padding',
  },
  {
    selectors: ['.auth-logo'],
    declarations: { background: 'none', padding: '0', 'border-radius': '0' },
    why: 'what the sign-in logo has today: no background or rounding, and * gives it no padding',
  },
  {
    selectors: ['.quest-head'],
    declarations: { 'box-shadow': 'none' },
    why: 'the log\'s header bar has no shadow today',
  },
  {
    selectors: ['.toast-error'],
    declarations: { color: '#fff3dc' },
    why: 'an error toast is also a .toast, whose text is this same colour',
  },
];

/* Declarations today's assets/style.css adds that also apply in light, written as the light
 * set resolves them, each with the reason it changes nothing there. */
const DEMO_ADDITIONS = [
  {
    selectors: ['[data-theme]'],
    declarations: { 'color-scheme': 'light' },
    why: 'the light set also sits on any element with data-theme; in a light page such an element inherits light anyway',
  },
  {
    selectors: ['.pastry-egg canvas', '.person canvas', '.card .icons canvas', '.oven-caption canvas'],
    declarations: { background: 'none', 'box-shadow': 'none', padding: '0', 'box-sizing': 'border-box', 'border-radius': '0' },
    why: 'the ground under a single picture; in light it is what the canvas has today: no background, shadow or rounding, and * gives it border-box and no padding',
  },
  {
    selectors: ['.slot'],
    declarations: { 'box-shadow': 'none' },
    why: 'a slot\'s own shadow; none in light, as today',
  },
  {
    selectors: ['.slots > .slot:not(.filled)'],
    declarations: { background: '#efdcb6', 'border-color': '#a9793f', 'box-shadow': 'none' },
    why: 'an empty place on the shelf; in light the same ground and border colour .slot gives it, and no shadow',
  },
  {
    selectors: ['.phone'],
    declarations: { 'background-image': 'none' },
    why: 'the art over the phone screen\'s ground; none in light, which the background shorthand just before it already gives',
  },
  {
    selectors: ['.toast.error'],
    declarations: { color: '#fff8e6' },
    why: 'an error toast is also a .toast, whose text is this same colour',
  },
];

/* The stylesheets checked: today's, 0.3.0's copy, the variables a script sets on an element
 * (the stylesheet only reads them), and what is new in light. */
const SHEETS = [
  {
    now: 'app/app.css',
    then: 'tests/fixtures/0.3.0/app.css',
    scriptVariables: ['--header-height'], // set by toast() in app/dom.js
    additions: APP_ADDITIONS,
  },
  {
    now: 'assets/style.css',
    then: 'tests/fixtures/0.3.0/style.css',
    scriptVariables: [], // assets/app.js reads variables, and sets none
    additions: DEMO_ADDITIONS,
  },
];

test('only rules for a theme with colours of its own are left out', () => {
  assert.deepEqual(OWN_COLOURS, ['cafe']);
  assert.equal(themedOnly('[data-theme="cafe"] .tile'), true);
  assert.equal(themedOnly('[data-theme=\'cafe\'] .tile'), true);
  assert.equal(themedOnly('[data-theme="bakery"] .tile'), false);
  assert.equal(themedOnly('[data-theme="default"] .tile'), false);
  assert.equal(themedOnly('.tile'), false);
});

test('the reader sees the whole of 0.3.0\'s app stylesheet', () => {
  const rules = parseCss(read('tests/fixtures/0.3.0/app.css'));
  const variables = lightVariables(rules);
  assert.equal(variables.size, 18);
  assert.equal(variables.get('--wood'), '#7a4a26');
  const light = inLight(rules);
  // Every selector of every rule, each inside its at-rules: a reader that lost a block would count fewer.
  assert.equal(light.size, 270);
  assert.equal(light.get('@media (max-width: 719px) / .dialog').get('border-top'), '3px solid #7a4a26');
  assert.equal(light.get('@keyframes crack / 55%').get('transform'), 'rotate(7deg)');
  assert.equal(light.get('[hidden]').get('display'), 'none !important');
  assert.equal(light.get('@media (prefers-reduced-motion: reduce) / *::after').get('transition-duration'), '0.01ms !important');
  assert.equal(light.get('body').get('background-image'),
    'repeating-linear-gradient(0deg, rgba(122, 74, 38, 0.025) 0 2px, transparent 2px 24px), '
    + 'repeating-linear-gradient(90deg, rgba(122, 74, 38, 0.025) 0 2px, transparent 2px 24px)');
  assert.equal(light.get('.field input:not([type=\'checkbox\']):not([type=\'radio\']):not([type=\'file\'])').get('background'), '#fffdf6');
  assert.equal(light.get('@media (max-width: 719px) / .toasts').get('top'), 'calc(var(--header-height, 56px) + 8px)');
});

for (const sheet of SHEETS) {
  const before = () => inLight(parseCss(read(sheet.then)));
  const after = () => inLight(parseCss(read(sheet.now)));

  test(`${sheet.now}: every variable a rule reads has a light value`, () => {
    const missing = [];
    for (const [key, declarations] of after()) {
      for (const [property, value] of declarations) {
        for (const [, name] of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
          if (!sheet.scriptVariables.includes(name)) missing.push(`${said(key, property, value)}: ${name}`);
        }
      }
    }
    assert.deepEqual(missing, []);
  });

  test(`${sheet.now}: every rule of 0.3.0 computes the same declarations in light`, () => {
    const now = after();
    const changed = [];
    for (const [key, declarations] of before()) {
      for (const [property, value] of declarations) {
        const next = now.get(key)?.get(property);
        if (next !== value) changed.push(`${said(key, property, value)} is now ${next ?? 'gone'}`);
      }
    }
    assert.deepEqual(changed, []);
  });

  test(`${sheet.now}: what is new and applies in light is listed, with why it changes nothing`, () => {
    for (const entry of sheet.additions) assert.ok(entry.why, `a reason for ${entry.selectors.join(', ')}`);
    const then = before();
    const added = [];
    for (const [key, declarations] of after()) {
      for (const [property, value] of declarations) if (!then.get(key)?.has(property)) added.push(said(key, property, value));
    }
    const listed = sheet.additions.flatMap(({ context = [], selectors, declarations }) => selectors.flatMap(selector =>
      Object.entries(declarations).map(([property, value]) => said([...context, selector].join(' / '), property, value))));
    assert.deepEqual(added.sort(), listed.sort());
  });

  test(`${sheet.now}: the rules of 0.3.0 keep their order`, () => {
    const order = [...after().keys()];
    const moved = [];
    let last = -1;
    for (const key of before().keys()) {
      const at = order.indexOf(key);
      if (at === -1) continue; // gone altogether: the test above names it
      if (at < last) moved.push(key);
      else last = at;
    }
    assert.deepEqual(moved, []);
  });
}

test('the reader sees the whole of 0.3.0\'s demo stylesheet', () => {
  const rules = parseCss(read('tests/fixtures/0.3.0/style.css'));
  assert.equal(rules.length, 235);
  const variables = lightVariables(rules);
  assert.equal(variables.size, 19);
  assert.equal(variables.get('--gold-deep'), '#c98f1f');
  const light = inLight(rules);
  // Every selector of every rule, each inside its at-rules: a reader that lost a block would count fewer.
  assert.equal(light.size, 244);
  assert.equal(light.get('@media (max-width: 900px) / .phone-frame').get('width'), '100%');
  assert.equal(light.get('@keyframes crack / 55%').get('transform'), 'rotate(7deg)');
  assert.equal(light.get('@media (prefers-reduced-motion: reduce) / *::after').get('transition-duration'), '0.01ms !important');
  assert.equal(light.get('body').get('background-image'),
    'repeating-linear-gradient(0deg, rgba(122, 74, 38, 0.025) 0 2px, transparent 2px 24px), '
    + 'repeating-linear-gradient(90deg, rgba(122, 74, 38, 0.025) 0 2px, transparent 2px 24px)');
  assert.equal(light.get('.shutter').get('background'), 'repeating-linear-gradient(#7a4a26 0 10px, #5c3a1d 10px 12px)');
  assert.equal(light.get('.person[aria-pressed=\'true\']').get('background'), '#fff8e6');
  assert.equal(light.get('.phone').get('height'), '700px');
});
