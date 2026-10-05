/* Collection themes in the self-hosted app: the mascot (header, oven intro, sign-in brand),
 * the crumbs it spills and the tab and home-screen icons follow the team's theme, and an id
 * the page does not know draws Pastry shop's. The theme cards on the setup page and in
 * Settings choose it, until the first treat fixes it. The sentences that name the collection
 * follow it too. Every person and team here is invented. */
import { test, expect } from '@playwright/test';
import { PASSWORD, nameMenu, openPerson, provision, signIn, signInWithLink, signOut, startCrumb } from './fixtures.mjs';
import { client, orgInput } from '../helpers.mjs';
import { themeById } from '../../server/themes.mjs';

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

/* ---------------------------------------------------------------- the theme cards */

let keys = 0;
const key = () => ({ 'idempotency-key': `e2e-themes-request-${String(++keys).padStart(4, '0')}` });

/* Bakery's list file, as the server reads it: its 24 keys and their names. */
const BAKERY = themeById('bakery');

/* Spec §6, word for word: the card texts, the revised lock notices and the theme-change notice;
 * and the existing error.RULES_LOCKED. */
const PASTRY_CARD = 'Pastry shop · 39 pastries';
const BAKERY_CARD = 'Bakery · 24 breads and cakes';
const LOCKED = 'Rewards have been recorded, so the reward type, currency, unlock step and collection theme are fixed. Earlier amounts keep their meaning.';
const LOCKED_BY_BENEFITS = 'Benefits already have prices in this unit, so the reward type and currency are fixed. The unlock step and collection theme can change until the first reward is recorded.';
const themeChanged = count => `Theme changed. ${count} benefit icon(s) aren’t in this theme, so they were removed. You can pick new ones.`;
const RULES_LOCKED = 'These reward rules are fixed now that rewards are recorded.';

/* The unlock-step hint for each reward type: Pastry shop's unchanged sentences, Bakery's from Task 8. */
const HINT = {
  default: {
    credit: 'An amount like 50.00. Every time someone’s treats add up to another step this size, a new pastry comes out of the oven.',
    points: 'A whole number like 100. Every time someone’s treats add up to another step this size, a new pastry comes out of the oven.',
  },
  bakery: {
    credit: 'An amount like 50.00. Every time someone’s treats add up to another step this size, a new bake comes out of the oven.',
    points: 'A whole number like 100. Every time someone’s treats add up to another step this size, a new bake comes out of the oven.',
  },
};

/* A theme card is a radio named by its card text, in a group named by its legend (themeCards,
 * app/views/shared.js). */
const themeCard = (page, name) => page.getByRole('group', { name: 'Collection theme', exact: true }).getByRole('radio', { name, exact: true });
/* The hint under "Unlock a collectible every". */
const thresholdHint = page => page.locator('.field', { has: page.getByLabel('Unlock a collectible every') }).locator('.field-hint');
const savedTheme = db => db.prepare('SELECT theme FROM organization').get().theme;
const benefitIcons = db => db.prepare('SELECT name, icon_key AS iconKey FROM rewards ORDER BY name').all();

/* A member's shelf as the page shows it: each collectible's name as a screen reader hears it,
 * the Bakery key of that name (null when Bakery has no such collectible), and whether the
 * canvas holds that key's drawing. */
async function bakeryShelf(page) {
  const shelf = [];
  for (const slot of await page.getByRole('list', { name: 'Your collection' }).getByRole('button').all()) {
    const name = await slot.getAttribute('aria-label');
    const spriteKey = BAKERY.keys.find(each => BAKERY.names[each].en === name) ?? null;
    const drawn = spriteKey !== null && (await shownOn(slot.locator('canvas'))) === (await drawingOf(page, spriteKey, 3));
    shelf.push({ name, key: spriteKey, drawn });
  }
  return shelf;
}

