import { test, expect } from '@playwright/test';
import { askFor, nameMenu, openPerson, provision, signInWithLink, startCrumb } from './fixtures.mjs';

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

/* The box that cuts off part of the focused control's ring (drawn around it, outside it by
 * the outline's offset), or null when the whole ring shows. */
const ringCutBy = page => page.evaluate(() => {
  const node = document.activeElement;
  const style = getComputedStyle(node);
  if (style.outlineStyle === 'none') return null;
  const grow = parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
  const own = node.getBoundingClientRect();
  for (let box = node.parentElement; box && box !== document.body; box = box.parentElement) {
    const clip = getComputedStyle(box);
    if (clip.overflowX === 'visible' && clip.overflowY === 'visible') continue;
    const edge = box.getBoundingClientRect();
    if (own.left - grow < edge.left || own.top - grow < edge.top || own.right + grow > edge.right || own.bottom + grow > edge.bottom)
      return `${box.tagName.toLowerCase()}.${box.className}`;
  }
  return null;
});

const OWNER_PAGES = [['#/team', 'Team'], ['#/settings', 'Settings']];

/* Opens what the Team page keeps shut, since the checks skip anything hidden: the invitation
 * and benefit forms, a batch's people, and a person's actions with a sign-in link just made
 * for them. Returns that link: making it signed the person out on every other device. */
async function openTeamPage(page, name) {
  for (const summary of ['Invite someone', 'Add a benefit']) await page.locator('summary', { hasText: summary }).click();
  const log = page.locator('.team-log');
  await log.getByRole('button', { name: 'See all', exact: true }).click();
  await expect(log.locator('.batch-people > li')).toHaveCount(2);
  const panel = await openPerson(page, name);
  await panel.getByRole('button', { name: `New sign-in link for ${name}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Make a new link', exact: true }).click();
  const link = panel.getByLabel('Sign-in link', { exact: true });
  await expect(link).toBeVisible();
  return link.inputValue();
}

/* The name menu holds the language picker (and, for managers on a phone, the pages). */
async function menuFits(page, label) {
  const who = nameMenu(page);
  await who.click();
  const menu = page.locator(`#${await who.getAttribute('aria-controls')}`);
  await expect(menu.getByLabel('Language', { exact: true })).toBeVisible();
  await widthFits(page, label);
  // Hung from the name's right edge, a menu too wide runs off the left, where no scrollbar shows.
  const box = await menu.boundingBox();
  const width = await page.evaluate(() => window.innerWidth);
  expect(box.x >= 0 && box.x + box.width <= width, `${label}: the menu runs off the screen`).toBe(true);
  await everyControlIsLabelled(page, label);
  await page.keyboard.press('Escape');
  await expect(who).toHaveAttribute('aria-expanded', 'false');
}

test('every stop on the member page shows its whole focus ring', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    // With something in it, the log's header is a button the keyboard stops on.
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '10.00', mode: 'credit', reason: '' }, key());
    const page = fx.memberPage;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('button', { name: /Log · Recent/ })).toBeEnabled();
    const stops = [];
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => document.activeElement.outerHTML.slice(0, 80));
      if (stops.includes(stop)) break;
      stops.push(stop);
      expect(await ringCutBy(page), stop).toBeNull();
    }
    expect(stops.some(stop => stop.includes('quest-head')), stops.join('\n')).toBe(true);
  } finally {
    await fx.close();
  }
});

test('tabbing out of the name menu closes it and leaves the keyboard where it went', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    // On a phone the menu also holds the pages and hangs over the top of the Team page.
    const page = fx.ownerPage;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const who = nameMenu(page);
    await who.click();
    const menu = page.locator(`#${await who.getAttribute('aria-controls')}`);
    await expect(menu).toBeVisible();
    await tabUntil(page, menu.getByRole('button', { name: 'Sign out', exact: true }), 10);
    await page.keyboard.press('Tab');
    await expect(menu).toBeHidden();
    await expect(who).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#main')))).toBe(true);
  } finally {
    await fx.close();
  }
});

