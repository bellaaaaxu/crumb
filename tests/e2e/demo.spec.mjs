/* The public demo is a static page with no server: open it straight from disk. */
import { test, expect } from '@playwright/test';
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
  for (const [id, count] of [['icons-keep', 3], ['icons-hide', 1], ['icons-vary', 4]]) {
    await expect(page.locator(`#${id} canvas`)).toHaveCount(count);
  }
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
  expect(decodeURIComponent(icon.slice('data:image/svg+xml,'.length))).toContain(`fill="${outline}"`);

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
  for (const [id, count] of [['icons-keep', 3], ['icons-hide', 1], ['icons-vary', 4]]) {
    await expect(page.locator(`#${id} canvas`)).toHaveCount(count);
  }

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