test('set up on Bakery from the setup page: the brand and hint follow the card, and the team is Bakery’s at once', async ({ browser }) => {
  let crumb;
  let ownerContext;
  let memberContext;
  try {
    crumb = await startCrumb();
    ownerContext = await browser.newContext({ reducedMotion: 'reduce' });
    memberContext = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ownerContext.newPage();
    const errors = pageErrors(page);
    await page.goto(crumb.origin);
    await expect(page.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
    const wifeCake = await drawingOf(page, 'laopo', 4);
    const toast = await drawingOf(page, 'toastbite', 4);

    // Pastry shop until another card is chosen. The mascot at the top and the unlock-step hint
    // follow the chosen card, whichever reward type is chosen, in either order.
    await expect(themeCard(page, PASTRY_CARD)).toBeChecked();
    await expect(themeCard(page, BAKERY_CARD)).not.toBeChecked();
    expect(await shownOn(brandMascot(page))).toBe(wifeCake);
    await expect(thresholdHint(page)).toHaveText(HINT.default.credit);
    await themeCard(page, BAKERY_CARD).check();
    await expect.poll(() => shownOn(brandMascot(page))).toBe(toast);
    await expect(thresholdHint(page)).toHaveText(HINT.bakery.credit);
    await page.getByLabel('Points').check();
    await expect(thresholdHint(page)).toHaveText(HINT.bakery.points);
    await themeCard(page, PASTRY_CARD).check();
    await expect.poll(() => shownOn(brandMascot(page))).toBe(wifeCake);
    await expect(thresholdHint(page)).toHaveText(HINT.default.points);
    await themeCard(page, BAKERY_CARD).check();
    await expect(thresholdHint(page)).toHaveText(HINT.bakery.points);

    await page.getByLabel('Setup code').fill(crumb.setupToken);
    await page.getByLabel('Organization name').fill('Harbour Bakery');
    await page.getByLabel('Your name').fill('Dana Reyes');
    await page.getByLabel('Username').fill('dana');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create organization', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Treat someone', exact: true })).toBeVisible();
    expect(savedTheme(crumb.db)).toBe('bakery');

    // The page that did the setup, with no reload: Bakery's tab and home-screen icons, and
    // Bitten Toast in the header.
    await expect(tabIcon(page)).toHaveAttribute('href', 'icons/bakery/favicon.svg');
    await expect(touchIcon(page)).toHaveAttribute('href', 'icons/bakery/icon-180.png');
    expect(await shownOn(headerMascot(page))).toBe(await drawingOf(page, 'toastbite', 3));

    // A member of the new team. The owner works from a second device here: the API.
    const api = client(crumb.origin);
    await api.bootstrap();
    const login = await api.request('POST', '/api/login', { username: 'dana', password: PASSWORD });
    expect(login.status).toBe(200);
    api.csrf = login.body.csrfToken;
    const invite = await api.request('POST', '/api/admin/invitations', { username: 'mina', displayName: 'Mina Park', role: 'member' });
    expect(invite.status).toBe(201);
    const treat = amount => api.request('POST', '/api/admin/grants', { userId: invite.body.user.id, amount, mode: 'points', reason: '' }, key());
    // Treats go only to members who have joined, so Mina signs in first.
    const member = await memberContext.newPage();
    const memberErrors = pageErrors(member);
    await signInWithLink(member, invite.body.signinUrl);
    expect((await treat('100')).status).toBe(201);
    await member.reload();
    await expect(member.getByTestId('available-balance')).toHaveText('100 points');
    expect(await shownOn(headerMascot(member))).toBe(await drawingOf(member, 'toastbite', 3));

    // One step: one Bakery collectible on the shelf, named in English and drawn as itself, and
    // another one in the oven.
    const first = await bakeryShelf(member);
    expect(first).toHaveLength(1);
    expect(first[0].key, `"${first[0].name}" is not one of Bakery's`).not.toBeNull();
    expect(first[0].drawn, `${first[0].name} is not drawn as itself`).toBe(true);
    const caption = member.locator('.oven-caption');
    const nextName = await caption.locator('b').textContent();
    const nextKey = BAKERY.keys.find(each => BAKERY.names[each].en === nextName);
    expect(nextKey, `"${nextName}" is not one of Bakery's`).toBeDefined();
    expect(nextKey).not.toBe(first[0].key);
    expect(await shownOn(caption.locator('canvas'))).toBe(await drawingOf(member, nextKey, 2));

    // Every step there is: the shelf holds exactly Bakery's 24, and stops there.
    expect((await treat('2300')).status).toBe(201);
    await member.reload();
    await expect(member.getByTestId('available-balance')).toHaveText('2,400 points');
    await expect(member.getByRole('list', { name: 'Your collection' }).getByRole('button')).toHaveCount(24);
    const full = await bakeryShelf(member);
    expect(full.map(item => item.key).sort()).toEqual([...BAKERY.keys].sort());
    expect(full.filter(item => !item.drawn).map(item => item.name)).toEqual([]);
    await expect(caption).toHaveText('All 24 on the shelf. Treats still count, of course.');

    // Signed out, the sign-in page shows Bitten Toast. (The oven intro of a Bakery team, and a
    // sign-out that gets no answer, are Task 9's tests above.)
    await signOut(member, { member: true });
    expect(await shownOn(brandMascot(member))).toBe(toast);
    expect(errors).toEqual([]);
    expect(memberErrors).toEqual([]);
  } finally {
    await memberContext?.close();
    await ownerContext?.close();
    await crumb?.close();
  }
});

