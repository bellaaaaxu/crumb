/* Collection themes in the self-hosted app: the mascot (header, oven intro, sign-in brand),
 * the crumbs it spills and the tab and home-screen icons follow the team's theme, and an id
 * the page does not know draws Pastry shop's. Every person and team here is invented. */
import { test, expect } from '@playwright/test';
import { PASSWORD, nameMenu, signIn, startCrumb } from './fixtures.mjs';
import { client, orgInput } from '../helpers.mjs';

const TEAM = 'Northside Coffee Co.';

/* An empty Crumb set up through the API on the given theme (none sent: the server's
 * default), with Olive Chen as its owner. */
async function themedCrumb(theme) {
  const crumb = await startCrumb();
  const api = client(crumb.origin);
  await api.bootstrap();
  const org = orgInput('points', theme === undefined ? { name: TEAM } : { name: TEAM, theme });
  const setup = await api.request('POST', '/api/setup', {
    setupToken: crumb.setupToken, username: 'olive', password: PASSWORD, displayName: 'Olive Chen', org,
  });
  if (setup.status !== 201) {
    await crumb.close();
    throw new Error(`setup failed: ${JSON.stringify(setup.body)}`);
  }
  return crumb;
}

function pageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

/* A sprite as the page's own pixel table draws it at that size, and the picture a canvas on
 * the page holds: the same drawing gives the same data URL. page.evaluate runs at the page's
 * global scope, where sprites.js's `const Pixel` is visible by its name. */
const drawingOf = (page, key, size) => page.evaluate(([spriteKey, pixelSize]) => {
  const canvas = document.createElement('canvas');
  Pixel.drawSprite(canvas, Pixel.SPRITES[spriteKey], pixelSize, 0); // eslint-disable-line no-undef
  return canvas.toDataURL();
}, [key, size]);
const shownOn = locator => locator.evaluate(canvas => canvas.toDataURL());

/* A sprite's outline colour, written the way the browser reports a crumb's background. */
const outlineOf = (page, key) => page.evaluate(spriteKey => {
  const probe = document.createElement('div');
  probe.style.background = Pixel.SPRITES[spriteKey].palette.X; // eslint-disable-line no-undef
  return probe.style.backgroundColor;
}, key);

/* Notes the colour of the first crumb that lands on the page from now on: crumbs are gone
 * again within a second. */
const watchCrumbs = page => page.evaluate(() => {
  window.__crumbColour = null;
  new MutationObserver((records, observer) => {
    const particle = document.querySelector('.particle');
    if (!particle) return;
    window.__crumbColour = particle.style.backgroundColor;
    observer.disconnect();
  }).observe(document.body, { childList: true });
});
const crumbColour = page => page.evaluate(() => window.__crumbColour);

const brandMascot = page => page.locator('.auth-brand canvas').first();
const headerMascot = page => page.locator('.topbar .mascot canvas');
const tabIcon = page => page.locator('link[rel="icon"]');
const touchIcon = page => page.locator('link[rel="apple-touch-icon"]');

