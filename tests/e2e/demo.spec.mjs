/* The public demo is a static page with no server: open it straight from disk. */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const DEMO = pathToFileURL(resolve('index.html')).href;
const filled = page => page.locator('#slots .slot.filled');
const shopButton = (page, name) => page.getByRole('button', { name, exact: true });
const rgb = hex => `rgb(${[1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16)).join(', ')})`;

/* Every uncaught exception and console error on the page, to assert there are none. */
function errorsOf(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

/* Whether a canvas on the page shows exactly the shop's mascot, drawn at `size`. */
const showsMascot = (page, selector, shop, size) => page.evaluate(([selector, shop, size]) => {
  const canvas = document.querySelector(selector);
  const expected = document.createElement('canvas');
  Pixel.drawSprite(expected, Pixel.SPRITES[Pixel.THEMES[shop].mascot], size, 0);
  return Boolean(canvas) && canvas.toDataURL() === expected.toDataURL();
}, [selector, shop, size]);

/* The small pictures on the three cards under the demo, by card (spec §7). */
const CARD_PICTURES = {
  default: { 'icons-keep': ['laopo', 'tart', 'bolo'], 'icons-hide': ['charsiu'], 'icons-vary': ['mochi', 'walnut', 'mango', 'taro'] },
  bakery: { 'icons-keep': ['toastbite', 'croissant', 'bolo'], 'icons-hide': ['cupcake'], 'icons-vary': ['donut', 'pretzel', 'mango', 'bagel'] },
};

/* Whether the canvases in `selector` show exactly the drawings of `keys`, in that order, each
 * drawn at `size`. */
const showsDrawings = (page, selector, keys, size) => page.evaluate(([selector, keys, size]) => {
  const canvases = [...document.querySelectorAll(selector)];
  return canvases.length === keys.length && canvases.every((canvas, index) => {
    const expected = document.createElement('canvas');
    Pixel.drawSprite(expected, Pixel.SPRITES[keys[index]], size, 0);
    return canvas.toDataURL() === expected.toDataURL();
  });
}, [selector, keys, size]);

/* Whether each of the three cards shows the shop's own pictures. */
async function expectCardPictures(page, shop) {
  for (const [id, keys] of Object.entries(CARD_PICTURES[shop])) {
    await expect(page.locator(`#${id} canvas`), id).toHaveCount(keys.length);
    await expect.poll(() => showsDrawings(page, `#${id} canvas`, keys, 3), { message: `${id} in ${shop}` }).toBe(true);
  }
}

test('the tour plays by itself, hands over control, and the collection survives spending', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator('#get-note')).toHaveText('Playing on its own');
  await expect(page.locator('#caption-text')).toContainText('Sam');

  await page.getByRole('button', { name: 'Take control', exact: true }).click();
  await expect(page.locator('#get-note')).toHaveText('You’re driving');
  await page.getByRole('button', { name: 'Reset the demo', exact: true }).click();
  await expect(page.locator('#balance-text')).toHaveText('$84.25');
  await expect(filled(page)).toHaveCount(6);

  await page.locator('[data-grant="50"]').click();
  await expect(page.locator('#balance-text')).toHaveText('$134.25');
  await expect(filled(page)).toHaveCount(7);

  await page.locator('#spend').click();
  for (const key of ['1', '2', '5', '0']) await page.locator('.sheet .key', { hasText: new RegExp(`^${key}$`) }).click();
  await page.locator('#sheet-ok').click();
  await expect(page.locator('#balance-text')).toHaveText('$121.75');
  await expect(filled(page)).toHaveCount(7);

  await page.getByRole('button', { name: 'Reset the demo', exact: true }).click();
  await expect(page.locator('#balance-text')).toHaveText('$84.25');
  await expect(filled(page)).toHaveCount(6);
});

test('the demo says it is a demo and points to the real thing', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.getByText(/invented/i).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /deploy/i }).first()).toHaveAttribute('href', /DEPLOYMENT\.md$/);
  await expect(page.getByRole('link', { name: /feedback/i }).first()).toHaveAttribute('href', /issues\/new\/choose$/);
  await expect(page).toHaveTitle(/appreciation/i);
});

