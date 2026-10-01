/* The one-page member view, self-recorded spending, batch treats, the header menu and the
 * animations. Every person and team here is invented. */
import { test, expect } from '@playwright/test';
import { PASSWORD, askFor, keyIn, nameMenu, provision, signIn, signInWithLink, signOut, startCrumb } from './fixtures.mjs';
import { client, joinTeam, orgInput, tokenFrom } from '../helpers.mjs';

let keys = 0;
const key = () => ({ 'idempotency-key': `e2e-one-page-${String(++keys).padStart(4, '0')}` });
const DAY = 24 * 60 * 60 * 1000;

/* Notes whether the intro was ever on the page, from the first moment of every load. */
function watchIntro() {
  window.__introSeen = false;
  new MutationObserver(() => {
    if (document.querySelector('.oven')) window.__introSeen = true;
  }).observe(document, { childList: true, subtree: true });
}

test('a member records what they took; the big number changes and the log shows the entry', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '50.00', mode: 'credit', reason: '' }, key());
    const page = fx.memberPage;
    await page.reload();
    await expect(page.getByTestId('available-balance')).toHaveText('$50.00');
    // The number people see is pixels on a canvas; the text above is for screen readers. With
    // less motion asked for it is redrawn at once rather than rolled, so a picture of it now
    // and after the entry must differ. An unpainted canvas reads as null, never as a picture.
    const drawn = () => page.locator('.big-number canvas').evaluate(canvas => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      return data.some(value => value !== 0) ? canvas.toDataURL() : null;
    });
    const before = await drawn();
    expect(before).not.toBeNull();
    await expect(page.getByRole('heading', { name: 'Benefits' })).toHaveCount(0);
    await page.getByRole('button', { name: 'I grabbed something', exact: true }).click();
    await keyIn(page, '1250');
    await expect(page.getByRole('dialog')).toContainText('$12.50');
    await page.getByRole('button', { name: 'Jot it down', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Got it, $12.50' })).toBeVisible();
    await expect(page.getByTestId('available-balance')).toHaveText('$37.50');
    await expect.poll(drawn).not.toBe(before);
    expect(await drawn()).not.toBeNull();
    await expect(page.locator('.quest')).toContainText('Jotted down');
    await expect(page.locator('.slot.filled')).toHaveCount(1);
  } finally {
    await fx.close();
  }
});

test('more than the balance cannot be confirmed', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: 'points', reason: '' }, key());
    const page = fx.memberPage;
    await page.reload();
    await page.getByRole('button', { name: 'I grabbed something', exact: true }).click();
    await keyIn(page, '150');
    await expect(page.getByRole('dialog')).toContainText('more than you’ve got');
    await expect(page.getByRole('button', { name: 'Jot it down', exact: true })).toBeDisabled();
    await keyIn(page, ['Delete last digit']);
    await expect(page.getByRole('button', { name: 'Jot it down', exact: true })).toBeEnabled();
  } finally {
    await fx.close();
  }
});

test('the owner corrects an entry from the Team log', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '20.00', mode: 'credit', reason: '' }, key());
    // The member's own session cookie is in the browser; use the API through a fresh sign-in link for
    // brevity. A new link ends the member's other sessions, the browser's too: it signs in again below.
    const link = await fx.api.request('POST', `/api/admin/members/${fx.memberId}/signin-link`, undefined, key());
    const member = client(fx.origin);
    await member.bootstrap();
    const signedIn = await member.request('POST', '/api/signin/accept', { token: tokenFrom(link.body.signinUrl, 'signin') });
    member.csrf = signedIn.body.csrfToken;
    const spent = await member.request('POST', '/api/me/spend', { amount: '5.00', mode: 'credit' }, key());
    expect(spent.status).toBe(201);
    const page = fx.ownerPage;
    await page.reload();
    await page.getByRole('button', { name: 'Fix', exact: true }).click();
    await page.getByLabel('Reason').fill('Keyed in twice');
    await page.getByRole('button', { name: 'Put it right', exact: true }).click();
    // The badge is on the entry's own line in the Team log.
    await expect(page.locator('.team-log .log-spend').getByText('Put right', { exact: true })).toBeVisible();
    const balance = await fx.api.request('GET', `/api/admin/members`);
    expect(balance.body.items.find(item => item.id === fx.memberId).balance.availableUnits).toBe(2000);

    // The member sees the balance back where it was, and the correction in the log's recent rows.
    const again = await fx.api.request('POST', `/api/admin/members/${fx.memberId}/signin-link`, undefined, key());
    // Opened as from a message, in a page of its own: the page still showing holds the ended
    // session's token, which the server would refuse.
    await fx.memberPage.goto('about:blank');
    await signInWithLink(fx.memberPage, again.body.signinUrl);
    await expect(fx.memberPage.getByTestId('available-balance')).toHaveText('$20.00');
    const log = fx.memberPage.getByRole('region', { name: 'Log', exact: true });
    await expect(log.locator('.log-void')).toContainText('Fixed');
    await expect(log.locator('.log-spend')).toContainText('Put right');
  } finally {
    await fx.close();
  }
});

