/* No light flash for a café team (spec §5 and §13 "No light flash"), by the colour the page is
 * painted in, not only the attribute (tests/e2e/theme-colours.spec.mjs checks that the theme id
 * is on the page and on the device at the right moments). A device that has opened the café
 * before paints it dark from its first frame, before the session answers, the "Loading Crumb…"
 * line light on it; a new device turns dark when the session answers and stays dark from then on;
 * the sign-in page stays dark after signing out, also when "who is here now" gets no answer;
 * saving Café in Settings darkens the page without a reload and saving Pastry shop lightens it; a
 * device that remembers Café opens a server with no team on a light setup page. The static copy
 * and blocked storage are tested in static-host.spec.mjs and product.spec.mjs. Every person and
 * team here is invented. */
import { test, expect } from '@playwright/test';
import { contrast, parseColour } from '../contrast.mjs';
import { nameMenu, provision, signOut, startCrumb } from './fixtures.mjs';

const TEAM = 'Northside Coffee Co.';
/* The page's ground as the browser writes it: Café's --bg (#160f0a), Pastry shop's (#f2e7ce). */
const DARK = 'rgb(22, 15, 10)';
const LIGHT = 'rgb(242, 231, 206)';

/* The colour the page's ground is painted in now: the body's background, which the browser
 * paints across the whole page. */
const groundOf = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/* The "Loading Crumb…" line's colour while the page waits for the session; null once it is gone. */
const loadingInk = page => page.evaluate(() => {
  const line = document.querySelector('#app > p.boot:not([role])');
  return line ? getComputedStyle(line).color : null;
});

/* From the next load on, notes the ground of the first frame the page paints: a frame callback
 * asked for before any of the page's own scripts runs is called before that frame is painted. */
const noteFirstFrame = page => page.addInitScript(() => {
  requestAnimationFrame(() => {
    window.crumbFirstFrame = document.body ? getComputedStyle(document.body).backgroundColor : 'no body yet';
  });
});
const firstFrame = page => page.evaluate(() => window.crumbFirstFrame ?? null);

/* Holds the next /api/session request back for two seconds. `asked` resolves as it comes in: the
 * page has run early-theme.js by then and still shows its "Loading Crumb…" line. */
async function holdNextSession(page) {
  let arrived;
  const asked = new Promise(resolve => { arrived = resolve; });
  await page.route('**/api/session', async route => {
    arrived();
    await new Promise(resolve => { setTimeout(resolve, 2000); });
    await route.continue();
  }, { times: 1 });
  return { asked };
}

/* Whether the page waiting for the session is the café's, dark from its first frame, with its
 * "Loading Crumb…" line light on it (4.5:1 at least). */
async function expectDarkWhileLoading(page) {
  await expect.poll(() => firstFrame(page)).toBe(DARK);
  expect(await groundOf(page)).toBe(DARK);
  const ink = await loadingInk(page);
  expect(ink, 'the Loading Crumb… line is still showing').not.toBeNull();
  expect(contrast(parseColour(ink), parseColour(DARK))).toBeGreaterThanOrEqual(4.5);
}

/* A mark on the loaded page: still there afterwards means nothing was loaded again. */
const markPage = page => page.evaluate(() => { window.crumbNotReloaded = true; });
const notReloaded = page => page.evaluate(() => window.crumbNotReloaded === true);

const themeCard = (page, name) => page.getByRole('group', { name: 'Collection theme', exact: true }).getByRole('radio', { name, exact: true });

test('a café team’s page opened again is dark from its first frame, before the session answers', async ({ browser }) => {
  const fx = await provision(browser, { theme: 'cafe' });
  try {
    const page = fx.ownerPage;
    await noteFirstFrame(page);
    const held = await holdNextSession(page);
    await page.reload();
    await held.asked;
    await expectDarkWhileLoading(page);
    await expect(nameMenu(page)).toBeVisible();
    expect(await groundOf(page)).toBe(DARK);
  } finally {
    await fx.close();
  }
});