test('no page scrolls sideways on a phone or a laptop, and nothing trips the CSP', async ({ browser }) => {
  const memberName = 'Maximiliana Featherstonehaugh-Worthington';
  const fx = await provision(browser, { mode: 'credit', memberName });
  try {
    const long = `Thank you for ${'staying-late-again-'.repeat(12)}`;
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '123456.78', mode: fx.mode, reason: long }, key());
    // A batch too, so the Team log has a line that opens to its people.
    const owner = (await fx.api.request('GET', '/api/session')).body.user.id;
    const batch = await fx.api.request('POST', '/api/admin/grants/batch', { userIds: [owner, fx.memberId], amount: '1.00', mode: fx.mode, reason: long }, key());
    expect(batch.status).toBe(201);
    await fx.api.request('POST', '/api/admin/rewards', { name: 'A very long benefit name that keeps going', description: 'x'.repeat(200), amount: '99999.99', mode: fx.mode, active: true }, key());
    const ownerProblems = await watch(fx.ownerPage);
    const memberProblems = await watch(fx.memberPage);
    // The Team page makes the member a new sign-in link each round; the next round uses it.
    let memberLink = null;
    for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await fx.ownerPage.setViewportSize(size);
      await fx.memberPage.setViewportSize(size);
      if (memberLink) {
        // Opened as from a message, in a page of its own: the page still showing holds the
        // ended session's token, which the server would refuse.
        await fx.memberPage.goto('about:blank');
        await signInWithLink(fx.memberPage, memberLink);
      }
      // The member page both ways a team can spend: the benefit list, then the keypad.
      for (const spending of ['confirm', 'self']) {
        expect((await fx.api.request('PATCH', '/api/org', { spending })).status).toBe(200);
        await fx.memberPage.goto(`${fx.origin}/#/me`);
        await fx.memberPage.reload();
        await expect(fx.memberPage.getByTestId('available-balance')).toHaveText('$123,457.78');
        await expect(fx.memberPage.locator('.loading')).toHaveCount(0);
        await widthFits(fx.memberPage, `my crumb (${spending}) at ${size.width}`);
        await everyControlIsLabelled(fx.memberPage, `my crumb (${spending})`);
      }
      await fx.memberPage.getByRole('button', { name: 'I grabbed something', exact: true }).click();
      await expect(fx.memberPage.getByRole('dialog')).toBeVisible();
      await widthFits(fx.memberPage, `keypad at ${size.width}`);
      await everyControlIsLabelled(fx.memberPage, 'keypad');
      await fx.memberPage.keyboard.press('Escape');
      await expect(fx.memberPage.getByRole('dialog')).toHaveCount(0);
      if (size.width === 390) await menuFits(fx.memberPage, 'member name menu at 390');
      expect((await fx.api.request('PATCH', '/api/org', { spending: 'confirm' })).status).toBe(200);
      for (const [route, heading] of OWNER_PAGES) {
        await fx.ownerPage.goto(`${fx.origin}/${route}`);
        // Drawn afresh, so everything openTeamPage opens starts shut.
        await fx.ownerPage.reload();
        await expect(fx.ownerPage.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
        await expect(fx.ownerPage.locator('.loading')).toHaveCount(0);
        if (route === '#/team') memberLink = await openTeamPage(fx.ownerPage, memberName);
        // Settings is usable before "Who did what" has loaded; the list joins the page after.
        else await expect(fx.ownerPage.getByRole('heading', { name: 'Who did what' })).toBeVisible();
        await widthFits(fx.ownerPage, `${route} at ${size.width}`);
        await everyControlIsLabelled(fx.ownerPage, route);
      }
      if (size.width === 390) await menuFits(fx.ownerPage, 'owner name menu at 390');
      await fx.ownerPage.goto(`${fx.origin}/#/team`);
      await fx.ownerPage.getByRole('button', { name: 'Treat someone', exact: true }).click();
      await expect(fx.ownerPage.getByRole('dialog')).toBeVisible();
      await widthFits(fx.ownerPage, `treat dialog at ${size.width}`);
      await everyControlIsLabelled(fx.ownerPage, 'treat dialog');
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
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: fx.mode, reason: 'Keyboard test' }, key());
    const { body } = await fx.api.request('POST', `/api/admin/members/${fx.memberId}/signin-link`);
    const page = await context.newPage();
    await page.goto(body.signinUrl);
    await tabUntil(page, page.getByRole('button', { name: 'Sign in on this device', exact: true }));
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('available-balance')).toHaveText('100 points');

    const redeem = askFor(page, 'Coffee');
    await tabUntil(page, redeem);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(redeem).toBeFocused();

    await page.keyboard.press('Enter');
    await tabUntil(page, page.getByRole('button', { name: 'Yes, please', exact: true }));
    await page.keyboard.press('Enter');
    await expect(page.getByText('Awaiting confirmation', { exact: true })).toBeVisible();
    await expect(page.getByTestId('available-balance')).toHaveText('60 points');
  } finally {
    await context.close();
    await fx.close();
  }
});