test('a batch treat reaches three people and folds into one log line', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    // Only people who have joined can be treated: each signs in on their own phone first.
    for (const [username, displayName] of [['sam', 'Sam Okafor'], ['leo', 'Leo Martins']])
      await joinTeam({ base: fx.origin }, fx.api, { username, displayName });
    const page = fx.ownerPage;
    await page.reload();
    await page.getByRole('button', { name: 'Treat someone', exact: true }).click();
    await page.getByRole('button', { name: 'Everyone here', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Olive Chen (you)' }).uncheck();
    await page.getByLabel('How much each').fill('20.00');
    await page.getByLabel('A few words').fill('Mid-Autumn');
    await expect(page.getByRole('button', { name: 'Treat 3 people · $60.00 all in', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Treat 3 people · $60.00 all in', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '3 people just got' })).toBeVisible();
    await expect(page.locator('.log-grant')).toHaveCount(1);
    await expect(page.locator('.log-grant')).toContainText('3 people');
    expect(fx.db.prepare(`SELECT count(DISTINCT batch_id) AS n FROM ledger WHERE kind = 'grant'`).get().n).toBe(1);
    expect(fx.db.prepare(`SELECT count(*) AS n FROM ledger WHERE kind = 'grant'`).get().n).toBe(3);
  } finally {
    await fx.close();
  }
});

test('a batch whose rows run past the first page of the log is still one line', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    const people = [];
    for (let index = 1; index <= 25; index += 1) {
      const number = String(index).padStart(2, '0');
      const { user } = await joinTeam({ base: fx.origin }, fx.api, { username: `baker${number}`, displayName: `Baker ${number}` });
      people.push(user.id);
    }
    const batch = await fx.api.request('POST', '/api/admin/grants/batch',
      { userIds: people, amount: '10', mode: 'points', reason: 'Stocktake night' }, key());
    expect(batch.status).toBe(201);
    const page = fx.ownerPage;
    await page.reload();
    // The log reads 20 rows at a time: 20 of the batch's rows are on its first page, 5 on the next.
    const log = page.locator('.team-log');
    await expect(log.locator(':scope > li')).toHaveCount(1);
    await expect(log.locator('.log-batch')).toContainText('25 people');
    await page.getByRole('button', { name: 'Show more', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Show more', exact: true })).toHaveCount(0);
    await expect(log.locator(':scope > li')).toHaveCount(1);
    // Opened, the line lists all 25, each with their own "Take back".
    await log.getByRole('button', { name: 'See all', exact: true }).click();
    await expect(log.locator('.batch-people > li')).toHaveCount(25);
    await expect(log.getByRole('button', { name: 'Take back', exact: true })).toHaveCount(25);
  } finally {
    await fx.close();
  }
});

test('switching the spending mode changes both pages', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    const { ownerPage, memberPage } = fx;
    await expect(ownerPage.getByRole('heading', { name: 'People' })).toBeVisible();
    await expect(ownerPage.getByRole('heading', { name: 'Benefits' })).toHaveCount(0);
    await ownerPage.goto(`${fx.origin}/#/settings`);
    await ownerPage.getByRole('radio', { name: 'Confirmed' }).check();
    await ownerPage.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(ownerPage.getByRole('status').filter({ hasText: 'Settings saved' })).toBeVisible();
    await ownerPage.goto(`${fx.origin}/#/team`);
    await expect(ownerPage.getByRole('heading', { name: 'Benefits' })).toBeVisible();
    await expect(ownerPage.getByRole('heading', { name: 'Waiting on you' })).toBeVisible();
    await memberPage.reload();
    await expect(memberPage.getByRole('heading', { name: 'Benefits' })).toBeVisible();
    await expect(memberPage.getByRole('button', { name: 'I grabbed something' })).toHaveCount(0);
  } finally {
    await fx.close();
  }
});

test('a request left waiting when the team switches to self-recording still shows under "Your requests"', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage, memberPage } = fx;
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: 'points', reason: '' }, key());
    await memberPage.reload();
    await askFor(memberPage, 'Coffee').click();
    await memberPage.getByRole('button', { name: 'Yes, please', exact: true }).click();
    await expect(memberPage.getByText('Awaiting confirmation', { exact: true })).toBeVisible();
    expect((await fx.api.request('PATCH', '/api/org', { spending: 'self' })).status).toBe(200);

    await memberPage.reload();
    await expect(memberPage.getByRole('button', { name: 'I grabbed something', exact: true })).toBeVisible();
    await expect(memberPage.getByRole('heading', { name: 'Benefits' })).toHaveCount(0);
    const requests = memberPage.getByRole('region', { name: 'Your requests', exact: true });
    await expect(requests).toContainText('Coffee');
    await expect(requests.getByText('Awaiting confirmation', { exact: true })).toBeVisible();
    await expect(memberPage.getByTestId('available-balance')).toHaveText('60 points');

    // The Team page keeps "Waiting on you" while something is waiting, without the benefit list.
    await ownerPage.reload();
    await expect(ownerPage.getByRole('heading', { name: 'Waiting on you' })).toBeVisible();
    await expect(ownerPage.getByRole('heading', { name: 'Benefits' })).toHaveCount(0);
    await ownerPage.getByRole('button', { name: 'Confirm delivery', exact: true }).click();
    await expect(ownerPage.getByRole('status').filter({ hasText: 'Confirmed Coffee for Mina Park.' })).toBeVisible();
    await expect(ownerPage.getByRole('heading', { name: 'Waiting on you' })).toHaveCount(0);
    await memberPage.reload();
    await expect(memberPage.getByTestId('available-balance')).toHaveText('60 points');
    await expect(memberPage.getByRole('region', { name: 'Your requests', exact: true })).toHaveCount(0);
  } finally {
    await fx.close();
  }
});