test('a Bakery team sees Bitten Toast on the sign-in page, in the header, its crumbs and the oven intro, and in the tab icons', async ({ browser }) => {
  let crumb;
  let context;
  try {
    crumb = await themedCrumb('bakery');
    // Full motion: the crumbs and the intro are what this looks at.
    context = await browser.newContext({ reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = pageErrors(page);

    await page.goto(crumb.origin);
    await expect(page.getByRole('heading', { name: `Sign in to ${TEAM}` })).toBeVisible();
    expect(await shownOn(brandMascot(page))).toBe(await drawingOf(page, 'toastbite', 4));
    // The links point at the theme's own files, and the app serves them.
    await expect(tabIcon(page)).toHaveAttribute('href', 'icons/bakery/favicon.svg');
    await expect(touchIcon(page)).toHaveAttribute('href', 'icons/bakery/icon-180.png');
    for (const [path, type] of [['icons/bakery/favicon.svg', 'image/svg+xml'], ['icons/bakery/icon-180.png', 'image/png']]) {
      const answer = await page.request.get(new URL(path, page.url()).href);
      expect(answer.status(), path).toBe(200);
      expect(answer.headers()['content-type'], path).toContain(type);
    }

    await signIn(page, crumb.origin, 'olive');
    expect(await shownOn(headerMascot(page))).toBe(await drawingOf(page, 'toastbite', 3));
    await expect(tabIcon(page)).toHaveAttribute('href', 'icons/bakery/favicon.svg');
    await expect(touchIcon(page)).toHaveAttribute('href', 'icons/bakery/icon-180.png');

    await watchCrumbs(page);
    await page.locator('.topbar .mascot').click();
    const toastOutline = await outlineOf(page, 'toastbite');
    await expect.poll(() => crumbColour(page)).toBe(toastOutline);

    // The intro plays once per load for someone signed in. The page's clock stands still, so
    // it stays until tapped; its slide out takes 420 ms.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    await page.reload();
    await expect(page.locator('.oven')).toBeVisible();
    expect(await shownOn(page.locator('.oven canvas'))).toBe(await drawingOf(page, 'toastbite', 8));
    await page.locator('.oven').click();
    await page.clock.runFor(500);
    await expect(page.locator('.oven')).toHaveCount(0);
    await page.clock.resume();
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await crumb?.close();
  }
});

test('a Bakery team signed out with no answer to who is here now still sees Bitten Toast', async ({ browser }) => {
  let crumb;
  let context;
  try {
    crumb = await themedCrumb('bakery');
    context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = pageErrors(page);
    await signIn(page, crumb.origin, 'olive');
    // From the moment the sign-out goes out, asking the server who is here now gets no answer:
    // the sign-in page is drawn from what the page already knew about the team.
    let leaving = false;
    await page.route('**/api/logout', route => {
      leaving = true;
      return route.continue();
    });
    await page.route('**/api/session', route => (leaving ? route.abort('connectionreset') : route.continue()));
    await nameMenu(page).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: `Sign in to ${TEAM}` })).toBeVisible();
    await expect(nameMenu(page)).toHaveCount(0);
    expect(await shownOn(brandMascot(page))).toBe(await drawingOf(page, 'toastbite', 4));
    await expect(tabIcon(page)).toHaveAttribute('href', 'icons/bakery/favicon.svg');
    await expect(touchIcon(page)).toHaveAttribute('href', 'icons/bakery/icon-180.png');
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await crumb?.close();
  }
});

test('a Pastry shop team keeps the wife cake, its brown crumbs and the icon addresses index.html names', async ({ browser }) => {
  let crumb;
  let context;
  try {
    crumb = await themedCrumb();
    context = await browser.newContext({ reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = pageErrors(page);
    await page.goto(crumb.origin);
    await expect(page.getByRole('heading', { name: `Sign in to ${TEAM}` })).toBeVisible();
    expect(await shownOn(brandMascot(page))).toBe(await drawingOf(page, 'laopo', 4));

    await signIn(page, crumb.origin, 'olive');
    expect(await shownOn(headerMascot(page))).toBe(await drawingOf(page, 'laopo', 3));
    // Exactly the addresses of 0.2: nothing about a Pastry shop page moves.
    await expect(tabIcon(page)).toHaveAttribute('href', 'favicon.svg');
    await expect(touchIcon(page)).toHaveAttribute('href', 'icons/icon-180.png');

    await watchCrumbs(page);
    await page.locator('.topbar .mascot').click();
    const cakeOutline = await outlineOf(page, 'laopo');
    await expect.poll(() => crumbColour(page)).toBe(cakeOutline);
    // The brown 0.2's crumbs always had.
    expect(cakeOutline).toBe('rgb(92, 58, 29)');
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await crumb?.close();
  }
});

test('a theme id the page does not know, or none at all, draws the wife cake and throws nothing', async ({ browser }) => {
  let crumb;
  let context;
  try {
    crumb = await themedCrumb('bakery');
    context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = pageErrors(page);
    await signIn(page, crumb.origin, 'olive');
    // The session as a newer Crumb, or a damaged answer, might send it. "constructor" is a name
    // every JavaScript object answers to: only a lookup kept to the table's own entries misses it.
    let replacement;
    await page.route('**/api/session', async route => {
      const response = await route.fetch();
      const session = await response.json();
      if (replacement === undefined) delete session.org.theme;
      else session.org.theme = replacement;
      await route.fulfill({ response, json: session });
    });
    for (const theme of [undefined, 'constructor', 'cafe']) {
      replacement = theme;
      await page.reload();
      await expect(nameMenu(page)).toBeVisible();
      expect(await shownOn(headerMascot(page)), String(theme)).toBe(await drawingOf(page, 'laopo', 3));
      await expect(tabIcon(page)).toHaveAttribute('href', 'favicon.svg');
      await expect(touchIcon(page)).toHaveAttribute('href', 'icons/icon-180.png');
    }
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await crumb?.close();
  }
});
