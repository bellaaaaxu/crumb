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

/* ---------------------------------------------------------------- Café: the app */

/* In a café team the same canvases equal references drawn on the same page with the same
 * function and size, in the colours the page computes for --digit and --wordmark. Those are
 * checked to be the café's own first (spec §4.6 (b)), so a page that stayed light cannot pass.
 * This part brings in what it needs itself and keeps its helpers inside, so it does not depend
 * on the names above. */
test.describe('Café: the app', () => {
  const fixtures = () => import('./fixtures.mjs');

  /* A colour variable as the page computes it on <html>, where app/pixels.js reads it. */
  const variableOf = (page, name) => page.evaluate(variable => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(), name);

  /* True when the canvas holds exactly what the page's pixel table draws for `text` in `colour`
   * at the canvas's own cell size (the glyphs are 5 cells high): drawNumber for a number,
   * drawText for a word. page.evaluate runs at the page's global scope, where sprites.js's
   * `const Pixel` is visible by its name. */
  const drawnAs = (canvas, text, colour) => canvas.evaluate((node, [word, ink]) => {
    const size = Number.parseFloat(node.style.height) / 5;
    const reference = document.createElement('canvas');
    if (/^[0-9.-]+$/.test(word)) Pixel.drawNumber(reference, word, size, ink); // eslint-disable-line no-undef
    else Pixel.drawText(reference, word, size, ink); // eslint-disable-line no-undef
    return reference.toDataURL() === node.toDataURL();
  }, [text, colour]);

  test('a café member’s balance is drawn in the café’s --digit', async ({ browser }) => {
    const { provision } = await fixtures();
    const fx = await provision(browser, { theme: 'cafe' });
    try {
      const treat = await fx.api.request('POST', '/api/admin/grants',
        { userId: fx.memberId, amount: '250', mode: 'points', reason: '' }, { 'idempotency-key': 'e2e-cafe-balance-canvas' });
      expect(treat.status).toBe(201);
      const page = fx.memberPage;
      await page.reload();
      await expect(page.getByTestId('available-balance')).toHaveText('250 points');
      expect(await variableOf(page, '--digit')).toBe('#f9e0b4');
      await expect.poll(() => drawnAs(page.locator('.big-number canvas'), '250', '#f9e0b4')).toBe(true);
    } finally {
      await fx.close();
    }
  });

  test('a café team’s sign-in page draws CRUMB in the café’s --wordmark', async ({ browser }) => {
    const { provision } = await fixtures();
    const fx = await provision(browser, { theme: 'cafe' });
    let context;
    try {
      context = await browser.newContext({ reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.goto(fx.origin);
      await expect(page.getByRole('heading', { name: 'Sign in to Northside Coffee Co.' })).toBeVisible();
      expect(await variableOf(page, '--wordmark')).toBe('#ecbc7c');
      await expect.poll(() => drawnAs(page.locator('.auth-brand canvas').last(), 'CRUMB', '#ecbc7c')).toBe(true);
    } finally {
      await context?.close();
      await fx.close();
    }
  });
});

/* ---------------------------------------------------------------- Café: the demo (spec §8, §13) */

/* In the demo's café the balance, CRUMB and the chevron under the phone are drawn in the café's
 * --digit, --wordmark and --chevron, read from the page when they are drawn: on a page opened in
 * the café, and after a switch to it. Under forced colours the balance and CRUMB take the system's
 * text colour instead (assumption 39). Everything here is in a block of its own, so its names
 * never meet the ones above. */
test.describe('Café: the demo', () => {
  const DEMO = new URL('../../index.html', import.meta.url).href;
  const CHEVRON_ROWS = ['X.....X', 'XX...XX', '.XX.XX.', '..XXX..'];
  const CAFE = { '--digit': '#f9e0b4', '--wordmark': '#ecbc7c', '--chevron': '#b9a68b' };

  /* The colours the page has now, read the way assets/app.js reads them. */
  const tokens = page => page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(['--digit', '--wordmark', '--chevron'].map(name => [name, style.getPropertyValue(name).trim()]));
  });
  /* The three canvases as shown, and as the page's own pixel table draws them in `colours` (the
   * balance being the amount #balance-text says). */
  const shown = page => page.evaluate(() => ({
    balance: document.getElementById('balance').toDataURL(),
    wordmark: document.getElementById('wordmark').toDataURL(),
    chevron: document.getElementById('more-arrow').toDataURL(),
  }));
  const drawn = (page, colours) => page.evaluate(([colours, rows]) => {
    const draw = paint => {
      const canvas = document.createElement('canvas');
      paint(canvas);
      return canvas.toDataURL();
    };
    const amount = document.getElementById('balance-text').textContent.replace('$', '');
    return {
      balance: draw(canvas => Pixel.drawNumber(canvas, amount, 9, colours['--digit'])),
      wordmark: draw(canvas => Pixel.drawText(canvas, 'CRUMB', 7, colours['--wordmark'])),
      chevron: draw(canvas => Pixel.drawSprite(canvas, { palette: { X: colours['--chevron'] }, rows }, 3, 0)),
    };
  }, [colours, CHEVRON_ROWS]);
  /* A page opened with the café remembered; less motion, so the balance is drawn in one go and
   * nothing plays over it. */
  async function openCafe(browser, options = {}) {
    const context = await browser.newContext({ reducedMotion: 'reduce', ...options });
    const page = await context.newPage();
    await page.goto(DEMO);
    await page.evaluate(() => localStorage.setItem('crumb_demo_theme', 'cafe'));
    await page.reload();
    await expect(page.locator('#mascot')).toHaveAttribute('aria-label', 'Mascot: hot coffee');
    return { context, page };
  }

  test('the balance, CRUMB and the chevron are drawn in the café’s colours, opened there and after a switch', async ({ browser }) => {
    const { context, page } = await openCafe(browser);
    try {
      expect(await tokens(page)).toEqual(CAFE);
      expect(await shown(page)).toEqual(await drawn(page, CAFE));
      // To the Pastry shop and back: with less motion each switch is instant.
      await page.locator('#shop-switch [data-shop="default"]').click();
      await expect(page.locator('#mascot')).toHaveAttribute('aria-label', 'Mascot: wife cake');
      expect(await shown(page)).toEqual(await drawn(page, { '--digit': '#4a2f1b', '--wordmark': '#4a2f1b', '--chevron': '#8a6a4c' }));
      await page.locator('#shop-switch [data-shop="cafe"]').click();
      await expect(page.locator('#mascot')).toHaveAttribute('aria-label', 'Mascot: hot coffee');
      expect(await tokens(page)).toEqual(CAFE);
      expect(await shown(page)).toEqual(await drawn(page, CAFE));
    } finally {
      await context.close();
    }
  });

  test('under forced colours the café’s balance and CRUMB are drawn in the system’s text colour', async ({ browser }) => {
    const { context, page } = await openCafe(browser, { forcedColors: 'active' });
    try {
      const forced = await tokens(page);
      expect(forced).toEqual({ ...CAFE, '--digit': 'CanvasText', '--wordmark': 'CanvasText' });
      const now = await shown(page);
      expect(now).toEqual(await drawn(page, forced));
      // And that is not the café's cream and caramel: the canvas draws CanvasText as a colour of its own.
      const cafe = await drawn(page, CAFE);
      expect(now.balance).not.toBe(cafe.balance);
      expect(now.wordmark).not.toBe(cafe.wordmark);
    } finally {
      await context.close();
    }
  });
});
