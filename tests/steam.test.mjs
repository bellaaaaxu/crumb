/* A mascot's steam (design section 3): the step table and its 120 ms, and how drawSprite shows
 * the steam at each step while the rest of the drawing stays where it is. They are tested on
 * STEAMY, a drawing made for these tests, and on LOWER, the same drawing one row lower: a
 * wisp's rows count from the top of the steam, wherever in the grid the steam starts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// sprites.js touches no browser API at load time. new Function keeps it in this realm, so the
// arrays and objects it returns compare equal to the ones written here.
const source = readFileSync(new URL('../assets/sprites.js', import.meta.url), 'utf8');
const Pixel = new Function(`${source}\nreturn Pixel;`)();

/* The table of design section 3: the rows of a wisp shown at each step, 0 the top row. */
const DESIGN_STEPS = [[3], [2, 3], [1, 2, 3], [0, 1, 2, 3], [0, 1, 2], [0, 1], [0], []];

/* A cup with two wisps of steam, like the café's mascot, drawn for these tests only. Its left
 * wisp reaches the left edge while the cup starts two columns in, so a step that hid that wisp
 * and centred what was left would move the cup: centring has to stay on the whole drawing. */
const STEAMY = {
  palette: { X: '#3B2414', c: '#6B3F1D', w: '#F4EBDD', s: '#B8A48E' },
  steam: 's',
  rows: [
    's.....s.....',
    '.s.....s....',
    '.s.....s....',
    's.....s.....',
    '..XXXXXXX...',
    '..XcccccXX..',
    '..XwwwwwX.X.',
    '..XwwwwwXX..',
    '...XwwwX....',
    '..XXXXXXX...',
    '............',
    '............',
  ],
};
const CUP = STEAMY.rows.slice(4);
/* Its wisps, cell by cell from the top row down, as "x,y" in the 12x12 grid. */
const LEFT = ['0,0', '1,1', '1,2', '0,3'];
const RIGHT = ['6,0', '7,1', '7,2', '6,3'];
/* STEAMY one row lower: a blank row on top and its last blank row gone, so its steam fills
 * rows 1-4 and every cell is STEAMY's, one row down. */
const LOWER = { ...STEAMY, rows: ['............', ...STEAMY.rows.slice(0, 11)] };

/* setupCanvas reads window.devicePixelRatio (assets/sprites.js). Node has no window, so a test
 * that draws lends it one and takes it back when the test ends. */
function lendWindow(t) {
  assert.equal(typeof globalThis.window, 'undefined', 'Node has no window of its own');
  globalThis.window = { devicePixelRatio: 1 };
  t.after(() => { delete globalThis.window; });
}

/* What drawSprite paints at 1 px a cell, as "x,y colour" entries, sorted. A step left out is
 * not passed at all. */
function paint(sprite, ...step) {
  const painted = [];
  const ctx = {
    fillStyle: '',
    setTransform() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
    fillRect(x, y) { painted.push(`${x},${y} ${this.fillStyle}`); },
  };
  Pixel.drawSprite({ style: {}, getContext: () => ctx }, sprite, 1, 0, ...step);
  return painted.sort();
}

/* Every painted cell of a drawing, placed as drawSprite places the whole drawing (moved by its
 * offset), in its palette colour, leaving out the cells `keep` refuses. Sorted like paint(). */
function cellsOf(sprite, keep = () => true) {
  const { dx, dy } = Pixel.offset(sprite);
  const cells = [];
  sprite.rows.forEach((row, y) => [...row].forEach((symbol, x) => {
    if (symbol !== '.' && keep(`${x},${y}`)) cells.push(`${x + dx},${y + dy} ${sprite.palette[symbol]}`);
  }));
  return cells.sort();
}

/* Whether the design shows a cell at a step, in STEAMY moved `top` rows down (0 for STEAMY
 * itself, 1 for LOWER). A wisp's rows count from the top of the steam, row `top` of the grid;
 * the left wisp is at the step itself, the right one half a cycle (4 steps) on. */
const phase = step => ((step % 8) + 8) % 8;
function shownAt(step, at, top = 0) {
  const [x, y] = at.split(',').map(Number);
  const home = `${x},${y - top}`;
  if (LEFT.includes(home)) return DESIGN_STEPS[phase(step)].includes(y - top);
  if (RIGHT.includes(home)) return DESIGN_STEPS[phase(step + 4)].includes(y - top);
  return true;
}