test('with reduced motion the tour waits for the visitor', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(DEMO);
  await expect(page.locator('#get-note')).toHaveText('You’re driving');
  await context.close();
});

/* The demo shows either shop: Pastry shop by default, Bakery when chosen. The switch sits
 * outside the stage, so it never takes the tour over; the choice is kept in the browser
 * under its own key. The shutter animation is tested separately. */

test('a first visit shows the Pastry shop, with the same numbers as before', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto(DEMO);
  await expect(shopButton(page, 'Pastry shop')).toHaveAttribute('aria-pressed', 'true');
  await expect(shopButton(page, 'Bakery')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Mascot: wife cake', exact: true })).toBeVisible();
  await expect.poll(() => showsMascot(page, '#mascot-canvas', 'default', 3)).toBe(true);
  await expect.poll(() => showsMascot(page, '#app-icon', 'default', 7)).toBe(true);
  await expect(page.locator('#stat-collectibles')).toHaveText('39');
  await expect(page.locator('#cabinet-count')).toHaveText('39');
  await expect(page.locator('#cabinet .slot')).toHaveCount(39);
  await expect(page.locator('#cabinet .slot.limited')).toHaveCount(6);
  await expect(page.locator('#legend-rotation')).toHaveText('33');
  await expect(page.locator('#legend-limited')).toHaveText('6');
  await expect(page.locator('#legend-limited-line')).toBeVisible();
  await expect(page.locator('#cabinet-title')).toHaveText('The pastry cabinet');
  await expect(page.locator('#card-keep')).toHaveText('Spend your whole balance and your pastries stay.');
  await expect(page.locator('#rule-keep')).toHaveText('$50 received = 1 pastry');
  await expect(page.locator('#rule-hide')).toHaveText('“Egg Tart is in the oven”');
  await expect(page.locator('#step-grant')).toHaveText('watch a pastry come out of the oven');
  await expect(page.locator('#step-switch')).toHaveText('different pastries, same rule');
  await expectCardPictures(page, 'default');
  expect(errors).toEqual([]);
});