test('Settings before the first treat: a card changes only the hint until Save, and Save says how many benefit icons went', async ({ browser }) => {
  // A Pastry shop team with a priced benefit (Coffee, no icon) and no treat yet.
  const fx = await provision(browser, { mode: 'points' });
  try {
    // Two icons Bakery does not have (one on a benefit that is switched off, which still
    // counts) and one that both themes have.
    for (const [name, iconKey, active] of [['Egg tart Friday', 'tart', true], ['Mooncake week', 'mooncake', false], ['Bun run', 'bolo', true]]) {
      const made = await fx.api.request('POST', '/api/admin/rewards', { name, description: '', amount: '30', mode: 'points', active, iconKey }, key());
      expect(made.status, name).toBe(201);
    }
    const page = fx.ownerPage;
    const errors = pageErrors(page);
    await page.goto(`${fx.origin}/#/settings`);
    await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
    const wifeCake = await drawingOf(page, 'laopo', 3);
    const toast = await drawingOf(page, 'toastbite', 3);

    // Priced benefits fix the unit, not the theme: the revised notice says so, and both cards
    // can be chosen.
    await expect(page.getByText(LOCKED_BY_BENEFITS, { exact: true })).toBeVisible();
    await expect(themeCard(page, PASTRY_CARD)).toBeChecked();
    await expect(themeCard(page, PASTRY_CARD)).toBeEnabled();
    await expect(themeCard(page, BAKERY_CARD)).toBeEnabled();
    expect(await shownOn(headerMascot(page))).toBe(wifeCake);

    // Chosen, not saved: only the hint follows the card.
    await themeCard(page, BAKERY_CARD).check();
    await expect(thresholdHint(page)).toHaveText(HINT.bakery.points);
    expect(await shownOn(headerMascot(page))).toBe(wifeCake);
    await expect(tabIcon(page)).toHaveAttribute('href', 'favicon.svg');
    expect(savedTheme(fx.db)).toBe('default');

    // Saved: the two icons Bakery lacks go in the same write and the shared one stays. The
    // page says how many, instead of "Settings saved.".
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.locator('#toasts')).toContainText(themeChanged(2));
    await expect(page.locator('#toasts')).not.toContainText('Settings saved.');
    expect(savedTheme(fx.db)).toBe('bakery');
    const kept = [
      { name: 'Bun run', iconKey: 'bolo' },
      { name: 'Coffee', iconKey: null },
      { name: 'Egg tart Friday', iconKey: null },
      { name: 'Mooncake week', iconKey: null },
    ];
    expect(benefitIcons(fx.db)).toEqual(kept);
    // The page is drawn again in the new theme, and the tab and home-screen icons follow, all
    // without a reload.
    await expect(themeCard(page, BAKERY_CARD)).toBeChecked();
    await expect.poll(() => shownOn(headerMascot(page))).toBe(toast);
    await expect(tabIcon(page)).toHaveAttribute('href', 'icons/bakery/favicon.svg');
    await expect(touchIcon(page)).toHaveAttribute('href', 'icons/bakery/icon-180.png');

    // Back to Pastry shop: the one icon left is in both themes, so none goes and the usual
    // words show.
    await themeCard(page, PASTRY_CARD).check();
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.locator('#toasts')).toContainText('Settings saved.');
    expect(savedTheme(fx.db)).toBe('default');
    expect(benefitIcons(fx.db)).toEqual(kept);
    await expect(themeCard(page, PASTRY_CARD)).toBeChecked();
    await expect.poll(() => shownOn(headerMascot(page))).toBe(wifeCake);
    await expect(tabIcon(page)).toHaveAttribute('href', 'favicon.svg');
    await expect(touchIcon(page)).toHaveAttribute('href', 'icons/icon-180.png');
    expect(errors).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('after the first treat the theme cards are greyed out and Settings says why; a page drawn before it is refused', async ({ browser }) => {
  // A Bakery team that spends on trust: no benefits, so nothing is fixed until the first treat.
  const fx = await provision(browser, { mode: 'points', spending: 'self', theme: 'bakery' });
  try {
    const page = fx.ownerPage;
    const errors = pageErrors(page);
    await page.goto(`${fx.origin}/#/settings`);
    await expect(themeCard(page, BAKERY_CARD)).toBeChecked();
    await expect(themeCard(page, BAKERY_CARD)).toBeEnabled();
    await expect(themeCard(page, PASTRY_CARD)).toBeEnabled();
    await expect(page.getByText(LOCKED, { exact: true })).toHaveCount(0);
    await expect(page.getByText(LOCKED_BY_BENEFITS, { exact: true })).toHaveCount(0);

    // Someone sends the first treat while this page is open. The change the page still offers
    // is refused by the server, with the existing words, and nothing changes.
    const treat = await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: 'points', reason: '' }, key());
    expect(treat.status).toBe(201);
    await themeCard(page, PASTRY_CARD).check();
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: RULES_LOCKED })).toBeVisible();
    expect(savedTheme(fx.db)).toBe('bakery');

    // Drawn again: both cards greyed out on the saved theme, under the revised notice.
    await page.reload();
    await expect(page.getByText(LOCKED, { exact: true })).toBeVisible();
    await expect(themeCard(page, BAKERY_CARD)).toBeChecked();
    await expect(themeCard(page, BAKERY_CARD)).toBeDisabled();
    await expect(themeCard(page, PASTRY_CARD)).toBeDisabled();

    // In Chinese: the title of the choice, both cards and the notice (spec §6).
    await nameMenu(page).click();
    await page.getByLabel('Language', { exact: true }).selectOption('zh-CN');
    await expect(page.getByRole('heading', { level: 1, name: '设置', exact: true })).toBeVisible();
    const cards = page.getByRole('group', { name: '收藏主题', exact: true });
    await expect(cards.getByRole('radio', { name: '饼店 · 39 款点心', exact: true })).toBeDisabled();
    await expect(cards.getByRole('radio', { name: '面包店 · 24 款面包和蛋糕', exact: true })).toBeChecked();
    await expect(cards.getByRole('radio', { name: '面包店 · 24 款面包和蛋糕', exact: true })).toBeDisabled();
    await expect(page.getByText('已有奖励记录，奖励方式、币种、解锁台阶和收藏主题已经固定，过去的数额保持原意。', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await fx.close();
  }
});

