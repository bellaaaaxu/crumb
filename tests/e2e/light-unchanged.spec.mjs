/* Pastry shop and Bakery do not change by one pixel: every scene below, in both themes, has
 * the computed colours 0.3.0 had, element for element, at rest and in every forced state
 * (tests/e2e/style-recorder.mjs says what is recorded and how elements are keyed). The
 * baseline, tests/fixtures/light-styles-0.3.0.json, was recorded by this file running in a
 * checkout of 0.3.0 (5247e73):
 *
 *   CRUMB_RECORD_LIGHT_STYLES=<absolute path of the file> npx playwright test tests/e2e/light-unchanged.spec.mjs --workers=1
 *
 * which writes the file instead of comparing with it. Never record it from a later version: it
 * is what the later versions are held to. Every person and team here is invented. */
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { PASSWORD, askFor, keyIn, nameMenu, openPerson, provision, startCrumb } from './fixtures.mjs';
import { client, orgInput } from '../helpers.mjs';
import { baselineText, differences, packScenes, recordStyles, unpackScenes } from './style-recorder.mjs';

const RECORDING = process.env.CRUMB_RECORD_LIGHT_STYLES;
const BASELINE = fileURLToPath(new URL('../fixtures/light-styles-0.3.0.json', import.meta.url));
const THEMES = ['default', 'bakery'];
const MASCOTS = { default: 'laopo', bakery: 'toastbite' };
const TEAM = 'Northside Coffee Co.';
const PHONE = { width: 390, height: 844 };
const DEMO = pathToFileURL(resolve('index.html')).href;
/* The demo dates its invented history from today: a fixed day keeps the log's months the same. */
const DEMO_DAY = new Date('2026-10-09T12:00:00');

let keys = 0;
const key = () => ({ 'idempotency-key': `e2e-light-styles-${String(++keys).padStart(4, '0')}` });

/* Read when a comparison first needs it, never on loading this file: in the 0.3.0 checkout that
 * records it, it does not exist yet. */
let baseline = null;
function baselineScene(label) {
  baseline ??= unpackScenes(JSON.parse(readFileSync(BASELINE, 'utf8')));
  const scene = baseline[label];
  if (!scene) throw new Error(`${label}: not in ${BASELINE}`);
  return scene;
}

/* Recording: each scene adds itself to the file. One worker, so no two write it at once. */
function keep(record) {
  expect(test.info().config.workers, 'record with --workers=1: every scene adds itself to one file').toBe(1);
  const scenes = existsSync(RECORDING) ? unpackScenes(JSON.parse(readFileSync(RECORDING, 'utf8'))) : {};
  scenes[record.label] = record;
  writeFileSync(RECORDING, baselineText(packScenes(scenes)));
}

/* ---------------------------------------------------------------- making the scenes */

/* Each write a second after the one before, from a minute ago, so rows the server sorts by time
 * always come in the same order. Set back to the real clock before the page is used. */
function stepClock(crumb) {
  let at = Date.now() - 60_000;
  return () => { crumb.time.now = (at += 1000); };
}

const grant = (fx, userId, amount, mode, reason = '') =>
  fx.api.request('POST', '/api/admin/grants', { userId, amount, mode, reason }, key()).then(answer => answer.body);