test('"Almost there" shows under a benefit only when the member is short by at most half its price', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit' });
  try {
    const page = fx.memberPage;
    const benefit = (name, amount) => fx.api.request('POST', '/api/admin/rewards',
      { name, description: '', amount, mode: 'credit', active: true }, key());
    const treat = amount => fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount, mode: 'credit', reason: '' }, key());
    expect((await benefit('Tea', '4.50')).status).toBe(201);
    expect((await benefit('Mint', '1.00')).status).toBe(201);
    const row = name => page.locator('.benefit').filter({ has: page.getByText(name, { exact: true }) });
    const almost = name => row(name).getByText('Almost there', { exact: false });
    // The price and the button stay as they are whether the line shows or not.
    const looksTheSame = async () => {
      await expect(row('Tea').locator('.price')).toHaveText('$4.50');
      await expect(askFor(page, 'Tea')).toBeDisabled();
      await expect(askFor(page, 'Coffee')).toBeDisabled();
    };

    // Nothing yet: even the $1.00 Mint is a whole price away, so no line anywhere.
    await page.reload();
    await expect(page.getByTestId('available-balance')).toHaveText('$0.00');
    await expect(page.locator('.benefit')).toHaveCount(3);
    await expect(page.getByText('Almost there', { exact: false })).toHaveCount(0);

    // $1.00: Tea is $3.50 short, more than half of $4.50; Mint is affordable.
    await treat('1.00');
    await page.reload();
    await expect(page.getByTestId('available-balance')).toHaveText('$1.00');
    await expect(almost('Tea')).toHaveCount(0);
    await expect(almost('Coffee')).toHaveCount(0);
    await expect(almost('Mint')).toHaveCount(0);
    await expect(askFor(page, 'Mint')).toBeEnabled();
    await looksTheSame();

    // $3.00: Tea is $1.50 short, within half its price; Coffee, $9.50 short, is not.
    await treat('2.00');
    await page.reload();
    await expect(page.getByTestId('available-balance')).toHaveText('$3.00');
    await expect(almost('Tea')).toHaveText('Almost there. A little more and it’s yours.');
    await expect(almost('Coffee')).toHaveCount(0);
    await expect(almost('Mint')).toHaveCount(0);
    await expect(askFor(page, 'Mint')).toBeEnabled();
    await looksTheSame();
  } finally {
    await fx.close();
  }
});

