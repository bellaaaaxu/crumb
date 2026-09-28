import { test, expect } from '@playwright/test';
import { PASSWORD, provision, startCrumb } from './fixtures.mjs';

let keys = 0;
const key = () => ({ 'idempotency-key': `e2e-a11y-request-${String(++keys).padStart(4, '0')}` });

/* Records CSP violations and console errors from the moment the page starts. */
async function watch(page) {
  const problems = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => {
      window.__cspViolations = [...(window.__cspViolations ?? []), `${event.violatedDirective} ${event.blockedURI}`];
    });
  });
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  page.on('pageerror', error => problems.push(error.message));
  return async () => {
    const csp = await page.evaluate(() => window.__cspViolations ?? []);
    return [...problems, ...csp];
  };
}

async function widthFits(page, label) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scroll, `${label}: page is ${scroll}px wide in a ${width}px window`).toBeLessThanOrEqual(width);
}

async function everyControlIsLabelled(page, label) {
  const unlabelled = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea, button')]
    .filter(node => node.type !== 'hidden' && node.offsetParent !== null)
    .filter(node => !(node.labels && node.labels.length) && !node.getAttribute('aria-label') && !node.textContent.trim())
    .map(node => node.outerHTML.slice(0, 100)));
  expect(unlabelled, label).toEqual([]);
}

async function tabUntil(page, locator, limit = 80) {
  for (let step = 0; step < limit; step += 1) {
    if (await locator.evaluate(node => node === document.activeElement).catch(() => false)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('The control was never reached with the Tab key');
}

const OWNER_PAGES = [
  ['#/team', 'Team'], ['#/team/members', 'Members'], ['#/team/benefits', 'Benefits'],
  ['#/team/redemptions', 'Redemptions'], ['#/team/history', 'History'], ['#/team/activity', 'Activity'], ['#/settings', 'Settings'],
];

test('no page scrolls sideways on a phone or a laptop, and nothing trips the CSP', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', memberName: 'Maximiliana Featherstonehaugh-Worthington' });
  try {
    const long = `Thank you for ${'staying-late-again-'.repeat(12)}`;
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '123456.78', reason: long }, key());
    await fx.api.request('POST', '/api/admin/rewards', { name: 'A very long benefit name that keeps going', description: 'x'.repeat(200), amount: '99999.99', active: true });
    const ownerProblems = await watch(fx.ownerPage);
    const memberProblems = await watch(fx.memberPage);
    for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await fx.ownerPage.setViewportSize(size);
      await fx.memberPage.setViewportSize(size);
      await fx.memberPage.goto(`${fx.origin}/#/me`);
      await fx.memberPage.reload();
      await expect(fx.memberPage.getByTestId('available-balance')).toHaveText('$123,456.78');
      await widthFits(fx.memberPage, `my crumb at ${size.width}`);
      await everyControlIsLabelled(fx.memberPage, 'my crumb');
      for (const [route, heading] of OWNER_PAGES) {
        await fx.ownerPage.goto(`${fx.origin}/${route}`);
        await expect(fx.ownerPage.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
        await expect(fx.ownerPage.locator('.loading')).toHaveCount(0);
        await widthFits(fx.ownerPage, `${route} at ${size.width}`);
        await everyControlIsLabelled(fx.ownerPage, route);
      }
      await fx.ownerPage.goto(`${fx.origin}/#/team`);
      await fx.ownerPage.getByRole('button', { name: 'Give recognition', exact: true }).click();
      await expect(fx.ownerPage.getByRole('dialog')).toBeVisible();
      await widthFits(fx.ownerPage, `recognition dialog at ${size.width}`);
      await everyControlIsLabelled(fx.ownerPage, 'recognition dialog');
      await fx.ownerPage.keyboard.press('Escape');
      await expect(fx.ownerPage.getByRole('dialog')).toHaveCount(0);
    }
    expect(await ownerProblems()).toEqual([]);
    expect(await memberProblems()).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('signed-out pages fit a phone too', async ({ browser }) => {
  const crumb = await startCrumb();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    const problems = await watch(page);
    await page.goto(crumb.origin);
    await expect(page.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
    await widthFits(page, 'setup');
    await everyControlIsLabelled(page, 'setup');
    expect(await problems()).toEqual([]);
  } finally {
    await context.close();
    await crumb.close();
  }
});

test('signing in and requesting a benefit work from the keyboard alone', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  const context = await browser.newContext();
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', reason: 'Keyboard test' }, key());
    const page = await context.newPage();
    await page.goto(fx.origin);
    await tabUntil(page, page.getByLabel('Username'));
    await page.keyboard.type('mina');
    await page.keyboard.press('Tab');
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('available-balance')).toHaveText('100 points');

    const redeem = page.getByRole('button', { name: 'Redeem Coffee', exact: true });
    await tabUntil(page, redeem);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(redeem).toBeFocused();

    await page.keyboard.press('Enter');
    await tabUntil(page, page.getByRole('button', { name: 'Confirm request', exact: true }));
    await page.keyboard.press('Enter');
    await expect(page.getByText('Awaiting confirmation', { exact: true })).toBeVisible();
    await expect(page.getByTestId('available-balance')).toHaveText('60 points');
  } finally {
    await context.close();
    await fx.close();
  }
});

test('with reduced motion nothing keeps moving', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', reason: 'Motion test' }, key());
    const page = await context.newPage();
    await page.goto(fx.origin);
    await page.getByLabel('Username').fill('mina');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Redeem Coffee', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm request', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Requested Coffee' })).toBeVisible();
    const moving = await page.evaluate(() => document.getAnimations()
      .filter(animation => animation.playState === 'running')
      .map(animation => animation.effect.getComputedTiming())
      .filter(timing => timing.iterations === Infinity || timing.duration > 50).length);
    expect(moving).toBe(0);
    // Even without the preference, nothing in the app animates forever.
    const forever = await fx.memberPage.evaluate(() => document.getAnimations()
      .filter(animation => animation.effect.getComputedTiming().iterations === Infinity).length);
    expect(forever).toBe(0);
  } finally {
    await context.close();
    await fx.close();
  }
});

test('names and messages that look like HTML are shown as text and never run', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', memberName: '<img src=x onerror=alert(1)>' });
  try {
    let alerts = 0;
    for (const page of [fx.ownerPage, fx.memberPage]) page.on('dialog', dialog => { alerts += 1; dialog.dismiss(); });
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', reason: '<script>alert("x")</script>' }, key());
    await fx.api.request('POST', '/api/admin/rewards', { name: '<b>Bold</b> coffee', description: '<iframe src="javascript:alert(1)"></iframe>', amount: '10', active: true });

    await fx.memberPage.reload();
    await expect(fx.memberPage.getByText('<script>alert("x")</script>')).toBeVisible();
    await expect(fx.memberPage.getByText('<b>Bold</b> coffee')).toBeVisible();
    await expect(fx.memberPage.getByText('<iframe src="javascript:alert(1)"></iframe>')).toBeVisible();
    expect(await fx.memberPage.locator('main img, main b, main iframe, main script').count()).toBe(0);

    await fx.ownerPage.goto(`${fx.origin}/#/team/members`);
    await expect(fx.ownerPage.getByText('<img src=x onerror=alert(1)>', { exact: true })).toBeVisible();
    await fx.ownerPage.goto(`${fx.origin}/#/team/history`);
    await expect(fx.ownerPage.getByText('<script>alert("x")</script>')).toBeVisible();
    expect(await fx.ownerPage.locator('main img, main script').count()).toBe(0);
    expect(alerts).toBe(0);
  } finally {
    await fx.close();
  }
});