/* A change made as the person signed in on `page`, through that page's own session. */
const asSignedIn = (page, method, path, body) => page.evaluate(async ({ method, path, body, headers }) => {
  const session = await (await fetch('/api/session', { cache: 'no-store' })).json();
  const answer = await fetch(path, {
    method,
    headers: { ...headers, 'content-type': 'application/json', 'x-csrf-token': session.csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: answer.status, body: await answer.json() };
}, { method, path, body, headers: key() });

/* The page forgets what it last showed this person, so loading it greets no treat: that toast
 * would leave after seven seconds, in the middle of a recording. */
const forgetSeen = page => page.evaluate(() => {
  for (const name of Object.keys(window.localStorage)) if (name.startsWith('crumb.seen.')) window.localStorage.removeItem(name);
});

/* Stops the page's clock (installed before it loaded), so a toast or a name tip stays. */
async function holdStill(page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 1000);
}

/* A small logo, made here. */
const logo = () => sharp({ create: { width: 40, height: 40, channels: 3, background: '#2f6f8f' } }).png().toBuffer();

/* A team set up through the API with no browser signed in: for the signed-out pages. */
async function signedOutTeam(theme) {
  const crumb = await startCrumb();
  const api = client(crumb.origin);
  await api.bootstrap();
  const setup = await api.request('POST', '/api/setup', {
    setupToken: crumb.setupToken, username: 'olive', password: PASSWORD, displayName: 'Olive Chen',
    org: orgInput('points', { name: TEAM, theme }),
  });
  if (setup.status !== 201) {
    await crumb.close();
    throw new Error(`setup failed: ${JSON.stringify(setup.body)}`);
  }
  api.csrf = setup.body.csrfToken;
  return { crumb, api };
}

/* Opens the demo from disk, as GitHub Pages serves it, in `shop`. */
async function openDemo(browser, shop, { motion = 'reduce', viewport, pausedFromStart = false } = {}) {
  const context = await browser.newContext({ reducedMotion: motion, ...(viewport ? { viewport } : {}) });
  await context.addInitScript(id => {
    try { window.localStorage.setItem('crumb_demo_theme', id); } catch { /* about:blank has no storage */ }
  }, shop);
  const page = await context.newPage();
  await page.clock.install({ time: DEMO_DAY });
  // With motion, the intro and the tour start as the page loads: a clock stopped first holds them there.
  if (pausedFromStart) await page.clock.pauseAt(DEMO_DAY.getTime() + 1000);
  await page.goto(DEMO);
  await expect(page.locator(`[data-shop="${shop}"]`)).toHaveAttribute('aria-pressed', 'true');
  return { context, page };
}

const demoKeys = async (page, digits) => {
  for (const digit of digits) await page.locator('.sheet .key', { hasText: new RegExp(`^${digit}$`) }).click();
};

/* A member's page with treats, so the shelf has something on it; the member has never looked. */
async function memberWithCredit(browser, theme, { viewport } = {}) {
  const fx = await provision(browser, { mode: 'credit', spending: 'self', theme });
  await grant(fx, fx.memberId, '62.50', 'credit', 'Closed up on your own on Sunday');
  const page = fx.memberPage;
  if (viewport) await page.setViewportSize(viewport);
  await forgetSeen(page);
  await page.reload();
  await expect(page.getByTestId('available-balance')).toHaveText('$62.50');
  return { fx, page };
}

async function keypad(browser, theme, label, digits, viewport) {
  const { fx, page } = await memberWithCredit(browser, theme, { viewport });
  try {
    await page.getByRole('button', { name: 'I grabbed something', exact: true }).click();
    await expect(page.getByRole('group', { name: 'Amount keypad' })).toBeVisible();
    if (digits) await keyIn(page, digits);
    return await recordStyles(page, label);
  } finally {
    await fx.close();
  }
}

/* ---------------------------------------------------------------- the scenes
 * Each runs once for Pastry shop and once for Bakery (`theme`; on the setup page, the card
 * chosen; in the demo, the shop shown) and returns its record. A team member who has never
 * dismissed it sees the home-screen tip, so both member pages show it. */

const SCENES = [
  {
    name: 'member page, benefits, requests in every state, two toasts, the name menu',
    async run(browser, theme, label) {
      const fx = await provision(browser, { mode: 'points', spending: 'confirm', theme });
      try {
        const page = fx.memberPage;
        const tick = stepClock(fx);
        tick(); await grant(fx, fx.memberId, '250', 'points', 'Thanks for the Sunday shift');
        tick(); await fx.api.request('POST', '/api/admin/rewards',
          { name: 'Lunch out', description: 'Anywhere on the block', amount: '300', mode: 'points', active: true, iconKey: MASCOTS[theme] }, key());
        const ask = async () => {
          tick();
          return (await asSignedIn(page, 'POST', '/api/redemptions', { rewardId: fx.coffeeId, expectedCostUnits: 40 })).body.redemption.id;
        };
        const completed = await ask();
        tick(); await fx.api.request('POST', `/api/admin/redemptions/${completed}/complete`, undefined, key());
        const declined = await ask();
        tick(); await fx.api.request('POST', `/api/admin/redemptions/${declined}/reject`, { reason: 'The machine is broken this week' }, key());
        const withdrawn = await ask();
        tick(); await asSignedIn(page, 'POST', `/api/redemptions/${withdrawn}/cancel`);
        await ask();
        fx.time.now = null;

        await page.clock.install();
        await forgetSeen(page);
        await page.reload();
        await expect(page.locator('.home-tip')).toBeVisible();
        await holdStill(page);
        // A toast: a coffee asked for.
        await askFor(page, 'Coffee').click();
        await page.getByRole('dialog').getByRole('button', { name: 'Yes, please', exact: true }).click();
        await expect(page.locator('#toasts .toast-info')).toHaveCount(1);
        // Drawn again with the new request, from the prices as they were.
        await expect(page.locator('.badge-pending')).toHaveCount(2);
        // An error toast: the price changed after the page was drawn.
        await fx.api.request('PATCH', `/api/admin/rewards/${fx.coffeeId}`,
          { name: 'Coffee', description: 'Any drink from the counter', amount: '45', mode: 'points', active: true });
        await askFor(page, 'Coffee').click();
        await page.getByRole('dialog').getByRole('button', { name: 'Yes, please', exact: true }).click();
        await expect(page.locator('#toasts .toast-error')).toHaveCount(1);
        await expect(page.locator('.benefit .price').first()).toHaveText('45 points');
        await nameMenu(page).click();
        await expect(page.locator('.topbar .menu')).toBeVisible();
        return await recordStyles(page, label);
      } finally {
        await fx.close();
      }
    },
  },
  {
    name: 'member page, jotting down, the whole log',
    async run(browser, theme, label) {
      const fx = await provision(browser, { mode: 'credit', spending: 'self', theme });
      try {
        const page = fx.memberPage;
        const tick = stepClock(fx);
        tick(); await grant(fx, fx.memberId, '62.50', 'credit', 'Closed up on your own on Sunday');
        tick(); const mistaken = await grant(fx, fx.memberId, '10.00', 'credit');
        tick(); await fx.api.request('POST', `/api/admin/grants/${mistaken.entry.id}/revoke`, { reason: 'Meant for another teammate' }, key());
        tick(); const twice = await asSignedIn(page, 'POST', '/api/me/spend', { amount: '12.50', mode: 'credit' });
        tick(); await asSignedIn(page, 'POST', '/api/me/spend', { amount: '4.25', mode: 'credit' });
        tick(); await fx.api.request('POST', `/api/admin/spends/${twice.body.entry.id}/void`, { reason: 'Keyed in twice' }, key());
        fx.time.now = null;
        await forgetSeen(page);
        await page.reload();
        await expect(page.getByTestId('available-balance')).toHaveText('$58.25');
        await page.getByRole('button', { name: /Log · Recent/ }).click();
        await expect(page.locator('.quest-month')).toHaveCount(1);
        return await recordStyles(page, label);
      } finally {
        await fx.close();
      }
    },
  },
  {
    name: 'member page, the whole collection on the shelf',
    async run(browser, theme, label) {
      const fx = await provision(browser, { mode: 'points', spending: 'confirm', theme });
      try {
        // One item per 100 points (the fixtures' threshold): more than either shelf holds.
        await grant(fx, fx.memberId, '10000', 'points', 'For every Sunday this year');
        const page = fx.memberPage;
        await forgetSeen(page);
        await page.reload();
        await expect(page.locator('.oven-caption.complete')).toBeVisible();
        return await recordStyles(page, label);
      } finally {
        await fx.close();
      }
    },
  },
  {
    name: 'keypad, nothing keyed in',
    run: (browser, theme, label) => keypad(browser, theme, label, ''),
  },
  {
    name: 'keypad, an amount keyed in',
    run: (browser, theme, label) => keypad(browser, theme, label, '1250'),
  },
  {
    name: 'keypad, more than the balance',
    run: (browser, theme, label) => keypad(browser, theme, label, '999999'),
  },
  {
    name: 'keypad on a phone, an amount keyed in',
    run: (browser, theme, label) => keypad(browser, theme, label, '1250', PHONE),
  },
  {
    name: 'Team page, a person, a link, a benefit form, a batch, the treat dialog with a mistake',
    // The page with the most controls, each put through four states: about 40 seconds on a
    // laptop, which leaves too little room under the 60-second limit on a slower machine.
    timeout: 120_000,
    async run(browser, theme, label) {
      const fx = await provision(browser, { mode: 'points', spending: 'confirm', theme });
      try {
        const page = fx.ownerPage;
        const owner = (await fx.api.request('GET', '/api/session')).body.user.id;
        const tick = stepClock(fx);
        tick(); const sam = await fx.api.request('POST', '/api/admin/invitations', { username: 'sam', displayName: 'Sam Lee', role: 'member' });
        tick(); await fx.api.request('PATCH', `/api/admin/members/${sam.body.user.id}`, { active: false });
        tick(); await fx.api.request('POST', '/api/admin/invitations', { username: 'ada', displayName: 'Ada Lee', role: 'admin' });
        tick(); await fx.api.request('POST', '/api/admin/rewards',
          { name: 'Lunch out', description: 'Anywhere on the block', amount: '300', mode: 'points', active: false, iconKey: MASCOTS[theme] }, key());
        tick(); await grant(fx, fx.memberId, '250', 'points', 'Thanks for the Sunday shift');
        tick(); await fx.api.request('POST', '/api/admin/grants/batch', { userIds: [owner, fx.memberId], amount: '20', mode: 'points', reason: 'Team lunch' }, key());
        tick(); const mistaken = await grant(fx, fx.memberId, '30', 'points');
        tick(); await fx.api.request('POST', `/api/admin/grants/${mistaken.entry.id}/revoke`, { reason: 'Meant for another teammate' }, key());
        const ask = async () => {
          tick();
          return (await asSignedIn(fx.memberPage, 'POST', '/api/redemptions', { rewardId: fx.coffeeId, expectedCostUnits: 40 })).body.redemption.id;
        };
        const completed = await ask();
        tick(); await fx.api.request('POST', `/api/admin/redemptions/${completed}/complete`, undefined, key());
        const refunded = await ask();
        tick(); await fx.api.request('POST', `/api/admin/redemptions/${refunded}/complete`, undefined, key());
        tick(); await fx.api.request('POST', `/api/admin/redemptions/${refunded}/refund`, { reason: 'Confirmed the wrong request' }, key());
        await ask();
        fx.time.now = null;

        await page.reload();
        await expect(page.locator('.team-log .log-batch')).toHaveCount(1);
        await page.locator('summary', { hasText: 'Add a benefit' }).click();
        await page.locator('.icon-picker label').nth(1).click();
        await openPerson(page, 'Mina Park');
        await page.getByRole('button', { name: 'New sign-in link for Mina Park', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Make a new link', exact: true }).click();
        await expect(page.getByLabel('Sign-in link', { exact: true })).toBeVisible();
        await page.locator('.log-batch').getByRole('button', { name: 'See all', exact: true }).click();
        await expect(page.locator('.batch-people .batch-name')).toHaveCount(2);
        await page.getByRole('button', { name: 'Treat someone', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Mina Park', { exact: true }).check();
        await dialog.getByLabel('How much each').fill('2.5');
        await dialog.getByRole('button', { name: 'Send it', exact: true }).click();
        await expect(dialog.getByLabel('How much each')).toHaveAttribute('aria-invalid', 'true');
        return await recordStyles(page, label);
      } finally {
        await fx.close();
      }
    },
  },
  {
    name: 'Team page on a phone, the name menu open',
    async run(browser, theme, label) {
      const fx = await provision(browser, { mode: 'points', spending: 'confirm', theme });
      try {
        const page = fx.ownerPage;
        await page.setViewportSize(PHONE);
        await page.reload();
        await expect(page.getByRole('button', { name: 'Treat someone', exact: true })).toBeVisible();
        await nameMenu(page).click();
        await expect(page.locator('.topbar .menu .menu-nav')).toBeVisible();
        return await recordStyles(page, label);
      } finally {
        await fx.close();
      }
    },
  },
  {
    name: 'Settings, nothing fixed yet, two mistakes',
    async run(browser, theme, label) {
      const fx = await provision(browser, { mode: 'credit', spending: 'self', theme });
      try {
        const page = fx.ownerPage;
        await page.goto(`${fx.origin}/#/settings`);
        await expect(page.getByRole('heading', { name: 'Who did what' })).toBeVisible();
        await expect(page.locator('input[name="theme"]:disabled')).toHaveCount(0);
        await page.getByLabel('Organization name').fill('');
        await page.getByLabel('Feedback link for Crumb').fill('not a link');
        await page.getByRole('button', { name: 'Save settings', exact: true }).click();
        await expect(page.getByLabel('Organization name')).toHaveAttribute('aria-invalid', 'true');
        await expect(page.getByLabel('Feedback link for Crumb')).toHaveAttribute('aria-invalid', 'true');
        return await recordStyles(page, label);
      } finally {
        await fx.close();
      }
    },
  },
  {
    name: 'Settings, fixed after the first treat, with a logo',
    async run(browser, theme, label) {
      const fx = await provision(browser, { mode: 'credit', spending: 'confirm', theme });
      try {
        const page = fx.ownerPage;
        await grant(fx, fx.memberId, '12.50', 'credit', 'For the Sunday shift');
        const upload = await fx.api.request('PUT', '/api/org/logo', await logo(), { 'content-type': 'image/png' });
        expect(upload.status).toBe(204);
        // Loaded afresh, so the header knows about the logo.
        await page.goto(`${fx.origin}/#/settings`);
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Who did what' })).toBeVisible();
        await expect(page.locator('input[name="theme"]:not(:disabled)')).toHaveCount(0);
        await expect(page.locator('.logo-preview')).toBeVisible();
        await expect(page.locator('.topbar .brand-logo')).toBeVisible();
        return await recordStyles(page, label);
      } finally {
        await fx.close();
      }
    },
  },
  {
    name: 'sign-in page, with a logo and a mistake',
    async run(browser, theme, label) {
      const { crumb, api } = await signedOutTeam(theme);
      const context = await browser.newContext({ reducedMotion: 'reduce' });
      try {
        const upload = await api.request('PUT', '/api/org/logo', await logo(), { 'content-type': 'image/png' });
        expect(upload.status).toBe(204);
        const page = await context.newPage();
        await page.goto(crumb.origin);
        await expect(page.getByRole('heading', { name: `Sign in to ${TEAM}` })).toBeVisible();
        await expect(page.locator('.auth-logo')).toBeVisible();
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        await expect(page.locator('.form-error')).toBeVisible();
        return await recordStyles(page, label);
      } finally {
        await context.close();
        await crumb.close();
      }
    },
  },
  {
    name: 'sign-in link page, opened where someone else is signed in',
    async run(browser, theme, label) {
      const fx = await provision(browser, { mode: 'points', spending: 'confirm', theme });
      try {
        const page = fx.ownerPage;
        const link = await fx.api.request('POST', `/api/admin/members/${fx.memberId}/signin-link`);
        await page.goto('about:blank');
        await page.goto(link.body.signinUrl);
        await expect(page.getByRole('button', { name: 'Sign in on this device', exact: true })).toBeVisible();
        await expect(page.locator('.auth-card .notice')).toHaveCount(1);
        return await recordStyles(page, label);
      } finally {
        await fx.close();
      }
    },
  },
  {
    name: 'setup page, a theme card chosen, mistakes',
    async run(browser, theme, label) {
      const crumb = await startCrumb();
      const context = await browser.newContext({ reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        await page.goto(crumb.origin);
        await expect(page.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
        await page.locator(`input[name="theme"][value="${theme}"]`).check();
        await page.getByRole('button', { name: 'Create organization', exact: true }).click();
        await expect(page.getByLabel('Setup code')).toHaveAttribute('aria-invalid', 'true');
        return await recordStyles(page, label);
      } finally {
        await context.close();
        await crumb.close();
      }
    },
  },
  {
    // With motion: under reduced motion there is no intro.
    name: 'oven intro',
    async run(browser, theme, label) {
      const fx = await provision(browser, { mode: 'points', spending: 'confirm', theme, reducedMotion: 'no-preference' });
      try {
        const page = fx.memberPage;
        await page.clock.install();
        await page.clock.pauseAt(Date.now() + 1000);
        await page.reload();
        await expect(page.locator('.oven')).toBeVisible();
        return await recordStyles(page, label, { within: '.oven' });
      } finally {
        await fx.close();
      }
    },
  },
  {
    // With less motion the tour does not run, so nothing carries the two marks it leaves:
    // press() puts .pressed on the person it is about to switch to, and setDots() puts .on on
    // the dot of the scene it is at. They are put on here as the tour puts them, the first on a
    // person not chosen yet.
    name: 'demo, a person and a scene dot marked as the tour marks them',
    async run(browser, shop, label) {
      const { context, page } = await openDemo(browser, shop);
      try {
        await page.locator('.person[aria-pressed="false"]').first().evaluate(node => node.classList.add('pressed'));
        await page.locator('#scene-dots > i').first().evaluate(node => node.classList.add('on'));
        return await recordStyles(page, label);
      } finally {
        await context.close();
      }
    },
  },
  {
    name: 'demo on a phone',
    async run(browser, shop, label) {
      const { context, page } = await openDemo(browser, shop, { viewport: PHONE });
      try {
        return await recordStyles(page, label);
      } finally {
        await context.close();
      }
    },
  },
  {
    name: 'demo keypad, an amount keyed in',
    async run(browser, shop, label) {
      const { context, page } = await openDemo(browser, shop);
      try {
        await page.locator('#spend').click();
        await demoKeys(page, '1250');
        await expect(page.locator('#sheet-ok')).toBeEnabled();
        return await recordStyles(page, label);
      } finally {
        await context.close();
      }
    },
  },
  {
    name: 'demo keypad, more than the balance',
    async run(browser, shop, label) {
      const { context, page } = await openDemo(browser, shop);
      try {
        await page.locator('#spend').click();
        await demoKeys(page, '99999');
        await expect(page.locator('#amt')).toHaveClass(/over/);
        return await recordStyles(page, label);
      } finally {
        await context.close();
      }
    },
  },
  {
    name: 'demo after a treat, the whole log, a name tip, a toast',
    async run(browser, shop, label) {
      const { context, page } = await openDemo(browser, shop);
      try {
        await holdStill(page);
        await page.locator('[data-grant="50"]').click();
        await expect(page.locator('#phone .toast')).toHaveCount(1);
        await page.locator('#quest-toggle').click();
        await expect(page.locator('#quest-list .quest-month')).toHaveCount(3);
        // Dispatched, not clicked: a click leaves the mouse on the slot, recordStyles first moves
        // it away, and the slot's mouseleave would close the tip before anything is read.
        await page.locator('#slots .slot.filled').first().dispatchEvent('click');
        await expect(page.locator('.pastry-name')).toHaveCount(1);
        return await recordStyles(page, label);
      } finally {
        await context.close();
      }
    },
  },
  {
    name: 'demo, Robin with nothing yet, an error toast',
    async run(browser, shop, label) {
      const { context, page } = await openDemo(browser, shop);
      try {
        await holdStill(page);
        await page.locator('.person').first().click();
        await expect(page.locator('#holder-id')).toHaveText('#204');
        await page.locator('#spend').click();
        await expect(page.locator('#phone .toast.error')).toHaveCount(1);
        return await recordStyles(page, label);
      } finally {
        await context.close();
      }
    },
  },
  {
    // With motion: under reduced motion there is no intro.
    name: 'demo oven intro',
    async run(browser, shop, label) {
      const { context, page } = await openDemo(browser, shop, { motion: 'no-preference', pausedFromStart: true });
      try {
        await expect(page.locator('#phone .oven')).toBeVisible();
        return await recordStyles(page, label, { within: '#phone .oven' });
      } finally {
        await context.close();
      }
    },
  },
  {
    // With motion: under reduced motion the shop changes at once, with no shutter. From the
    // shop named to the other one; 320 ms in, the shutter is down and the sign starts to turn.
    name: 'demo shutter',
    async run(browser, shop, label) {
      const { context, page } = await openDemo(browser, shop, { motion: 'no-preference', pausedFromStart: true });
      try {
        await page.locator(`[data-shop="${shop === 'default' ? 'bakery' : 'default'}"]`).click();
        await page.clock.runFor(320);
        await expect(page.locator('#phone .shutter')).toHaveCount(1);
        return await recordStyles(page, label, { within: '#phone .shutter' });
      } finally {
        await context.close();
      }
    },
  },
];

/* ---------------------------------------------------------------- the tests */

test('this Chromium applies :hover, :active, :focus-visible and :disabled forced through the DevTools protocol', async ({ page }) => {
  await page.setContent(`<style>
    button { color: rgb(1, 1, 1); }
    button:hover { color: rgb(2, 2, 2); }
    button:active { color: rgb(3, 3, 3); }
    button:focus-visible { color: rgb(4, 4, 4); }
    button:disabled { color: rgb(5, 5, 5); }
  </style><button type="button">Probe</button>`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'button' });
  const colour = () => page.locator('button').evaluate(node => getComputedStyle(node).color);
  for (const [state, expected] of [['hover', 'rgb(2, 2, 2)'], ['active', 'rgb(3, 3, 3)'], ['focus-visible', 'rgb(4, 4, 4)'], ['disabled', 'rgb(5, 5, 5)']]) {
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [state] });
    expect(await colour(), state).toBe(expected);
    await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    expect(await colour(), `${state} cleared`).toBe('rgb(1, 1, 1)');
  }
});

for (const scene of SCENES) {
  for (const theme of THEMES) {
    const label = `${theme}: ${scene.name}`;
    test(label, async ({ browser }) => {
      if (scene.timeout) test.setTimeout(scene.timeout);
      const record = await scene.run(browser, theme, label);
      if (RECORDING) {
        keep(record);
        return;
      }
      const changed = differences(baselineScene(label), record);
      expect(changed, `${label}: computed colours differ from 0.3.0's`).toEqual([]);
    });
  }
}