test('the member log shows the latest five, opens to everything by month with "Show more", and folds back', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    const treat = reason => fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '1', mode: 'points', reason }, key());
    // Three treats forty days ago, always another month, then 27 now: 30 rows, five more
    // than the first page of 25.
    const earlier = Date.now() - 40 * DAY;
    fx.time.now = earlier;
    for (let index = 1; index <= 3; index += 1) await treat(`Earlier ${index}`);
    fx.time.now = null;
    for (let index = 1; index <= 27; index += 1) await treat(`Now ${index}`);
    const page = fx.memberPage;
    await page.reload();
    const log = page.getByRole('region', { name: 'Log', exact: true });
    const rows = log.locator('.rec');
    const months = log.locator('.quest-month');
    await expect(rows).toHaveCount(5);
    await expect(months).toHaveCount(0);

    await log.getByRole('button', { name: /Log · Recent/ }).click();
    await expect(log.getByRole('button', { name: /Log · Everything/ })).toHaveAttribute('aria-expanded', 'true');
    await expect(rows).toHaveCount(25);
    await expect(months).toHaveCount(1);
    await log.getByRole('button', { name: 'Show more', exact: true }).click();
    await expect(rows).toHaveCount(30);
    await expect(log.getByRole('button', { name: 'Show more', exact: true })).toHaveCount(0);
    // Newest first: this month's heading and rows, then the earlier month's heading and rows.
    const names = await page.evaluate(times => times.map(time =>
      new Intl.DateTimeFormat('en', { year: 'numeric', month: 'long' }).format(new Date(time))), [Date.now(), earlier]);
    await expect(months).toHaveText(names);
    const order = await log.locator('.rows > li').evaluateAll(nodes => nodes.map(node => {
      if (node.classList.contains('quest-month')) return 'month';
      return node.textContent.includes('Earlier') ? 'earlier' : 'now';
    }));
    expect(order).toEqual(['month', ...Array(27).fill('now'), 'month', ...Array(3).fill('earlier')]);

    await log.getByRole('button', { name: /Fold up/ }).click();
    await expect(log.getByRole('button', { name: /Log · Recent/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(rows).toHaveCount(5);
    await expect(months).toHaveCount(0);
  } finally {
    await fx.close();
  }
});

test('on a phone the header is one line and the menu holds the pages, language and sign out', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const page = fx.ownerPage;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const who = nameMenu(page);
    await expect(who).toBeVisible();
    // With the menu shut no navigation shows: on a phone the pages wait in the menu.
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toHaveCount(0);
    // One line: the header's height is the measure.
    const bar = await page.getByRole('banner').boundingBox();
    expect(bar.height).toBeLessThan(70);
    await who.click();
    const menu = page.locator(`#${await who.getAttribute('aria-controls')}`);
    await expect(menu.getByRole('link', { name: 'Mine' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Team' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Settings' })).toBeVisible();
    await expect(menu.getByLabel('Language')).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Sign out' })).toBeVisible();
    // On a wide screen the pills stand in the header, and only there: the menu's copy hides.
    await page.setViewportSize({ width: 1200, height: 800 });
    await expect(nav).toBeVisible();
    // A team member has one page: no pills in the header and none in the menu.
    await expect(fx.memberPage.getByRole('navigation', { name: 'Main', includeHidden: true })).toHaveCount(0);
  } finally {
    await fx.close();
  }
});