test('a new device shows the café light until the session answers, then dark, and dark from the first frame on its next visit', async ({ browser }) => {
  const fx = await provision(browser, { theme: 'cafe' });
  const device = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = await device.newPage();
    await noteFirstFrame(page);
    const first = await holdNextSession(page);
    await page.goto(fx.origin);
    await first.asked;
    // Nothing remembered here yet: the "Loading Crumb…" moment is light (assumption 16).
    await expect.poll(() => firstFrame(page)).toBe(LIGHT);
    expect(await groundOf(page)).toBe(LIGHT);
    await expect(page.getByRole('heading', { name: `Sign in to ${TEAM}` })).toBeVisible();
    await expect.poll(() => groundOf(page)).toBe(DARK);

    const second = await holdNextSession(page);
    await page.reload();
    await second.asked;
    await expectDarkWhileLoading(page);
    await expect(page.getByRole('heading', { name: `Sign in to ${TEAM}` })).toBeVisible();
    expect(await groundOf(page)).toBe(DARK);
  } finally {
    await device.close();
    await fx.close();
  }
});

test('the café sign-in page stays dark after signing out, also when who is here now gets no answer', async ({ browser }) => {
  const fx = await provision(browser, { theme: 'cafe' });
  try {
    const { ownerPage, memberPage } = fx;
    await signOut(ownerPage);
    await expect(ownerPage.getByRole('heading', { name: `Sign in to ${TEAM}` })).toBeVisible();
    expect(await groundOf(ownerPage)).toBe(DARK);

    // From the moment the member's sign-out goes out, asking who is here now gets no answer.
    let leaving = false;
    await memberPage.route('**/api/logout', route => {
      leaving = true;
      return route.continue();
    });
    await memberPage.route('**/api/session', route => (leaving ? route.abort('connectionreset') : route.continue()));
    await signOut(memberPage, { member: true });
    await expect(nameMenu(memberPage)).toHaveCount(0);
    expect(await groundOf(memberPage)).toBe(DARK);
  } finally {
    await fx.close();
  }
});

test('saving Café in Settings darkens the page without a reload, and saving Pastry shop lightens it again', async ({ browser }) => {
  // A Pastry shop team with no treat yet: the theme can still change.
  const fx = await provision(browser);
  try {
    const page = fx.ownerPage;
    const save = page.getByRole('button', { name: 'Save settings', exact: true });
    await page.goto(`${fx.origin}/#/settings`);
    await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
    expect(await groundOf(page)).toBe(LIGHT);
    await markPage(page);
    await themeCard(page, 'Café · 24 coffees and sweets').check();
    // Chosen, not saved: the page stays light.
    expect(await groundOf(page)).toBe(LIGHT);
    await save.click();
    await expect.poll(() => groundOf(page)).toBe(DARK);
    // The save darkens the page before the refresh after it has drawn the form again. The next
    // card is chosen on the new form, whose Save button is not greyed out like the one just
    // pressed: one chosen on the old form would go with it, and Café would be saved again.
    await expect(save).toBeEnabled();
    await expect(themeCard(page, 'Café · 24 coffees and sweets')).toBeChecked();
    await themeCard(page, 'Pastry shop · 39 pastries').check();
    await save.click();
    await expect.poll(() => groundOf(page)).toBe(LIGHT);
    // Drawn again by its refresh, and never loaded again.
    await expect(save).toBeEnabled();
    expect(await notReloaded(page), 'the page was not loaded again').toBe(true);
  } finally {
    await fx.close();
  }
});

test('a device that remembers Café opens a server with no team dark for a moment, then on a light setup page', async ({ browser }) => {
  const crumb = await startCrumb();
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.goto(crumb.origin);
    await expect(page.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
    // This device last saw a café team at this address, on a server since reset (assumption 17).
    await page.evaluate(() => window.localStorage.setItem('crumb.theme', 'cafe'));
    const held = await holdNextSession(page);
    await page.reload();
    await held.asked;
    expect(await groundOf(page)).toBe(DARK);
    await expect(page.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
    await expect.poll(() => groundOf(page)).toBe(LIGHT);
  } finally {
    await context.close();
    await crumb.close();
  }
});
