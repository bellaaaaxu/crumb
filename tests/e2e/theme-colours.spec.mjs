/* How a team's collection theme reaches the page: the theme id on <html data-theme>, the same id
 * remembered on this device (crumb.theme) so that app/early-theme.js puts it there before the
 * first paint, the browser bar's colour for a theme with colours of its own, and the canvases
 * drawn in the page's colour variables. What each theme's colours are is tested elsewhere; this
 * file tests that the right theme is on the page at the right moments. Every person and team
 * here is invented. */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { nameMenu, provision, signIn, signOut, startCrumb } from './fixtures.mjs';
import { stops } from '../contrast.mjs';
import { parseCss, substitute, topLevel, variablesOf } from '../css.mjs';

const TEAM = 'Northside Coffee Co.';
const PASTRY_CARD = 'Pastry shop · 39 pastries';
const CAFE_CARD = 'Café · 24 coffees and sweets';
/* THEMES.cafe.background, as applyTheme writes it into the browser bar's tag. */
const CAFE_BAR = '#160F0A';

function pageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

/* What the page shows of its theme right now: the id on <html>, the id this device remembers,
 * the content of every browser-bar colour tag (there is one at most), and whether the page is
 * still on its "Loading Crumb…" line, waiting for the session. */
const onPage = page => page.evaluate(() => {
  let remembered;
  try {
    remembered = window.localStorage.getItem('crumb.theme');
  } catch {
    remembered = 'storage blocked';
  }
  return {
    attribute: document.documentElement.getAttribute('data-theme'),
    remembered,
    bar: [...document.head.querySelectorAll('meta[name="theme-color"]')].map(tag => tag.getAttribute('content')),
    loading: document.querySelector('#app > p.boot:not([role])') !== null,
  };
});

/* Puts a theme id in this device's memory, as an earlier visit would have. */
const remember = (page, id) => page.evaluate(value => window.localStorage.setItem('crumb.theme', value), id);

/* Holds the next /api/session request back for two seconds. `asked` resolves as it comes in: on
 * a load, by then the page has run early-theme.js and still shows its "Loading Crumb…" line; after
 * a save in Settings, the save has done everything it does before its refresh. */
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

/* Moves to another page of the app the way its own links do, without loading it again. */
const goTo = (page, section) => page.evaluate(hash => { window.location.hash = hash; }, `#/${section}`);
/* A mark on the loaded page: still there afterwards means nothing was loaded again. */
const markPage = page => page.evaluate(() => { window.crumbNotReloaded = true; });
const notReloaded = page => page.evaluate(() => window.crumbNotReloaded === true);

/* A theme card is a radio named by its card text, in a group named by its legend. */
const themeCard = (page, name) => page.getByRole('group', { name: 'Collection theme', exact: true }).getByRole('radio', { name, exact: true });
const tabIcon = page => page.locator('link[rel="icon"]');
const touchIcon = page => page.locator('link[rel="apple-touch-icon"]');

const MISSING = Symbol('missing');