test('with reduced motion nothing keeps moving', async ({ browser }) => {
  // The member's own page here is the one without the preference, for the last check.
  const fx = await provision(browser, { mode: 'points', reducedMotion: 'no-preference' });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: fx.mode, reason: 'Motion test' }, key());
    const { body } = await fx.api.request('POST', `/api/admin/members/${fx.memberId}/signin-link`);
    const page = await context.newPage();
    await signInWithLink(page, body.signinUrl);
    await askFor(page, 'Coffee').click();
    await page.getByRole('button', { name: 'Yes, please', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Asked for Coffee' })).toBeVisible();
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
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: fx.mode, reason: '<script>alert("x")</script>' }, key());
    await fx.api.request('POST', '/api/admin/rewards', { name: '<b>Bold</b> coffee', description: '<iframe src="javascript:alert(1)"></iframe>', amount: '10', mode: fx.mode, active: true }, key());

    await fx.memberPage.reload();
    // A treat's message is shown in the opened log.
    await fx.memberPage.getByRole('button', { name: /Log · Recent/ }).click();
    await expect(fx.memberPage.getByText('<script>alert("x")</script>')).toBeVisible();
    await expect(fx.memberPage.getByText('<b>Bold</b> coffee')).toBeVisible();
    await expect(fx.memberPage.getByText('<iframe src="javascript:alert(1)"></iframe>')).toBeVisible();
    expect(await fx.memberPage.locator('main img, main iframe, main script').count()).toBe(0);
    // The page's own bold is the pastry in the oven; nothing typed became one.
    expect(await fx.memberPage.locator('main b').evaluateAll(nodes => nodes.filter(node => !node.closest('.oven-caption')).length)).toBe(0);

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

test('after moving to another page, focus is on the new content', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage } = fx;
    await ownerPage.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(ownerPage.locator('#main')).toBeFocused();
    // The language picker is in the name menu. The page is rebuilt in the new language with
    // the menu closed, so the keyboard starts again at the content.
    await nameMenu(ownerPage).click();
    await ownerPage.getByLabel('Language', { exact: true }).selectOption('zh-CN');
    await expect(ownerPage.getByRole('heading', { level: 1, name: '设置', exact: true })).toBeVisible();
    await expect(ownerPage.locator('#main')).toBeFocused();
  } finally {
    await fx.close();
  }
});

/* The collection theme cards where they can still be chosen: on the setup page, and in an
 * owner's Settings before the first treat. At both sizes they fit, every control is labelled,
 * Tab reaches the chosen card and the arrow keys choose the other, and each card's focus ring
 * shows whole. */
async function themeCardsPass(page, label) {
  const cards = page.getByRole('group', { name: 'Collection theme', exact: true });
  const pastry = cards.getByRole('radio', { name: 'Pastry shop · 39 pastries', exact: true });
  const bakery = cards.getByRole('radio', { name: 'Bakery · 24 breads and cakes', exact: true });
  await expect(pastry).toBeChecked();
  await expect(bakery).toBeEnabled();
  await widthFits(page, label);
  await everyControlIsLabelled(page, label);
  await tabUntil(page, pastry);
  expect(await ringCutBy(page), `${label}: Pastry shop card`).toBeNull();
  await page.keyboard.press('ArrowDown');
  await expect(bakery).toBeChecked();
  await expect(bakery).toBeFocused();
  expect(await ringCutBy(page), `${label}: Bakery card`).toBeNull();
  await widthFits(page, `${label}, Bakery chosen`);
}

test('the collection theme cards on setup and in Settings fit a phone and a laptop and work from the keyboard', async ({ browser }) => {
  // Made inside try, so whatever was started is closed even if a later step fails.
  let crumb;
  let fx;
  let context;
  try {
    crumb = await startCrumb();
    // An owner whose team has a priced benefit but no treat yet: the cards can still be chosen.
    fx = await provision(browser, { mode: 'points' });
    context = await browser.newContext({ reducedMotion: 'reduce' });
    const setupPage = await context.newPage();
    const setupProblems = await watch(setupPage);
    const ownerProblems = await watch(fx.ownerPage);
    for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await setupPage.setViewportSize(size);
      await setupPage.goto(crumb.origin);
      await expect(setupPage.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
      await themeCardsPass(setupPage, `setup at ${size.width}`);

      await fx.ownerPage.setViewportSize(size);
      await fx.ownerPage.goto(`${fx.origin}/#/settings`);
      // Drawn afresh, so the card chosen in the last round, never saved, is gone.
      await fx.ownerPage.reload();
      await expect(fx.ownerPage.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
      await expect(fx.ownerPage.getByRole('heading', { name: 'Who did what' })).toBeVisible();
      await themeCardsPass(fx.ownerPage, `settings at ${size.width}`);
    }
    expect(await setupProblems()).toEqual([]);
    expect(await ownerProblems()).toEqual([]);
  } finally {
    await context?.close();
    await fx?.close();
    await crumb?.close();
  }
});