test('the intro can be skipped with a tap and stays away under reduced motion', async ({ browser }) => {
  // Declared out here and made in the try, so whatever was made is closed if a step fails.
  let crumb;
  let context;
  let reduced;
  try {
    crumb = await startCrumb();
    const api = client(crumb.origin);
    await api.bootstrap();
    const setup = await api.request('POST', '/api/setup', { setupToken: crumb.setupToken, username: 'olive', password: PASSWORD, displayName: 'Olive Chen', org: orgInput('points') });
    expect(setup.status).toBe(201);
    api.csrf = setup.body.csrfToken;
    const invite = await api.request('POST', '/api/admin/invitations', { username: 'mina', displayName: 'Mina Park', role: 'member' });
    context = await browser.newContext();
    reduced = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await signInWithLink(page, invite.body.signinUrl);
    // The page's clock stands still, so the intro's own timer never runs out: only the tap
    // can end it. Its slide out takes 420 ms, so half a second later it is gone.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    await page.reload();
    await expect(page.locator('.oven')).toBeVisible();
    await page.locator('.oven').click();
    await page.clock.runFor(500);
    await expect(page.locator('.oven')).toHaveCount(0);
    await expect(page.getByTestId('available-balance')).toBeVisible();
    await page.clock.resume();

    const quiet = await reduced.newPage();
    await quiet.addInitScript(watchIntro);
    const second = await api.request('POST', `/api/admin/members/${invite.body.user.id}/signin-link`, undefined, key());
    await signInWithLink(quiet, second.body.signinUrl);
    await quiet.reload();
    await expect(quiet.getByTestId('available-balance')).toBeVisible();
    expect(await quiet.evaluate(() => window.__introSeen)).toBe(false);
  } finally {
    await context?.close();
    await reduced?.close();
    await crumb?.close();
  }
});

test('with reduced motion no pastry drops and no intro shows', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  const lively = await browser.newContext();
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '200', mode: 'points', reason: '' }, key());
    const page = fx.memberPage;
    await page.addInitScript(watchIntro);
    await page.reload();
    await expect(page.getByTestId('available-balance')).toHaveText('200 points');
    await expect(page.locator('.slot.filled')).toHaveCount(2);
    await expect(page.locator('.slot.pop')).toHaveCount(0);
    expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.effect?.target?.closest?.('.slots')).length)).toBe(0);
    expect(await page.evaluate(() => window.__introSeen)).toBe(false);

    // The same first look without the preference: both pastries drop in, so the check above can see one.
    const { body } = await fx.api.request('POST', `/api/admin/members/${fx.memberId}/signin-link`, undefined, key());
    const other = await lively.newPage();
    await signInWithLink(other, body.signinUrl);
    await expect(other.locator('.slot.filled')).toHaveCount(2);
    await expect(other.locator('.slot.pop')).toHaveCount(2);
  } finally {
    await lively.close();
    await fx.close();
  }
});

test('the member page has one level-1 heading, there for screen readers only, in both spending modes', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points', spending: 'self' });
  try {
    const page = fx.memberPage;
    for (const spending of ['self', 'confirm']) {
      expect((await fx.api.request('PATCH', '/api/org', { spending })).status).toBe(200);
      await page.reload();
      await expect(page.getByTestId('available-balance')).toBeVisible();
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveCount(1);
      await expect(heading).toHaveText('My Crumb');
      await expect(heading).toHaveClass(/sr-only/);
      const box = await heading.boundingBox();
      expect(box.width * box.height, `${spending}: the heading takes no room on screen`).toBeLessThanOrEqual(1);
    }
  } finally {
    await fx.close();
  }
});

