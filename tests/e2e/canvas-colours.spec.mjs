/* Pastry shop and Bakery draw their canvases exactly as 0.3.0 did (spec §13, "Canvases pixel by
 * pixel"): each canvas below equals a reference that the page's own pixel table draws on the same
 * page, with the same function, the same size and 0.3.0's colour. In the app: a member's balance
 * (Pixel.drawNumber, through pixelNumber; less motion, so it is drawn in one go) and CRUMB on the
 * sign-in page (Pixel.drawText, through pixelWord('CRUMB', 5)), in a Pastry shop team and in a
 * Bakery team, and CRUMB on the setup page, which has no team and so no theme. In the demo, opened
 * in either shop and after switching to the other: the balance (size 9), CRUMB (size 7) and the
 * chevron under the phone (the four rows, size 3). Every team here is invented. */
import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { provision, startCrumb } from './fixtures.mjs';

const BROWN = '#4a2f1b';
const CHEVRON_BROWN = '#8a6a4c';
const CHEVRON_ROWS = ['X.....X', 'XX...XX', '.XX.XX.', '..XXX..'];
const THEMES = [['Pastry shop', 'default'], ['Bakery', 'bakery']];
const DEMO = pathToFileURL(resolve('index.html')).href;

/* The canvas next to a reference the page's pixel table draws in `colour`: `{ same, ink }`, where
 * `same` says the two are equal pixel for pixel and `ink` lists every colour the canvas has drawn
 * (as #rrggbb, or #rrggbbaa where it is not opaque), so a failure names the colour it found.
 * `kind` is 'number' (Pixel.drawNumber), 'word' (Pixel.drawText) or 'rows' (Pixel.drawSprite with
 * the rows in `colour`, whole); `size` is the cell size, or null for the canvas's own (the
 * balance's cells shrink to fit its tile; the glyphs are five cells high). page.evaluate runs at
 * the page's global scope, where sprites.js's `const Pixel` is visible by its name. */
const compared = (canvas, kind, what, size, colour) => canvas.evaluate((node, [kind, what, size, colour]) => {
  const reference = document.createElement('canvas');
  const cell = size ?? Number.parseFloat(node.style.height) / 5;
  if (kind === 'number') Pixel.drawNumber(reference, what, cell, colour); // eslint-disable-line no-undef
  else if (kind === 'word') Pixel.drawText(reference, what, cell, colour); // eslint-disable-line no-undef
  else Pixel.drawSprite(reference, { palette: { X: colour }, rows: what }, cell, 0); // eslint-disable-line no-undef
  const ink = new Set();
  const { data } = node.getContext('2d').getImageData(0, 0, node.width, node.height);
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] === 0) continue;
    const channels = data[index + 3] === 255 ? data.slice(index, index + 3) : data.slice(index, index + 4);
    ink.add(`#${[...channels].map(value => value.toString(16).padStart(2, '0')).join('')}`);
  }
  return { same: reference.toDataURL() === node.toDataURL(), ink: [...ink] };
}, [kind, what, size, colour]);

const drawnIn = colour => ({ same: true, ink: [colour] });

/* ---------------------------------------------------------------- the app */

for (const [name, theme] of THEMES) {
  test(`${name}: a member’s balance is drawn as 0.3.0 drew it, in ${BROWN}`, async ({ browser }) => {
    const fx = await provision(browser, { theme });
    try {
      const treat = await fx.api.request('POST', '/api/admin/grants',
        { userId: fx.memberId, amount: '250', mode: 'points', reason: '' }, { 'idempotency-key': `e2e-canvas-balance-${theme}` });
      expect(treat.status).toBe(201);
      const page = fx.memberPage;
      await page.reload();
      await expect(page.getByTestId('available-balance')).toHaveText('250 points');
      await expect.poll(() => compared(page.locator('.big-number canvas'), 'number', '250', null, BROWN)).toEqual(drawnIn(BROWN));
    } finally {
      await fx.close();
    }
  });

  test(`${name}: CRUMB on the team’s sign-in page is drawn as 0.3.0 drew it, in ${BROWN}`, async ({ browser }) => {
    const fx = await provision(browser, { theme });
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const page = await context.newPage();
      await page.goto(fx.origin);
      await expect(page.getByRole('heading', { name: 'Sign in to Northside Coffee Co.' })).toBeVisible();
      await expect.poll(() => compared(page.locator('.auth-brand canvas').last(), 'word', 'CRUMB', 5, BROWN)).toEqual(drawnIn(BROWN));
    } finally {
      await context.close();
      await fx.close();
    }
  });
}

test(`CRUMB on the setup page, where there is no team and so no theme, is drawn as 0.3.0 drew it, in ${BROWN}`, async ({ browser }) => {
  const crumb = await startCrumb();
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.goto(crumb.origin);
    await expect(page.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
    await expect.poll(() => compared(page.locator('.auth-brand canvas').last(), 'word', 'CRUMB', 5, BROWN)).toEqual(drawnIn(BROWN));
  } finally {
    await context.close();
    await crumb.close();
  }
});

/* ---------------------------------------------------------------- the demo */

/* The balance, CRUMB and the chevron of the demo as shown now, each against its reference. */
async function demoCanvases(page) {
  const amount = (await page.locator('#balance-text').textContent()).replace('$', '');
  return {
    balance: await compared(page.locator('#balance'), 'number', amount, 9, BROWN),
    wordmark: await compared(page.locator('#wordmark'), 'word', 'CRUMB', 7, BROWN),
    chevron: await compared(page.locator('#more-arrow'), 'rows', CHEVRON_ROWS, 3, CHEVRON_BROWN),
  };
}
const DEMO_AS_IN_0_3 = { balance: drawnIn(BROWN), wordmark: drawnIn(BROWN), chevron: drawnIn(CHEVRON_BROWN) };

for (const [name, theme] of THEMES) {
  const [otherName, other] = THEMES.find(([, id]) => id !== theme);
  test(`the demo’s ${name}: the balance, CRUMB and the chevron are drawn as 0.3.0 drew them, there and after switching to the ${otherName}`, async ({ browser }) => {
    // Less motion: the tour does not drive the page, and a switch is instant, with no shutter.
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      await context.addInitScript(id => {
        try { window.localStorage.setItem('crumb_demo_theme', id); } catch { /* about:blank has no storage */ }
      }, theme);
      const page = await context.newPage();
      await page.goto(DEMO);
      await expect(page.locator(`#shop-switch [data-shop="${theme}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => demoCanvases(page)).toEqual(DEMO_AS_IN_0_3);
      await page.locator(`#shop-switch [data-shop="${other}"]`).click();
      await expect(page.locator(`#shop-switch [data-shop="${other}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => demoCanvases(page)).toEqual(DEMO_AS_IN_0_3);
    } finally {
      await context.close();
    }
  });
}