/* ---------------------------------------------------------------- the Team page's sentences */

/* Spec §6's Bakery sentences on the Team page (Task 8's `grant.unlocked.bakery`,
 * `revoke.explain.bakery` and `members.roleDetail.member.bakery`), each with the unchanged
 * words the page puts around it. */
const BAKERY_TREAT_SENT = 'Mina Park just got 100 points. That’ll make their day. And 1 more came out of the oven.';
const BAKERY_TAKE_BACK = 'A reversing entry goes in; the original stays, marked as taken back. Bread and cakes already baked stay on the shelf.';
const BAKERY_MEMBER_ROLE = 'Sees their own treats and bakes, and spends.';

test('a Bakery team’s Team page uses the Bakery’s sentences: the treat toast, the Take back dialog and the Member role line', async ({ browser }) => {
  // A Bakery team, unlock every 100 points; Mina has joined and has no treat yet.
  const fx = await provision(browser, { mode: 'points', theme: 'bakery' });
  try {
    const page = fx.ownerPage;
    const errors = pageErrors(page);
    const dialog = page.getByRole('dialog');

    // A treat that fills one step: one bake comes out of the oven, and the toast says so.
    await page.getByRole('button', { name: 'Treat someone', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Mina Park' }).check();
    await page.getByLabel('How much each').fill('100');
    await page.getByRole('button', { name: 'Send it', exact: true }).click();
    await expect(page.locator('#toasts')).toContainText(BAKERY_TREAT_SENT);

    // The page is drawn again with the treat in its log. Its Take back dialog ends with the
    // Bakery's sentence. Nothing is taken back.
    await page.getByRole('button', { name: 'Take back', exact: true }).click();
    await expect(dialog.getByText(BAKERY_TAKE_BACK, { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Changing Mina's role: the Member line is the Bakery's. Nothing is changed.
    await openPerson(page, 'Mina Park');
    await page.getByRole('button', { name: 'Change role for Mina Park', exact: true }).click();
    await expect(dialog.getByText(BAKERY_MEMBER_ROLE, { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await fx.close();
  }
});