test('a phone keeps no last-seen balance once the server signs its member out', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '10.00', mode: 'credit', reason: '' }, key());
    const page = fx.memberPage;
    await page.reload();
    await expect(page.getByTestId('available-balance')).toHaveText('$10.00');
    const seen = () => page.evaluate(() => Object.keys(window.localStorage).filter(name => name.startsWith('crumb.seen.')));
    expect(await seen()).toHaveLength(1);
    // A new sign-in link is how a lost phone is cut off: it ends the member's sessions.
    await fx.api.request('POST', `/api/admin/members/${fx.memberId}/signin-link`, undefined, key());
    await page.reload();
    await expect(page.getByRole('heading', { name: /^Sign in/ })).toBeVisible();
    expect(await seen()).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('signing out leaves no last-seen balance on the device', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '10.00', mode: 'credit', reason: '' }, key());
    const page = fx.memberPage;
    await page.reload();
    await expect(page.getByTestId('available-balance')).toHaveText('$10.00');
    const seen = () => page.evaluate(() => Object.keys(window.localStorage).filter(name => name.startsWith('crumb.seen.')));
    expect(await seen()).toHaveLength(1);
    await signOut(page, { member: true });
    expect(await seen()).toEqual([]);
  } finally {
    await fx.close();
  }
});

/* A member with $10.00 jots down $2.50 and the answer never arrives, so the entry's key and the
 * fingerprint of "spend:250" stay in the browser: a fingerprint of an amount that the next
 * person here could work back. Returns the member's page, with the sheet closed again, and a
 * look at the kinds of the member's keys left in crumb.pending. */
async function leaveSpendUnanswered(fx) {
  await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '10.00', mode: 'credit', reason: '' }, key());
  const page = fx.memberPage;
  await page.reload();
  await expect(page.getByTestId('available-balance')).toHaveText('$10.00');
  await page.route('**/api/me/spend', route => route.abort('connectionreset'));
  await page.getByRole('button', { name: 'I grabbed something', exact: true }).click();
  await keyIn(page, '250');
  await page.getByRole('button', { name: 'Jot it down', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Could not reach Crumb');
  const kept = () => page.evaluate(member => JSON.parse(window.localStorage.getItem('crumb.pending') ?? '[]')
    .filter(entry => entry.actor === member).map(entry => entry.kind), fx.memberId);
  expect(await kept()).toEqual(['spend']);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  return { page, kept };
}

test('signing out leaves none of the member\'s unanswered request keys on the device', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    const { page, kept } = await leaveSpendUnanswered(fx);
    await signOut(page, { member: true });
    expect(await kept()).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('signing out takes the member\'s request keys even when no answer comes to who is signed in next', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    const { page, kept } = await leaveSpendUnanswered(fx);
    // From the moment the sign-out goes out, asking the server who is here now gets no answer,
    // so the page never learns that no one is signed in: only the sign-out itself can take the
    // key away.
    let leaving = false;
    await page.route('**/api/logout', route => {
      leaving = true;
      return route.continue();
    });
    await page.route('**/api/session', route => (leaving ? route.abort('connectionreset') : route.continue()));
    const unanswered = page.waitForEvent('requestfailed', request => new URL(request.url()).pathname === '/api/session');
    await nameMenu(page).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
    await unanswered;
    expect(await kept()).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('a phone keeps none of the member\'s unanswered request keys once the server signs them out', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    const { page, kept } = await leaveSpendUnanswered(fx);
    // A new sign-in link ends the member's sessions. No one signed out on this page, so only
    // the next load, finding no one signed in, can take the key away.
    await fx.api.request('POST', `/api/admin/members/${fx.memberId}/signin-link`, undefined, key());
    await page.reload();
    await expect(page.getByRole('heading', { name: /^Sign in/ })).toBeVisible();
    expect(await kept()).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('a person opens to their actions, and stays open with the keyboard on them after a change', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const page = fx.ownerPage;
    await page.goto(`${fx.origin}/#/team`);
    const row = page.getByRole('button', { name: 'Mina Park', exact: true });
    await expect(row).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: 'Deactivate Mina Park', exact: true })).toHaveCount(0);
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Deactivate Mina Park', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate', exact: true }).click();
    // The page is drawn again; Mina's row is open again and has the keyboard.
    await expect(page.getByRole('button', { name: 'Reactivate Mina Park', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mina Park', exact: true })).toBeFocused();
  } finally {
    await fx.close();
  }
});