test('the theme each session names goes on <html> and is remembered on the device as spec §4.1 says, and only Café colours the browser bar', async ({ browser }) => {
  // A Bakery team. The owner's page shows the Team page, which reads neither the session nor
  // /api/me itself, so only the session main.js accepts decides what is on the page.
  const fx = await provision(browser, { theme: 'bakery' });
  try {
    const page = fx.ownerPage;
    const errors = pageErrors(page);
    let replacement = MISSING;
    await page.route('**/api/session', async route => {
      const response = await route.fetch();
      const session = await response.json();
      if (replacement === MISSING) delete session.org.theme;
      else session.org.theme = replacement;
      await route.fulfill({ response, json: session });
    });
    const rows = [
      // Missing, not a string, or not shaped like a theme id: taken off the page and forgotten.
      [MISSING, null], [null, null], [42, null], [true, null], [['cafe'], null], [{ id: 'cafe' }, null],
      ['', null], ['c', null], ['Cafe', null], ['café', null], ['1cafe', null], ['cafe-dark', null],
      [' cafe', null], ['__proto__', null], ['a'.repeat(33), null],
      // Well-formed, as it is, whether or not this page knows it: the three themes, a name every
      // JavaScript object answers to, a theme from a newer Crumb, the shortest and the longest.
      ['default', 'default'], ['bakery', 'bakery'], ['cafe', 'cafe'], ['constructor', 'constructor'],
      ['nosuchtheme', 'nosuchtheme'], ['z9', 'z9'], ['a'.repeat(32), 'a'.repeat(32)],
    ];
    for (const [theme, expected] of rows) {
      // Something else is remembered first, so each row shows what it writes or removes.
      await remember(page, 'stale');
      replacement = theme;
      await page.reload();
      await expect(nameMenu(page)).toBeVisible();
      const row = theme === MISSING ? 'missing' : JSON.stringify(theme);
      await expect.poll(() => onPage(page), row).toEqual({
        attribute: expected, remembered: expected, bar: expected === 'cafe' ? [CAFE_BAR] : [], loading: false,
      });
    }
    expect(errors).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('with no team set up, a theme this device remembers shows until the session answers, then is taken off and forgotten', async ({ browser }) => {
  let crumb;
  let context;
  try {
    crumb = await startCrumb();
    context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = pageErrors(page);
    await page.goto(crumb.origin);
    await expect(page.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
    // This device last saw a café team at this address, on a server since reset (assumption 17).
    await remember(page, 'cafe');
    const held = await holdNextSession(page);
    await page.reload();
    await held.asked;
    expect(await onPage(page)).toEqual({ attribute: 'cafe', remembered: 'cafe', bar: [], loading: true });
    // No team: the setup page is light, and the device remembers nothing.
    await expect(page.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
    await expect.poll(() => onPage(page)).toEqual({ attribute: null, remembered: null, bar: [], loading: false });
    // A remembered value not shaped like a theme id (a capital letter) never goes on the page,
    // not even before the session answers; the session's answer then forgets it like any other.
    await remember(page, 'Cafe');
    const odd = await holdNextSession(page);
    await page.reload();
    await odd.asked;
    expect(await onPage(page)).toEqual({ attribute: null, remembered: 'Cafe', bar: [], loading: true });
    await expect(page.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
    await expect.poll(() => onPage(page)).toEqual({ attribute: null, remembered: null, bar: [], loading: false });
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await crumb?.close();
  }
});

test('a café team’s page opened again is in its theme before the session answers; a new device takes it when the session answers, and remembers it', async ({ browser }) => {
  const fx = await provision(browser, { theme: 'cafe' });
  let device;
  try {
    // The owner's device remembered the theme when the owner signed in.
    const page = fx.ownerPage;
    const errors = pageErrors(page);
    const again = await holdNextSession(page);
    await page.reload();
    await again.asked;
    // early-theme.js put it on the page; it leaves the browser bar to the session (assumption 40).
    expect(await onPage(page)).toEqual({ attribute: 'cafe', remembered: 'cafe', bar: [], loading: true });
    await expect(nameMenu(page)).toBeVisible();
    await expect.poll(() => onPage(page)).toEqual({ attribute: 'cafe', remembered: 'cafe', bar: [CAFE_BAR], loading: false });

    // A device that has never opened Crumb: nothing until the session answers (assumption 16).
    device = await browser.newContext({ reducedMotion: 'reduce' });
    const fresh = await device.newPage();
    const freshErrors = pageErrors(fresh);
    const first = await holdNextSession(fresh);
    await fresh.goto(fx.origin);
    await first.asked;
    expect(await onPage(fresh)).toEqual({ attribute: null, remembered: null, bar: [], loading: true });
    await expect(fresh.getByRole('heading', { name: `Sign in to ${TEAM}` })).toBeVisible();
    await expect.poll(() => onPage(fresh)).toEqual({ attribute: 'cafe', remembered: 'cafe', bar: [CAFE_BAR], loading: false });
    // From its next visit on, before the session.
    const second = await holdNextSession(fresh);
    await fresh.reload();
    await second.asked;
    expect(await onPage(fresh)).toEqual({ attribute: 'cafe', remembered: 'cafe', bar: [], loading: true });
    await expect(fresh.getByRole('heading', { name: `Sign in to ${TEAM}` })).toBeVisible();
    expect(errors).toEqual([]);
    expect(freshErrors).toEqual([]);
  } finally {
    await device?.close();
    await fx.close();
  }
});

test('the browser reads the page no further than early-theme.js until it has run, so the remembered theme is on <html> before the stylesheet and the body exist', async ({ browser }) => {
  // The test above sees the theme while the session is held back, which a deferred or async
  // early-theme.js would also pass: main.js asks for the session only after such a script has
  // run. Only a script that stops the parser (in <head>, before the stylesheet, no defer or
  // async) puts the theme on before anything below it is read, and so before the first paint.
  const fx = await provision(browser, { theme: 'cafe' });
  try {
    const page = fx.ownerPage;
    const errors = pageErrors(page);
    let release;
    const released = new Promise(resolve => { release = resolve; });
    let arrived;
    const asked = new Promise(resolve => { arrived = resolve; });
    await page.route('**/early-theme.js', async route => {
      arrived();
      await released;
      await route.continue();
    }, { times: 1 });
    /* How far the browser has read index.html: the tag right before the script, the script
     * itself, the stylesheet's tag after it, the body; and the theme on <html>. */
    const readSoFar = () => page.evaluate(() => ({
      touchIcon: document.querySelector('link[rel="apple-touch-icon"]') !== null,
      script: document.querySelector('script[src="early-theme.js"]') !== null,
      stylesheet: document.querySelector('link[rel="stylesheet"]') !== null,
      body: document.body !== null,
      attribute: document.documentElement.getAttribute('data-theme'),
    }));
    const stopped = { touchIcon: true, script: true, stylesheet: false, body: false, attribute: null };
    await page.reload({ waitUntil: 'commit' });
    await asked;
    // Read up to the script and no further while it is held back...
    await expect.poll(readSoFar).toEqual(stopped);
    // ...and still no further a moment later: stopped there, not merely slow.
    await page.waitForTimeout(500);
    expect(await readSoFar()).toEqual(stopped);
    release();
    await expect(nameMenu(page)).toBeVisible();
    await expect.poll(() => onPage(page)).toEqual({ attribute: 'cafe', remembered: 'cafe', bar: [CAFE_BAR], loading: false });
    expect(errors).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('signing out keeps a café team’s theme on the page and on the device, also when who is here now gets no answer', async ({ browser }) => {
  const fx = await provision(browser, { theme: 'cafe' });
  try {
    const { ownerPage, memberPage } = fx;
    const ownerErrors = pageErrors(ownerPage);
    const memberErrors = pageErrors(memberPage);
    // The owner signs out, and the server says who is here now: no one, on a café team.
    await signOut(ownerPage);
    await expect(ownerPage.getByRole('heading', { name: `Sign in to ${TEAM}` })).toBeVisible();
    await expect.poll(() => onPage(ownerPage)).toEqual({ attribute: 'cafe', remembered: 'cafe', bar: [CAFE_BAR], loading: false });

    // The member signs out, and from the moment the sign-out goes out, asking who is here now
    // gets no answer: the sign-in page is drawn from what the page already knew about the team.
    let leaving = false;
    await memberPage.route('**/api/logout', route => {
      leaving = true;
      return route.continue();
    });
    await memberPage.route('**/api/session', route => (leaving ? route.abort('connectionreset') : route.continue()));
    await signOut(memberPage, { member: true });
    await expect(nameMenu(memberPage)).toHaveCount(0);
    await expect.poll(() => onPage(memberPage)).toEqual({ attribute: 'cafe', remembered: 'cafe', bar: [CAFE_BAR], loading: false });
    expect(ownerErrors).toEqual([]);
    expect(memberErrors).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('saving Café in Settings puts it on the page, the device and the browser bar without a reload; saving Pastry shop again puts Pastry shop’s on, with no bar colour and its icons by icons/default/', async ({ browser }) => {
  // A Pastry shop team with a benefit (it has no icon) and no treat yet: the theme can change.
  const fx = await provision(browser);
  try {
    const page = fx.ownerPage;
    const errors = pageErrors(page);
    const save = page.getByRole('button', { name: 'Save settings', exact: true });
    await expect.poll(() => onPage(page)).toEqual({ attribute: 'default', remembered: 'default', bar: [], loading: false });
    await goTo(page, 'settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
    await markPage(page);

    await themeCard(page, CAFE_CARD).check();
    // Chosen, not saved: nothing changes yet.
    expect(await onPage(page)).toEqual({ attribute: 'default', remembered: 'default', bar: [], loading: false });
    // The session the page asks for once the save is through is held back: the save itself has
    // put the theme on, so the page changes even if that refresh fails.
    const refresh = await holdNextSession(page);
    await save.click();
    await refresh.asked;
    await expect(page.locator('#toasts')).toContainText('Settings saved.');
    expect(await onPage(page)).toEqual({ attribute: 'cafe', remembered: 'cafe', bar: [CAFE_BAR], loading: false });
    await expect(tabIcon(page)).toHaveAttribute('href', 'icons/cafe/favicon.svg');
    await expect(touchIcon(page)).toHaveAttribute('href', 'icons/cafe/icon-180.png');
    // Then the refresh draws the page again: a new form, whose Save button is not greyed out like
    // the one just pressed. The next card is chosen on it; one chosen on the old form would be
    // thrown away with that form, and Café saved again.
    await expect(save).toBeEnabled();
    expect(await onPage(page)).toEqual({ attribute: 'cafe', remembered: 'cafe', bar: [CAFE_BAR], loading: false });

    await themeCard(page, PASTRY_CARD).check();
    await save.click();
    // Pastry shop's id is well-formed like any other: on the page and remembered as it is. The
    // browser bar's tag is gone, so the bar is the browser's own colour again.
    await expect.poll(() => onPage(page)).toEqual({ attribute: 'default', remembered: 'default', bar: [], loading: false });
    await expect(tabIcon(page)).toHaveAttribute('href', 'icons/default/favicon.svg');
    await expect(touchIcon(page)).toHaveAttribute('href', 'icons/default/icon-180.png');
    // Drawn again by its refresh, still Pastry shop's, and never loaded again.
    await expect(save).toBeEnabled();
    expect(await onPage(page)).toEqual({ attribute: 'default', remembered: 'default', bar: [], loading: false });
    expect(await notReloaded(page), 'the page was not loaded again').toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('after the team switches to Café on another device, the Settings page and the member page put it on the page and the device when they are drawn', async ({ browser }) => {
  // A Pastry shop team whose owner is signed in on two devices, both on the Team page.
  const fx = await provision(browser);
  let other;
  try {
    const first = fx.ownerPage;
    other = await browser.newContext({ reducedMotion: 'reduce' });
    const second = await other.newPage();
    const errors = [pageErrors(first), pageErrors(second)];
    await signIn(second, fx.origin, 'olive');
    for (const page of [first, second]) {
      await expect(page.getByRole('button', { name: 'Treat someone', exact: true })).toBeVisible();
      await markPage(page);
    }
    // Switched on a third device (the API). Not in a second tab of this browser: that tab would
    // write crumb.theme itself, and the device's record would prove nothing about these pages.
    expect((await fx.api.request('PATCH', '/api/org', { theme: 'cafe' })).status).toBe(200);
    for (const page of [first, second])
      expect(await onPage(page)).toEqual({ attribute: 'default', remembered: 'default', bar: [], loading: false });

    // Settings asks for the session itself.
    await goTo(first, 'settings');
    await expect(first.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
    await expect.poll(() => onPage(first)).toEqual({ attribute: 'cafe', remembered: 'cafe', bar: [CAFE_BAR], loading: false });
    // The member page reads the theme in /api/me.
    await goTo(second, 'me');
    await expect(second.getByTestId('available-balance')).toBeVisible();
    await expect.poll(() => onPage(second)).toEqual({ attribute: 'cafe', remembered: 'cafe', bar: [CAFE_BAR], loading: false });
    for (const page of [first, second]) expect(await notReloaded(page), 'the page was not loaded again').toBe(true);
    expect(errors).toEqual([[], []]);
  } finally {
    await other?.close();
    await fx.close();
  }
});

/* ---------------------------------------------------------------- canvases */

/* The colour 0.3 drew the balance and CRUMB in: Pastry shop's --digit and --wordmark. */
const BROWN = 'rgb(74, 47, 27)';
/* A colour no theme uses, to see a canvas follow its variable. */
const PROBE = '#123456';
const PROBE_RGB = 'rgb(18, 52, 86)';

/* The colours of a canvas's fully drawn pixels, written the way the browser writes a colour. */
const inkOf = locator => locator.evaluate(canvas => {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const colours = new Set();
  for (let at = 0; at < data.length; at += 4) {
    if (data[at + 3] === 255) colours.add(`rgb(${data[at]}, ${data[at + 1]}, ${data[at + 2]})`);
  }
  return [...colours];
});

/* Gives a colour variable another value on the page root, through the CSSOM, as a script may
 * under the Content Security Policy. */
const setVariable = (page, name, value) => page.evaluate(([variable, colour]) => {
  document.documentElement.style.setProperty(variable, colour);
}, [name, value]);

test('the balance digits and the CRUMB wordmark are drawn in the page’s --digit and --wordmark, read when they are drawn', async ({ browser }) => {
  const fx = await provision(browser);
  let context;
  try {
    const page = fx.ownerPage;
    const errors = pageErrors(page);
    const balance = page.locator('.big-number canvas');
    await goTo(page, 'me');
    await expect(page.getByTestId('available-balance')).toBeVisible();
    await expect.poll(() => inkOf(balance)).toEqual([BROWN]);
    // Another value on the page root: the next drawing is in it.
    await setVariable(page, '--digit', PROBE);
    await goTo(page, 'team');
    await expect(page.getByRole('button', { name: 'Treat someone', exact: true })).toBeVisible();
    await goTo(page, 'me');
    await expect.poll(() => inkOf(balance)).toEqual([PROBE_RGB]);

    // The sign-in page, drawn again in the other language once the variable has another value.
    context = await browser.newContext({ reducedMotion: 'reduce' });
    const signedOut = await context.newPage();
    const signedOutErrors = pageErrors(signedOut);
    await signedOut.goto(fx.origin);
    await expect(signedOut.getByRole('heading', { name: `Sign in to ${TEAM}` })).toBeVisible();
    const wordmark = signedOut.locator('.auth-brand canvas').last();
    await expect.poll(() => inkOf(wordmark)).toEqual([BROWN]);
    await setVariable(signedOut, '--wordmark', PROBE);
    await signedOut.getByLabel('Language', { exact: true }).selectOption('zh-CN');
    await expect.poll(() => inkOf(wordmark)).toEqual([PROBE_RGB]);
    expect(errors).toEqual([]);
    expect(signedOutErrors).toEqual([]);
  } finally {
    await context?.close();
    await fx.close();
  }
});

/* ---------------------------------------------------------------- forced colours */

test('under forced colours, light or dark, a café team’s balance and CRUMB are drawn in the system’s text colour, and a Pastry shop team’s stay brown', async ({ browser }) => {
  const teams = [];
  const contexts = [];
  try {
    teams.push(await provision(browser, { theme: 'cafe' }), await provision(browser));
    for (const [fx, cafe] of [[teams[0], true], [teams[1], false]]) {
      for (const colorScheme of ['light', 'dark']) {
        const which = `${cafe ? 'café' : 'Pastry shop'}, ${colorScheme}`;
        const context = await browser.newContext({ forcedColors: 'active', colorScheme, reducedMotion: 'reduce' });
        contexts.push(context);
        const page = await context.newPage();
        const errors = pageErrors(page);
        await signIn(page, fx.origin, 'olive');
        expect(await page.evaluate(() => window.matchMedia('(forced-colors: active)').matches), which).toBe(true);
        // The colour forced colours give the page's text, the system's text colour: black on white
        // in the light palette, white on black in the dark one.
        const systemText = await page.evaluate(() => getComputedStyle(document.body).color);
        expect(systemText, which).not.toBe(BROWN);
        const drawn = cafe ? systemText : BROWN;
        await goTo(page, 'me');
        await expect(page.getByTestId('available-balance')).toBeVisible();
        await expect.poll(() => inkOf(page.locator('.big-number canvas')), `${which}: the balance`).toEqual([drawn]);
        await signOut(page);
        await expect.poll(() => inkOf(page.locator('.auth-brand canvas').last()), `${which}: CRUMB`).toEqual([drawn]);
        expect(errors, which).toEqual([]);
      }
    }
  } finally {
    for (const context of contexts) await context.close();
    for (const fx of teams) await fx.close();
  }
});

/* ---------------------------------------------------------------- theme cards */

const BAKERY_CARD = 'Bakery · 24 breads and cakes';

/* A colour set of app/app.css with every value worked out: the light set (Pastry shop's and
 * Bakery's) or a theme's own, whose variables stand in for the light ones. */
function colourSet(selector) {
  const rules = parseCss(readFileSync(new URL('../../app/app.css', import.meta.url), 'utf8'));
  const variables = new Map([...variablesOf(topLevel(rules, ':root, [data-theme]')), ...variablesOf(topLevel(rules, selector))]);
  return name => substitute(variables.get(name), variables);
}
const LIGHT = colourSet(':root, [data-theme]');
const CAFE = colourSet('[data-theme="cafe"]');

/* The colours a value shows, as the browser writes them: a plain colour, or each stop of a
 * gradient; none and fully transparent ones left out. */
const colours = value => stops(value).filter(({ a }) => a > 0)
  .map(({ r, g, b, a }) => (a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`));

/* The page behind the cards: <html>'s data-theme, and the colours of body's ground and text. */
const pageLook = page => page.evaluate(() => {
  const body = getComputedStyle(document.body);
  return { theme: document.documentElement.getAttribute('data-theme'), ground: body.backgroundColor, ink: body.color };
}).then(look => ({ theme: look.theme, ground: colours(look.ground), ink: colours(look.ink) }));
const pageOf = (set, theme) => ({ theme, ground: colours(set('--bg')), ink: colours(set('--ink')) });

/* The theme each card carries, in page order. */
const cardThemes = page => page.locator('.theme-card').evaluateAll(cards => cards.map(card => card.getAttribute('data-theme')));

/* What the card of a theme shows: the colours of its ground (each stop of a gradient), its text
 * and its border; its color-scheme; its own opacity and that of what is on it (the radio and
 * the label); and the ground, ring and padding of its first picture. */
async function cardLook(page, id) {
  const look = await page.locator(`.theme-card[data-theme="${id}"]`).evaluate(card => {
    const style = getComputedStyle(card);
    const picture = getComputedStyle(card.querySelector('.theme-card-pics canvas'));
    return {
      ground: [style.backgroundColor, style.backgroundImage],
      ink: style.color,
      border: style.borderTopColor,
      scheme: style.colorScheme,
      opacity: [style.opacity, ...[...card.children].map(child => getComputedStyle(child).opacity)],
      picture: [picture.backgroundImage, picture.boxShadow, picture.paddingTop],
    };
  });
  return {
    ground: look.ground.flatMap(colours),
    ink: colours(look.ink),
    border: colours(look.border),
    scheme: look.scheme,
    opacity: look.opacity,
    picture: { ground: colours(look.picture[0]), ring: colours(look.picture[1]), padding: look.picture[2] },
  };
}

/* What a card should show, from its own theme's colour set: chosen, it is on --chosen inside
 * --frame; otherwise on --tile inside --line. */
const cardOf = (set, scheme, { chosen = false, opacity = ['1', '1', '1'] } = {}) => ({
  ground: colours(set(chosen ? '--chosen' : '--tile')),
  ink: colours(set('--ink')),
  border: colours(set(chosen ? '--frame' : '--line')),
  scheme,
  opacity,
  picture: { ground: colours(set('--pic-bg')), ring: colours(set('--pic-ring')), padding: `${Number.parseFloat(set('--pic-pad'))}px` },
});

/* A first treat, which fixes the team's theme from then on. */
const firstTreat = fx => fx.api.request('POST', '/api/admin/grants',
  { userId: fx.memberId, amount: '100', mode: 'points', reason: '' }, { 'idempotency-key': 'e2e-theme-cards-first-treat' });

test('on the setup page each card shows its own theme’s colours: the café card dark, the other two light, and choosing Café leaves the page light', async ({ browser }) => {
  let crumb;
  let context;
  try {
    crumb = await startCrumb();
    context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = pageErrors(page);
    await page.goto(crumb.origin);
    await expect(page.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
    expect(await cardThemes(page)).toEqual(['default', 'bakery', 'cafe']);
    expect(await pageLook(page)).toEqual(pageOf(LIGHT, null));
    expect(await cardLook(page, 'default')).toEqual(cardOf(LIGHT, 'light', { chosen: true }));
    expect(await cardLook(page, 'bakery')).toEqual(cardOf(LIGHT, 'light'));
    expect(await cardLook(page, 'cafe')).toEqual(cardOf(CAFE, 'dark'));

    // Chosen, the café card is on its own chosen ground (read once the 0.01 ms transition that
    // reduced motion leaves has run); the page stays light, and nothing is put on <html> or
    // remembered: there is no team yet.
    await themeCard(page, CAFE_CARD).check();
    await expect.poll(() => cardLook(page, 'cafe')).toEqual(cardOf(CAFE, 'dark', { chosen: true }));
    await expect.poll(() => cardLook(page, 'default')).toEqual(cardOf(LIGHT, 'light'));
    expect(await pageLook(page)).toEqual(pageOf(LIGHT, null));
    expect(await onPage(page)).toEqual({ attribute: null, remembered: null, bar: [], loading: false });
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    await crumb?.close();
  }
});

test('on a café team’s Settings page the Pastry shop and Bakery cards stay light, selectable and locked; a locked card keeps its ground and only what is on it fades', async ({ browser }) => {
  const fx = await provision(browser, { theme: 'cafe' });
  try {
    const page = fx.ownerPage;
    const errors = pageErrors(page);
    await goTo(page, 'settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
    await expect.poll(() => pageLook(page)).toEqual(pageOf(CAFE, 'cafe'));
    expect(await cardThemes(page)).toEqual(['default', 'bakery', 'cafe']);
    for (const name of [PASTRY_CARD, BAKERY_CARD, CAFE_CARD]) await expect(themeCard(page, name)).toBeEnabled();
    expect(await cardLook(page, 'default')).toEqual(cardOf(LIGHT, 'light'));
    expect(await cardLook(page, 'bakery')).toEqual(cardOf(LIGHT, 'light'));
    expect(await cardLook(page, 'cafe')).toEqual(cardOf(CAFE, 'dark', { chosen: true }));

    // After the first treat every card is locked. On this dark page a card keeps its own ground,
    // and only the radio and the label fade.
    expect((await firstTreat(fx)).status).toBe(201);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
    for (const name of [PASTRY_CARD, BAKERY_CARD, CAFE_CARD]) await expect(themeCard(page, name)).toBeDisabled();
    const contentsFade = ['1', '0.65', '0.65'];
    expect(await cardLook(page, 'default')).toEqual(cardOf(LIGHT, 'light', { opacity: contentsFade }));
    expect(await cardLook(page, 'bakery')).toEqual(cardOf(LIGHT, 'light', { opacity: contentsFade }));
    expect(await cardLook(page, 'cafe')).toEqual(cardOf(CAFE, 'dark', { chosen: true, opacity: contentsFade }));
    expect(await pageLook(page)).toEqual(pageOf(CAFE, 'cafe'));
    expect(errors).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('on a Pastry shop team’s locked Settings page every card fades whole, as in 0.3, and the café card stays dark', async ({ browser }) => {
  const fx = await provision(browser);
  try {
    const page = fx.ownerPage;
    const errors = pageErrors(page);
    expect((await firstTreat(fx)).status).toBe(201);
    await goTo(page, 'settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
    expect(await cardThemes(page)).toEqual(['default', 'bakery', 'cafe']);
    for (const name of [PASTRY_CARD, BAKERY_CARD, CAFE_CARD]) await expect(themeCard(page, name)).toBeDisabled();
    expect(await pageLook(page)).toEqual(pageOf(LIGHT, 'default'));
    const wholeFades = ['0.65', '1', '1'];
    expect(await cardLook(page, 'default')).toEqual(cardOf(LIGHT, 'light', { chosen: true, opacity: wholeFades }));
    expect(await cardLook(page, 'bakery')).toEqual(cardOf(LIGHT, 'light', { opacity: wholeFades }));
    expect(await cardLook(page, 'cafe')).toEqual(cardOf(CAFE, 'dark', { opacity: wholeFades }));
    expect(errors).toEqual([]);
  } finally {
    await fx.close();
  }
});