test('switching shops while the tour plays starts it again in the new shop, without taking over', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto(DEMO);
  await expect(page.locator('#caption-text')).toContainText('comes out of the oven');
  await shopButton(page, 'Bakery').click();
  // Every check below comes after the restart: the caption only says "bakes" once it has
  // happened, and with the shutter animation that is a moment after the click.
  await expect(page.locator('#caption-text')).toHaveText('Sam is six months in. Six bakes on the shelf, $84.25 to spend.');
  // An oven intro stays in the page for 1.32 s (900 ms, then 420 ms leaving), longer than the
  // longest wait between retries (1 s), so one played by the restart would still be here.
  expect(await page.locator('#phone .oven').count(), 'a switch plays no oven intro').toBe(0);
  await expect(page.locator('#get-note')).toHaveText('Playing on its own');
  await expect(page.locator('body')).toHaveClass(/autoplay/);
  await expect(page.locator('#balance-text')).toHaveText('$84.25');
  await expect(page.locator('#caption-text'))
    .toHaveText('Alex, two years in: nineteen bakes, in an order nobody else has.', { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test('in the Bakery the shelf, mascot, tab icon, crumbs, words, cards, cabinet and numbers are the Bakery’s', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto(DEMO);
  await page.getByRole('button', { name: 'Take control', exact: true }).click();
  await page.getByRole('button', { name: 'Reset the demo', exact: true }).click();
  const pageIcon = await page.locator('#tab-icon').getAttribute('href');
  const { pastryNext, bakeryNext, outline } = await page.evaluate(() => ({
    pastryNext: Pixel.NAMES[Pixel.forSlot('118', 6)].en,
    bakeryNext: Pixel.NAMES[Pixel.forSlot('118', 6, 'bakery')].en,
    outline: Pixel.SPRITES[Pixel.THEMES.bakery.mascot].palette.X,
  }));
  expect(bakeryNext).not.toBe(pastryNext);
  await expect(page.locator('#oven-caption b')).toHaveText(pastryNext);

  await shopButton(page, 'Bakery').click();
  await expect(shopButton(page, 'Bakery')).toHaveAttribute('aria-pressed', 'true');
  await expect(shopButton(page, 'Pastry shop')).toHaveAttribute('aria-pressed', 'false');
  // Sam's ledger is untouched; only what fills the shelf changes.
  await expect(page.locator('#balance-text')).toHaveText('$84.25');
  await expect(filled(page)).toHaveCount(6);
  await expect(page.locator('#oven-caption b')).toHaveText(bakeryNext);
  await expect(page.getByRole('button', { name: 'Mascot: bitten toast', exact: true })).toBeVisible();
  await expect.poll(() => showsMascot(page, '#mascot-canvas', 'bakery', 3)).toBe(true);
  await expect.poll(() => showsMascot(page, '#app-icon', 'bakery', 7)).toBe(true);
  const icon = await page.locator('#tab-icon').getAttribute('href');
  expect(icon).toMatch(/^data:image\/svg\+xml,/);
  const iconSvg = decodeURIComponent(icon.slice('data:image/svg+xml,'.length));
  expect(iconSvg).toContain(`fill="${outline}"`);
  // Bitten Toast fills its whole 12x12 grid, so the icon is 14x14 with the outer ring of cells
  // left to the background, like the page's own icon.
  expect(iconSvg).toContain('viewBox="0 0 14 14"');
  expect(iconSvg).not.toMatch(/ [xy]="(0|13)"/);

  await expect(page.locator('#stat-collectibles')).toHaveText('24');
  await expect(page.locator('#cabinet-count')).toHaveText('24');
  await expect(page.locator('#cabinet .slot')).toHaveCount(24);
  await expect(page.locator('#cabinet .slot.limited')).toHaveCount(0);
  await expect(page.locator('#legend-rotation')).toHaveText('24');
  await expect(page.locator('#legend-limited-line')).toBeHidden();
  await expect(page.locator('#cabinet-title')).toHaveText('The bakery case');
  await expect(page.locator('#card-keep')).toHaveText('Spend your whole balance and your bakes stay.');
  await expect(page.locator('#rule-keep')).toHaveText('$50 received = 1 bake');
  await expect(page.locator('#rule-hide')).toHaveText('“Croissant is in the oven”');
  await expect(page.locator('#step-grant')).toHaveText('watch a bake come out of the oven');
  await expect(page.locator('#step-switch')).toHaveText('different bakes, same rule');
  await expectCardPictures(page, 'bakery');

  // Spending says "bake", and the crumbs are the colour of the mascot's outline.
  await page.locator('#spend').click();
  for (const key of ['5', '0', '0']) await page.locator('.sheet .key', { hasText: new RegExp(`^${key}$`) }).click();
  await page.locator('#sheet-ok').click();
  await expect(page.locator('.toast')).toHaveText('$5.00 taken off — the shelf keeps every bake 🍞');
  await page.locator('#mascot').click();
  const colours = await page.locator('.particle')
    .evaluateAll(nodes => [...new Set(nodes.map(node => getComputedStyle(node).backgroundColor))]);
  expect(colours).toEqual([rgb(outline)]);

  // And back: the Pastry shop is exactly as it was, its own tab icon included.
  await shopButton(page, 'Pastry shop').click();
  await expect(page.getByRole('button', { name: 'Mascot: wife cake', exact: true })).toBeVisible();
  await expect(page.locator('#tab-icon')).toHaveAttribute('href', pageIcon);
  await expect.poll(() => showsMascot(page, '#mascot-canvas', 'default', 3)).toBe(true);
  await expect(page.locator('#oven-caption b')).toHaveText(pastryNext);
  await expect(page.locator('#cabinet .slot')).toHaveCount(39);
  await expect(page.locator('#legend-limited-line')).toBeVisible();
  await expectCardPictures(page, 'default');

  // The cabinet was drawn again for each shop before it scrolled into view: its slots still
  // wait hidden for it, and pop in when it comes.
  await expect(page.locator('#cabinet .slot.reveal-armed')).toHaveCount(39);
  await page.locator('#cabinet').scrollIntoViewIfNeeded();
  await expect(page.locator('#cabinet .slot.pop')).toHaveCount(39);
  expect(errors).toEqual([]);
});

test('the chosen shop is remembered on reload, kept by Reset the demo, and stored on its own', async ({ page }) => {
  await page.goto(DEMO);
  await shopButton(page, 'Bakery').click();
  // Wait for the switch before reloading: the choice is stored when the shop changes, and with
  // the shutter animation that is a moment after the click.
  await expect(page.getByRole('button', { name: 'Mascot: bitten toast', exact: true })).toBeVisible();
  await page.reload();
  await expect(shopButton(page, 'Bakery')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Mascot: bitten toast', exact: true })).toBeVisible();
  await expect(page.locator('#caption-text')).toHaveText('Sam is six months in. Six bakes on the shelf, $84.25 to spend.');

  await page.getByRole('button', { name: 'Take control', exact: true }).click();
  await page.getByRole('button', { name: 'Reset the demo', exact: true }).click();
  // Reset plays the oven intro, with this shop's mascot.
  expect(await showsMascot(page, '#phone .oven canvas', 'bakery', 8)).toBe(true);
  await expect(shopButton(page, 'Bakery')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#stat-collectibles')).toHaveText('24');
  const stored = await page.evaluate(() => ({
    theme: localStorage.getItem('crumb_demo_theme'),
    demo: Object.keys(JSON.parse(localStorage.getItem('crumb_demo_v1'))),
  }));
  expect(stored.theme).toBe('bakery');
  expect(stored.demo).not.toContain('theme');

  await shopButton(page, 'Pastry shop').click();
  await expect(page.getByRole('button', { name: 'Mascot: wife cake', exact: true })).toBeVisible();
  await page.reload();
  await expect(shopButton(page, 'Pastry shop')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Mascot: wife cake', exact: true })).toBeVisible();
});

test('a browser that refuses storage can still switch shops, and remembers nothing', async ({ page }) => {
  const errors = errorsOf(page);
  await page.addInitScript(() => {
    const refuse = () => { throw new DOMException('The storage is blocked.', 'SecurityError'); };
    Storage.prototype.getItem = refuse;
    Storage.prototype.setItem = refuse;
  });
  await page.goto(DEMO);
  await shopButton(page, 'Bakery').click();
  await expect(page.getByRole('button', { name: 'Mascot: bitten toast', exact: true })).toBeVisible();
  await page.reload();
  await expect(shopButton(page, 'Pastry shop')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Mascot: wife cake', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the shop switch stays inside a phone-width page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(DEMO);
  for (const name of ['Pastry shop', 'Bakery']) {
    const box = await shopButton(page, name).boundingBox();
    expect(box, name).not.toBeNull();
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(390);
  }
});

/* ---------------------------------------------------------------- what each shop draws */

/* The generated list files: each theme's keys, rotation first and app-only ones last. */
const listFile = id => JSON.parse(readFileSync(resolve(`themes/${id}.json`), 'utf8'));
const PASTRY_LIST = listFile('default');
const BAKERY_LIST = listFile('bakery');

/* Where a person starts in a rotation, by 0.2's arithmetic (Pixel.forSlot): the sum of the
 * seed's character codes. Sam is #118, which sums to 154. */
const charSum = seed => [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
const fromSlot = (seed, rotation, count) =>
  Array.from({ length: count }, (_, index) => rotation[(index + charSum(seed)) % rotation.length]);
const samInBakery = fromSlot('118', BAKERY_LIST.keys, 7);

/* The mascot's accessible name in each shop. */
const PASTRY_MASCOT = 'Mascot: wife cake';
const BAKERY_MASCOT = 'Mascot: bitten toast';

/* What each shop draws for Sam's fresh demo: six on the shelf and one in the oven, the cabinet
 * in list order with the app-only ones dashed, and the pictures on the three cards. */
const DRAWINGS = {
  default: {
    // Exactly what 0.2 drew: CYCLE[(index + 154) % 33].
    shelf: ['datepastry', 'chickenpie', 'almond', 'dragonphoenix', 'centuryegg', 'chestnut'],
    oven: 'porttart',
    cabinet: PASTRY_LIST.keys,
    limited: ['pistachiohorn', 'cnybox', 'mooncake', 'radishcake', 'tarocake', 'ricecake'],
    cards: CARD_PICTURES.default,
  },
  bakery: {
    shelf: samInBakery.slice(0, 6),
    oven: samInBakery[6],
    cabinet: BAKERY_LIST.keys,
    limited: [],
    cards: CARD_PICTURES.bakery,
  },
};

/* The collectibles some canvases show, in page order: for each canvas, the key whose drawing in
 * the page's own sprite table (Pixel, the global of assets/sprites.js), made afresh at the
 * canvas's size, is the same picture; null when it shows none of them. */
const keysOn = locator => locator.evaluateAll(canvases => canvases.map(canvas => {
  const size = Math.round(canvas.width / Math.min(window.devicePixelRatio || 1, 3) / 12);
  const picture = canvas.toDataURL();
  const probe = document.createElement('canvas');
  for (const [spriteKey, sprite] of Object.entries(Pixel.SPRITES)) {
    Pixel.drawSprite(probe, sprite, size, 0);
    if (probe.toDataURL() === picture) return spriteKey;
  }
  return null;
}));

async function expectDrawings(page, id) {
  const drawn = DRAWINGS[id];
  await expect(filled(page)).toHaveCount(drawn.shelf.length);
  await expect.poll(() => keysOn(filled(page).locator('canvas'))).toEqual(drawn.shelf);
  expect(await keysOn(page.locator('#oven-caption canvas'))).toEqual([drawn.oven]);
  await expect(page.locator('#cabinet .slot')).toHaveCount(drawn.cabinet.length);
  expect(await keysOn(page.locator('#cabinet .slot canvas'))).toEqual(drawn.cabinet);
  expect(await keysOn(page.locator('#cabinet .slot.limited canvas'))).toEqual(drawn.limited);
  for (const [box, spriteKeys] of Object.entries(drawn.cards)) {
    await expect(page.locator(`#${box} canvas`)).toHaveCount(spriteKeys.length);
    expect(await keysOn(page.locator(`#${box} canvas`)), box).toEqual(spriteKeys);
  }
}

test('each shop draws its own shelf, cabinet and card pictures, and the Pastry shop draws exactly what 0.2 did', async ({ browser }) => {
  // Less motion: the tour waits and the switch is instant, so Sam's fresh six stay on screen.
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    const errors = errorsOf(page);
    await page.goto(DEMO);
    await expectDrawings(page, 'default');
    // Each switch is waited out (with less motion there is no shutter to wait for), so this test
    // looks only at what is drawn; the shutter tests below look at the switching.
    await shopButton(page, 'Bakery').click();
    await expect(page.locator('#mascot')).toHaveAttribute('aria-label', BAKERY_MASCOT);
    await expect(page.locator('#phone .shutter')).toHaveCount(0);
    await expectDrawings(page, 'bakery');
    await shopButton(page, 'Pastry shop').click();
    await expect(page.locator('#mascot')).toHaveAttribute('aria-label', PASTRY_MASCOT);
    await expect(page.locator('#phone .shutter')).toHaveCount(0);
    await expectDrawings(page, 'default');
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

/* ---------------------------------------------------------------- the shutter (spec §7.1) */

/* Runs in the page. Keeps every change to the shutter, its sign, the name drawn on the sign and
 * the mascot's accessible name, in order. `batch` counts observer callbacks: changes made in
 * the same timer tick share one, so it tells what happened together. */
function installRecorder() {
  const log = { records: [], added: [], removed: [] };
  window.__shutter = log;
  const started = performance.now();
  let batch = 0;
  const kindOf = node => {
    if (node.id === 'mascot') return 'label';
    if (node.matches('.shutter')) return 'door';
    if (node.matches('.shutter-sign')) return 'sign';
    if (node.matches('.shutter-sign canvas')) return 'name';
    return null;
  };
  new MutationObserver(records => {
    batch += 1;
    const at = performance.now() - started;
    for (const record of records) {
      if (record.type === 'childList') {
        for (const node of record.addedNodes) if (node.nodeType === 1 && node.matches('.shutter')) log.added.push(at);
        for (const node of record.removedNodes) if (node.nodeType === 1 && node.matches('.shutter')) log.removed.push(at);
        continue;
      }
      const kind = kindOf(record.target);
      if (kind) log.records.push({ kind, batch, target: record.target, attribute: record.attributeName, before: record.oldValue });
    }
  }).observe(document.body, {
    subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['style', 'aria-label'],
  });
}

/* Runs in the page. A record holds the value before a change; the value after it is the next
 * record's "before" for the same node and attribute, or what the node holds now. */
function readRecorder() {
  const log = window.__shutter;
  const changes = kind => {
    const mine = log.records.filter(record => record.kind === kind);
    return mine.map((record, index) => {
      const next = mine.slice(index + 1).find(other => other.target === record.target && other.attribute === record.attribute);
      return { batch: record.batch, before: record.before, after: next ? next.before : record.target.getAttribute(record.attribute) };
    });
  };
  const transform = style => /transform:\s*([^;]+)/.exec(style ?? '')?.[1] ?? null;
  const width = style => /(?:^|;)\s*width:\s*([^;]+)/.exec(style ?? '')?.[1] ?? null;
  return {
    added: log.added,
    removed: log.removed,
    door: changes('door').map(change => ({ batch: change.batch, value: transform(change.after) })),
    sign: changes('sign').map(change => ({ batch: change.batch, value: transform(change.after) })),
    name: changes('name').map(change => ({ batch: change.batch, before: width(change.before), after: width(change.after) })),
    label: changes('label').map(change => ({ batch: change.batch, value: change.after })),
  };
}

/* Counts the shutters added to the page, from the first moment of every load. */
function countShutters() {
  window.__shutters = 0;
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node.nodeType === 1 && node.matches('.shutter')) window.__shutters += 1;
    }
  }).observe(document, { childList: true, subtree: true });
}

/* The visitor takes the tour over and the opening oven intro has gone. */
async function takeControl(page) {
  await page.goto(DEMO);
  await page.getByRole('button', { name: 'Take control', exact: true }).click();
  await expect(page.locator('#phone .oven')).toHaveCount(0);
}

test('switching shop brings the shutter down over the phone, flips its sign behind it and rolls it back up', async ({ page }) => {
  const errors = errorsOf(page);
  await takeControl(page);
  await page.evaluate(installRecorder);
  await shopButton(page, 'Bakery').click();
  await page.waitForFunction(() => window.__shutter.removed.length > 0, null, { timeout: 3000 });
  const run = await page.evaluate(readRecorder);

  expect(run.added).toHaveLength(1);
  expect(run.removed[0] - run.added[0]).toBeGreaterThanOrEqual(900);
  // Down in eight steps, up in eight.
  expect(run.door.map(step => step.value)).toEqual([
    'translateY(-87.5%)', 'translateY(-75%)', 'translateY(-62.5%)', 'translateY(-50%)',
    'translateY(-37.5%)', 'translateY(-25%)', 'translateY(-12.5%)', 'translateY(0%)',
    'translateY(-12.5%)', 'translateY(-25%)', 'translateY(-37.5%)', 'translateY(-50%)',
    'translateY(-62.5%)', 'translateY(-75%)', 'translateY(-87.5%)', 'translateY(-100%)',
  ]);
  // Squashed sideways to a line in three steps, opened in three, then two swings.
  expect(run.sign.map(step => step.value)).toEqual([
    'scaleX(0.66)', 'scaleX(0.33)', 'scaleX(0.06)', 'scaleX(0.33)', 'scaleX(0.66)', 'scaleX(1)',
    'rotate(-4deg)', 'rotate(3deg)', 'rotate(0deg)',
  ]);
  // The sign takes the new name (PASTRY SHOP is 172px wide, BAKERY 92px) at its narrowest, in
  // the same tick as the shop changes behind it, and only once the door is all the way down.
  const narrowest = run.sign[2].batch;
  expect(run.name[0].before).toBe('172px');
  expect(run.name.at(-1).after).toBe('92px');
  expect(run.name[0].batch).toBe(narrowest);
  expect(run.label.find(change => change.value === BAKERY_MASCOT)?.batch).toBe(narrowest);
  expect(run.door[7].batch).toBeLessThanOrEqual(narrowest);
  expect(run.door[8].batch).toBeGreaterThanOrEqual(narrowest);
  // The layer goes, and the new stock pops onto the shelf one item after another. The delays
  // are the restock's own 25 ms steps: the redraw behind the door left 0, 70, 140 ms…, so this
  // fails if the restock never ran.
  await expect(page.locator('#phone .shutter')).toHaveCount(0);
  await expect(page.locator('#mascot')).toHaveAttribute('aria-label', BAKERY_MASCOT);
  await expect(filled(page)).toHaveCount(6);
  await expect(page.locator('#slots .slot.filled:not(.pop)')).toHaveCount(0);
  expect(await filled(page).evaluateAll(slots => slots.map(slot => slot.style.animationDelay)))
    .toEqual(['0ms', '25ms', '50ms', '75ms', '100ms', '125ms']);
  expect(errors).toEqual([]);
});

test('a second press while the shutter comes down is ignored', async ({ page }) => {
  await takeControl(page);
  await page.evaluate(installRecorder);
  // Two presses on Bakery in the same instant, from inside the page. The second lands while the
  // Pastry shop is still the one on show, so only the one-switch-at-a-time guard can stop a
  // second shutter.
  await page.evaluate(() => {
    const bakery = [...document.querySelectorAll('#shop-switch button')].find(button => button.textContent.trim() === 'Bakery');
    bakery.click();
    bakery.click();
  });
  await page.waitForFunction(() => window.__shutter.removed.length > 0, null, { timeout: 3000 });
  expect((await page.evaluate(readRecorder)).added).toHaveLength(1);
  await expect(page.locator('#mascot')).toHaveAttribute('aria-label', BAKERY_MASCOT);
  await expect(shopButton(page, 'Bakery')).toHaveAttribute('aria-pressed', 'true');
});

test('a press on the other shop once the sign has flipped, with the shutter still down, is ignored', async ({ page }) => {
  await takeControl(page);
  await page.evaluate(installRecorder);
  // All inside the page, so nothing waits on a round trip: press Bakery, and the moment the
  // mascot's name turns to Bakery's (the sign has flipped and the shop behind it has changed),
  // note whether the shutter is still down and press the Pastry shop. Bakery is on show by then,
  // so that press is a real change of shop: the same-shop check lets it through, and only the
  // one-switch-at-a-time guard can stop a second shutter.
  const downAtPress = await page.evaluate(mascotName => new Promise(resolve => {
    const button = name => [...document.querySelectorAll('#shop-switch button')].find(each => each.textContent.trim() === name);
    const mascot = document.getElementById('mascot');
    new MutationObserver((records, observer) => {
      if (mascot.getAttribute('aria-label') !== mascotName) return;
      observer.disconnect();
      const down = document.querySelector('#phone .shutter') !== null;
      button('Pastry shop').click();
      resolve(down);
    }).observe(mascot, { attributes: true, attributeFilter: ['aria-label'] });
    button('Bakery').click();
  }), BAKERY_MASCOT);
  expect(downAtPress, 'the shutter was still down at the second press').toBe(true);
  await page.waitForFunction(() => window.__shutter.removed.length > 0, null, { timeout: 3000 });
  // Longer than a second shutter would take to finish.
  await page.waitForTimeout(1200);
  expect((await page.evaluate(readRecorder)).added).toHaveLength(1);
  await expect(page.locator('#mascot')).toHaveAttribute('aria-label', BAKERY_MASCOT);
  await expect(shopButton(page, 'Bakery')).toHaveAttribute('aria-pressed', 'true');
});

test('pressing the shop already on show brings no shutter', async ({ page }) => {
  await takeControl(page);
  await page.evaluate(installRecorder);
  await shopButton(page, 'Pastry shop').click();
  await page.waitForTimeout(500);
  expect((await page.evaluate(readRecorder)).added).toEqual([]);
});

test('with reduced motion the shop changes at once, with no shutter', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.addInitScript(countShutters);
    await page.goto(DEMO);
    await shopButton(page, 'Bakery').click();
    // At once: the mascot's name and the shelf are Bakery's before a shutter could have run.
    await expect(page.locator('#mascot')).toHaveAttribute('aria-label', BAKERY_MASCOT, { timeout: 200 });
    expect(await keysOn(filled(page).locator('canvas'))).toEqual(DRAWINGS.bakery.shelf);
    expect(await page.evaluate(() => window.__shutters)).toBe(0);
  } finally {
    await context.close();
  }
});

test('the choice is stored at the press, and a page opened with it remembered draws it straight away, with no shutter', async ({ page }) => {
  await page.addInitScript(countShutters);
  await takeControl(page);
  // Pressed and looked at in the same instant: already stored, while the shutter is down and
  // the Pastry shop is still on show behind it.
  const atPress = await page.evaluate(() => {
    [...document.querySelectorAll('#shop-switch button')].find(button => button.textContent.trim() === 'Bakery').click();
    return {
      stored: localStorage.getItem('crumb_demo_theme'),
      down: document.querySelector('#phone .shutter') !== null,
      label: document.getElementById('mascot').getAttribute('aria-label'),
    };
  });
  expect(atPress).toEqual({ stored: 'bakery', down: true, label: PASTRY_MASCOT });
  expect(await page.evaluate(() => window.__shutters)).toBe(1);
  // Reloaded straight away, part-way through the shutter.
  await page.reload();
  await expect(shopButton(page, 'Bakery')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mascot')).toHaveAttribute('aria-label', BAKERY_MASCOT);
  // The visitor had taken over, so the load plays the oven intro; it leaves, and no shutter came.
  await expect(page.locator('#phone .oven')).toHaveCount(0);
  expect(await page.evaluate(() => window.__shutters)).toBe(0);
});

test('switching while the tour plays: the shutter runs, the tour starts again from Sam, and no oven intro shows', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto(DEMO);
  await expect(page.locator('#get-note')).toHaveText('Playing on its own');
  // Well into the tour: the opening intro has long gone.
  await expect(page.locator('#caption-text')).toContainText('comes out of the oven');
  await expect(page.locator('#phone .oven')).toHaveCount(0);
  await page.evaluate(() => {
    window.__added = { ovens: 0, shutters: 0 };
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches('.oven')) window.__added.ovens += 1;
          if (node.matches('.shutter')) window.__added.shutters += 1;
        }
      }
    }).observe(document.getElementById('phone'), { childList: true, subtree: true });
  });
  // Outside the stage: pressing it is not taking over.
  await shopButton(page, 'Bakery').click();
  await expect(page.locator('#caption-text')).toHaveText('Sam is six months in. Six bakes on the shelf, $84.25 to spend.');
  await expect(page.locator('#phone .shutter')).toHaveCount(0);
  await expect(page.locator('#get-note')).toHaveText('Playing on its own');
  await expect(page.locator('body')).toHaveClass(/autoplay/);
  expect(await page.evaluate(() => window.__added)).toEqual({ ovens: 0, shutters: 1 });
  expect(errors).toEqual([]);
});