test('a treat that came in since the last look is announced; an entry of the member\'s own is not', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    const page = fx.memberPage;
    const treat = amount => fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount, mode: 'credit', reason: '' }, key());
    // Toasts share one live region; each is a line of its own in it.
    const treated = page.getByRole('status').getByText(/^Someone treated you/);
    const jot = async digits => {
      await page.getByRole('button', { name: 'I grabbed something', exact: true }).click();
      await keyIn(page, digits);
      await page.getByRole('button', { name: 'Jot it down', exact: true }).click();
    };
    // The page was drawn with nothing yet; a treat comes in, and the next look says so.
    await expect(page.getByTestId('available-balance')).toHaveText('$0.00');
    await treat('30.00');
    await page.reload();
    await expect(page.getByTestId('available-balance')).toHaveText('$30.00');
    await expect(treated).toHaveText(['Someone treated you: +$30.00']);

    // The member's own entry lowers the balance and is not a treat, now or on the next look.
    await page.reload();
    await expect(page.getByTestId('available-balance')).toHaveText('$30.00');
    await expect(treated).toHaveCount(0);
    await jot('500');
    await expect(page.getByTestId('available-balance')).toHaveText('$25.00');
    await expect(treated).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('available-balance')).toHaveText('$25.00');
    await expect(treated).toHaveCount(0);

    // A treat that comes in while the page is open shows when an entry reads the page again.
    await treat('10.00');
    await jot('500');
    await expect(page.getByTestId('available-balance')).toHaveText('$30.00');
    await expect(treated).toHaveText(['Someone treated you: +$10.00']);
  } finally {
    await fx.close();
  }
});

test('a benefit gets a pastry from the picker, and both pages draw it', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit' });
  try {
    const { ownerPage, memberPage } = fx;
    // A canvas with something painted on it.
    const painted = canvas => canvas.evaluate(node => {
      const { data } = node.getContext('2d').getImageData(0, 0, node.width, node.height);
      return data.some(value => value !== 0);
    });
    await ownerPage.goto(`${fx.origin}/#/team`);
    await ownerPage.locator('summary', { hasText: 'Add a benefit' }).click();
    const form = ownerPage.locator('details', { has: ownerPage.locator('summary', { hasText: 'Add a benefit' }) });
    await form.getByLabel('Name', { exact: true }).fill('Tea');
    await form.getByLabel('Price', { exact: true }).fill('3.00');
    // Each choice is named in the interface's language; "None" is chosen until another is.
    await expect(form.getByRole('radio', { name: 'None', exact: true })).toBeChecked();
    await form.getByRole('radio', { name: 'Icon: Egg Tart', exact: true }).check();
    await ownerPage.getByRole('button', { name: 'Add benefit', exact: true }).click();
    await expect(ownerPage.getByRole('status').filter({ hasText: 'Tea added.' })).toBeVisible();
    expect(fx.db.prepare(`SELECT icon_key FROM rewards WHERE name = 'Tea'`).get().icon_key).toBe('tart');

    const teamRow = ownerPage.locator('li.row').filter({ has: ownerPage.getByText('Tea', { exact: true }) });
    await expect(teamRow.locator('.row-icon canvas')).toHaveCount(1);
    expect(await painted(teamRow.locator('.row-icon canvas'))).toBe(true);
    // Coffee was added without one and has none.
    await expect(ownerPage.locator('li.row').filter({ has: ownerPage.getByText('Coffee', { exact: true }) }).locator('.row-icon')).toHaveCount(0);

    await memberPage.reload();
    const memberRow = memberPage.locator('.benefit').filter({ has: memberPage.getByText('Tea', { exact: true }) });
    await expect(memberRow.locator('.row-icon canvas')).toHaveCount(1);
    expect(await painted(memberRow.locator('.row-icon canvas'))).toBe(true);
    await expect(memberPage.locator('.benefit').filter({ has: memberPage.getByText('Coffee', { exact: true }) }).locator('.row-icon')).toHaveCount(0);
  } finally {
    await fx.close();
  }
});