test('the steam steps are exactly the table of the design, 120 ms each', () => {
  assert.deepEqual(Pixel.STEAM_STEPS, DESIGN_STEPS);
  assert.equal(Pixel.STEAM_STEP_MS, 120);
});

test('steam cells touching by an edge or a corner are one wisp; wisps are read left to right', () => {
  assert.deepEqual(Pixel.steamWisps(STEAMY), [
    [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 3 }],
    [{ x: 6, y: 0 }, { x: 7, y: 1 }, { x: 7, y: 2 }, { x: 6, y: 3 }],
  ]);
  // By leftmost column, not by which wisp a row-by-row reading meets first.
  const lowLeft = {
    palette: { s: '#B8A48E' },
    steam: 's',
    rows: ['.....s......', '.s....s.....', 's.....s.....', '.s...s......', ...Array(8).fill('............')],
  };
  assert.deepEqual(Pixel.steamWisps(lowLeft), [
    [{ x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 3 }],
    [{ x: 5, y: 0 }, { x: 6, y: 1 }, { x: 6, y: 2 }, { x: 5, y: 3 }],
  ]);
  // A wisp may have two cells in a row: its cells still come top to bottom, then left to right.
  const twoInARow = {
    palette: { s: '#B8A48E' },
    steam: 's',
    rows: ['.s....s.....', 'ss.....s....', '.s.....s....', 's.....s.....', ...Array(8).fill('............')],
  };
  assert.deepEqual(Pixel.steamWisps(twoInARow), [
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 0, y: 3 }],
    [{ x: 6, y: 0 }, { x: 7, y: 1 }, { x: 7, y: 2 }, { x: 6, y: 3 }],
  ]);
  // The wife cake has an "s" in its palette, but no steam.
  assert.equal(Pixel.SPRITES.laopo.steam, undefined);
  assert.ok(Object.hasOwn(Pixel.SPRITES.laopo.palette, 's'));
  assert.deepEqual(Pixel.steamWisps(Pixel.SPRITES.laopo), []);
});

test('without a whole-number step, drawSprite draws the whole drawing, steam and all', t => {
  lendWindow(t);
  const whole = cellsOf(STEAMY);
  assert.equal(whole.filter(cell => cell.endsWith(` ${STEAMY.palette.s}`)).length, 8, 'all eight steam cells');
  assert.deepEqual(paint(STEAMY), whole);
  for (const step of [undefined, null, 1.5, Number.NaN, Infinity, '3']) {
    assert.deepEqual(paint(STEAMY, step), whole, String(step));
  }
});

test('the left wisp leads: at step 0 it shows only its bottom row, while the right one shows three', t => {
  lendWindow(t);
  assert.deepEqual(paint(STEAMY, 0), cellsOf(STEAMY, at => !['0,0', '1,1', '1,2', '6,3'].includes(at)));
  assert.deepEqual(paint(STEAMY, 4), cellsOf(STEAMY, at => !['0,3', '6,0', '7,1', '7,2'].includes(at)));
});

test('at every step the steam shows by the table, the wisps 4 steps apart, and nothing else moves', t => {
  lendWindow(t);
  assert.deepEqual(Pixel.offset(STEAMY), { dx: 1, dy: 1 }, 'the whole drawing is centred one cell right and down');
  // Two cycles and a bit either side: any whole number is a step of the cycle.
  for (let step = -9; step <= 17; step += 1) {
    assert.deepEqual(paint(STEAMY, step), cellsOf(STEAMY, at => shownAt(step, at)), `step ${step}`);
  }
});

test('the steam rows count from the top of the steam, wherever in the grid it starts', t => {
  lendWindow(t);
  assert.equal(LOWER.rows.findIndex(row => row.includes('s')), 1, 'the steam of LOWER starts at row 1');
  for (let step = 0; step < 8; step += 1) {
    assert.deepEqual(paint(LOWER, step), cellsOf(LOWER, at => shownAt(step, at, 1)), `step ${step}`);
  }
});

test('a drawing without steam is whole at every step', t => {
  lendWindow(t);
  const laopo = Pixel.SPRITES.laopo;
  for (let step = 0; step < 8; step += 1) assert.deepEqual(paint(laopo, step), cellsOf(laopo), `step ${step}`);
});