test('the old sub-page addresses land on the page that now holds them', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  const adminContext = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = fx.ownerPage;
    await page.goto(`${fx.origin}/#/team/members`);
    await expect(page).toHaveURL(/#\/team$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Team', exact: true })).toBeVisible();
    // The activity log is on Settings now.
    await page.goto(`${fx.origin}/#/team/activity`);
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByRole('heading', { name: 'Who did what', exact: true })).toBeVisible();
    // Settings is the owner's alone, so an admin's old link opens the Team page, which holds
    // the log for them.
    await joinTeam({ base: fx.origin }, fx.api, { username: 'ada', displayName: 'Ada Lee', role: 'admin' });
    const admin = await adminContext.newPage();
    await signIn(admin, fx.origin, 'ada');
    await admin.goto(`${fx.origin}/#/team/activity`);
    await expect(admin).toHaveURL(/#\/team$/);
    await expect(admin.getByRole('heading', { level: 1, name: 'Team', exact: true })).toBeVisible();
    await expect(admin.getByRole('heading', { name: 'Who did what', exact: true })).toBeVisible();
  } finally {
    await adminContext.close();
    await fx.close();
  }
});

test('an admin reads who did what at the bottom of the Team page; the owner reads it in Settings', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  const adminContext = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: 'points', reason: '' }, key());
    await joinTeam({ base: fx.origin }, fx.api, { username: 'ada', displayName: 'Ada Lee', role: 'admin' });
    const admin = await adminContext.newPage();
    await signIn(admin, fx.origin, 'ada');
    await expect(admin).toHaveURL(/#\/team$/);
    const activity = admin.getByRole('region', { name: 'Who did what', exact: true });
    await expect(activity.getByText('Treated Mina Park to', { exact: false })).toBeVisible();
    await expect(activity.getByText('Olive Chen ·', { exact: false }).first()).toBeVisible();
    // Below the log, the last thing on the page, and only to read: nothing in it can be pressed.
    const titles = await admin.locator('main h2').allTextContents();
    expect(titles.slice(-2)).toEqual(['Log', 'Who did what']);
    await expect(activity.getByRole('button')).toHaveCount(0);
    await expect(activity.getByRole('link')).toHaveCount(0);

    // The owner reads it in Settings only: their Team page neither shows it nor asks for it.
    const owner = fx.ownerPage;
    const asked = [];
    owner.on('request', request => { if (request.url().includes('/api/admin/audit')) asked.push(request.url()); });
    await owner.goto(`${fx.origin}/#/team`);
    await owner.reload();
    await expect(owner.getByRole('region', { name: 'Log', exact: true })).toBeVisible();
    await owner.waitForLoadState('networkidle');
    await expect(owner.getByRole('region', { name: 'Who did what', exact: true })).toHaveCount(0);
    expect(asked).toEqual([]);
    await owner.goto(`${fx.origin}/#/settings`);
    await expect(owner.getByRole('region', { name: 'Who did what', exact: true })
      .getByText('Treated Mina Park to', { exact: false })).toBeVisible();
  } finally {
    await adminContext.close();
    await fx.close();
  }
});

test('taking back one treat of a batch opens the batch again with the keyboard on it', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', spending: 'self' });
  try {
    const people = [fx.memberId];
    for (const [username, displayName] of [['sam', 'Sam Okafor'], ['leo', 'Leo Martins']]) {
      const { user } = await joinTeam({ base: fx.origin }, fx.api, { username, displayName });
      people.push(user.id);
    }
    const batch = await fx.api.request('POST', '/api/admin/grants/batch',
      { userIds: people, amount: '20.00', mode: 'credit', reason: 'Mid-Autumn' }, key());
    expect(batch.status).toBe(201);
    const page = fx.ownerPage;
    await page.reload();
    const log = page.locator('.team-log');
    await log.getByRole('button', { name: 'See all', exact: true }).click();
    const sam = () => log.locator('.batch-people > li').filter({ hasText: 'Sam Okafor' });
    await sam().getByRole('button', { name: 'Take back', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByLabel('Reason').fill('Not on shift');
    await page.getByRole('button', { name: 'Take it back', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Took back the treat to Sam Okafor.' })).toBeVisible();
    // The page is drawn again: the batch is open, Sam's badge shows, and its toggle has the keyboard.
    const toggle = log.locator('.log-batch').getByRole('button', { name: 'Fold up', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(sam().getByText('Taken back', { exact: true })).toBeVisible();
    await expect(toggle).toBeFocused();
  } finally {
    await fx.close();
  }
});
