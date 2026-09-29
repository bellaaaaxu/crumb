import { test, expect } from '@playwright/test';
import { PASSWORD, provision, signIn, startCrumb } from './fixtures.mjs';
import { client, tokenFrom } from '../helpers.mjs';

test('member requests a benefit and owner completes it', async ({browser}) => {
  const fx = await provision(browser,{mode:'points'});
  try {
    await fx.ownerPage.getByRole('button',{name:'Give recognition',exact:true}).click();
    await fx.ownerPage.getByLabel('Team member').selectOption(fx.memberId);
    await fx.ownerPage.getByLabel('Amount').fill('100');
    await fx.ownerPage.getByLabel('Message').fill('Thanks for helping a teammate');
    await fx.ownerPage.getByRole('button',{name:'Send reward',exact:true}).click();
    await fx.memberPage.reload();
    await expect(fx.memberPage.getByTestId('available-balance')).toHaveText('100 points');
    await fx.memberPage.getByRole('button',{name:'Redeem Coffee',exact:true}).click();
    await fx.memberPage.getByRole('button',{name:'Confirm request',exact:true}).click();
    await expect(fx.memberPage.getByText('Awaiting confirmation',{exact:true})).toBeVisible();
    await fx.ownerPage.getByRole('link',{name:'Redemptions',exact:true}).click();
    await fx.ownerPage.getByRole('button',{name:'Confirm delivery',exact:true}).click();
    await fx.memberPage.reload();
    await expect(fx.memberPage.getByTestId('collection-count')).toHaveText('1');
  } finally { await fx.close(); }
});

test('the same journey in credit mode keeps cents exact and the collection after spending', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit' });
  try {
    const { ownerPage, memberPage } = fx;
    await ownerPage.getByRole('button', { name: 'Give recognition', exact: true }).click();
    await ownerPage.getByLabel('Team member').selectOption(fx.memberId);
    await ownerPage.getByLabel('Amount').fill('50.25');
    await ownerPage.getByLabel('Message').fill('Closed the café on your own on Sunday');
    await ownerPage.getByRole('button', { name: 'Send reward', exact: true }).click();
    await expect(ownerPage.getByRole('status').filter({ hasText: '$50.25' })).toBeVisible();

    await memberPage.reload();
    await expect(memberPage.getByTestId('available-balance')).toHaveText('$50.25');
    await expect(memberPage.getByText('Closed the café on your own on Sunday')).toBeVisible();
    await expect(memberPage.getByTestId('collection-count')).toHaveText('1');
    await memberPage.getByRole('button', { name: 'Redeem Coffee', exact: true }).click();
    await expect(memberPage.getByRole('dialog')).toContainText('$12.50');
    await memberPage.getByRole('button', { name: 'Confirm request', exact: true }).click();
    await expect(memberPage.getByTestId('available-balance')).toHaveText('$37.75');

    await ownerPage.getByRole('link', { name: 'Redemptions', exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Confirm delivery', exact: true }).click();
    await expect(ownerPage.getByText('Completed', { exact: true })).toBeVisible();
    await memberPage.reload();
    await expect(memberPage.getByTestId('available-balance')).toHaveText('$37.75');
    await expect(memberPage.getByTestId('collection-count')).toHaveText('1');
  } finally {
    await fx.close();
  }
});

test('amounts the unit cannot hold are refused before anything is sent', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const page = fx.ownerPage;
    await page.getByRole('button', { name: 'Give recognition', exact: true }).click();
    await page.getByLabel('Team member').selectOption(fx.memberId);
    for (const amount of ['1.5', '0', '-3', 'ten']) {
      await page.getByLabel('Amount').fill(amount);
      await page.getByRole('button', { name: 'Send reward', exact: true }).click();
      await expect(page.getByLabel('Amount')).toHaveAttribute('aria-invalid', 'true');
    }
    expect(fx.db.prepare('SELECT count(*) AS n FROM ledger').get().n).toBe(0);
  } finally {
    await fx.close();
  }
});

test('a member can cancel a request; the owner can decline and refund', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage, memberPage } = fx;
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '200', mode: fx.mode, reason: 'Great month' },
      { 'idempotency-key': 'e2e-grant-refund-0001' });
    await memberPage.reload();
    await memberPage.getByRole('button', { name: 'Redeem Coffee', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Confirm request', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await expect(memberPage.getByText('Cancelled', { exact: true })).toBeVisible();
    await expect(memberPage.getByTestId('available-balance')).toHaveText('200 points');

    await memberPage.getByRole('button', { name: 'Redeem Coffee', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Confirm request', exact: true }).click();
    await ownerPage.getByRole('link', { name: 'Redemptions', exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Decline', exact: true }).click();
    await ownerPage.getByLabel('Reason').fill('The machine is broken this week');
    await ownerPage.getByRole('button', { name: 'Decline request', exact: true }).click();
    await memberPage.reload();
    await expect(memberPage.getByText('The machine is broken this week')).toBeVisible();

    await memberPage.getByRole('button', { name: 'Redeem Coffee', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Confirm request', exact: true }).click();
    await ownerPage.reload();
    await ownerPage.getByRole('button', { name: 'Confirm delivery', exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Refund', exact: true }).click();
    await ownerPage.getByLabel('Reason').fill('Confirmed the wrong request');
    await ownerPage.getByRole('button', { name: 'Refund request', exact: true }).click();
    await expect(ownerPage.getByText('Refunded', { exact: true })).toBeVisible();
    await memberPage.reload();
    await expect(memberPage.getByTestId('available-balance')).toHaveText('200 points');
    await expect(memberPage.getByTestId('collection-count')).toHaveText('2');
  } finally {
    await fx.close();
  }
});

test('a mistaken grant is revoked with a reason and stays visible as revoked', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage, memberPage } = fx;
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: fx.mode, reason: 'For the Sunday shift' },
      { 'idempotency-key': 'e2e-grant-revoke-0001' });
    await ownerPage.getByRole('link', { name: 'History', exact: true }).click();
    await ownerPage.getByRole('button', { name: 'Revoke', exact: true }).click();
    await ownerPage.getByLabel('Reason').fill('Meant for another teammate');
    await ownerPage.getByRole('button', { name: 'Revoke grant', exact: true }).click();
    await expect(ownerPage.getByText('Revoked', { exact: true })).toBeVisible();
    await memberPage.reload();
    await expect(memberPage.getByTestId('available-balance')).toHaveText('0 points');
    await expect(memberPage.getByText('Meant for another teammate')).toBeVisible();
    await expect(memberPage.getByTestId('collection-count')).toHaveText('1');
  } finally {
    await fx.close();
  }
});

test('first-time setup in the browser creates the organization and signs the owner in', async ({ page }) => {
  const crumb = await startCrumb();
  try {
    await page.goto(crumb.origin);
    await expect(page.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
    await page.getByLabel('Setup code').fill(crumb.setupToken);
    await page.getByLabel('Organization name').fill('Harbour Books');
    await page.getByLabel('Points').check();
    await page.getByLabel('Unlock a collectible every').fill('100');
    await page.getByLabel('Your name').fill('Dana Reyes');
    await page.getByLabel('Username').fill('dana');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create organization', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Give recognition', exact: true })).toBeVisible();
    await expect(page.getByText('Harbour Books').first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  } finally {
    await crumb.close();
  }
});

test('an invitation link is created, opened on another device and used to join', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage } = fx;
    await ownerPage.getByRole('link', { name: 'Members', exact: true }).click();
    await ownerPage.getByLabel('Name', { exact: true }).fill('Sam Okafor');
    await ownerPage.getByLabel('Username').fill('sam');
    await ownerPage.getByRole('button', { name: 'Create invitation', exact: true }).click();
    const link = await ownerPage.getByLabel('Invitation link', { exact: true }).inputValue();
    expect(link).toMatch(new RegExp(`^${fx.origin}/#invite=[A-Za-z0-9_-]{43}$`));

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(link);
    await expect(page).toHaveURL(`${fx.origin}/`);
    await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByLabel('Username')).toHaveValue('sam');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByTestId('available-balance')).toHaveText('0 points');
    await context.close();
  } finally {
    await fx.close();
  }
});

test('a deactivated member is signed out on their next action', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    await fx.ownerPage.getByRole('link', { name: 'Members', exact: true }).click();
    await fx.ownerPage.getByRole('button', { name: 'Deactivate Mina Park', exact: true }).click();
    await fx.ownerPage.getByRole('button', { name: 'Deactivate', exact: true }).click();
    await expect(fx.ownerPage.getByText('Deactivated', { exact: true })).toBeVisible();
    await fx.memberPage.reload();
    await expect(fx.memberPage.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await fx.memberPage.getByLabel('Username').fill('mina');
    await fx.memberPage.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await fx.memberPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(fx.memberPage.getByRole('alert')).toContainText('do not match');
  } finally {
    await fx.close();
  }
});

test('the owner changes settings in Chinese and the member sees the organization default', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage, memberPage } = fx;
    await ownerPage.getByRole('link', { name: 'Settings', exact: true }).click();
    await ownerPage.getByLabel('Welcome message').fill('谢谢大家');
    await ownerPage.getByLabel('Default language').selectOption('zh-CN');
    await ownerPage.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(ownerPage.getByRole('status').filter({ hasText: 'Settings saved' })).toBeVisible();
    await memberPage.reload();
    await expect(memberPage.getByRole('button', { name: '退出登录', exact: true })).toBeVisible();
    await expect(memberPage.getByText('谢谢大家')).toBeVisible();
    await memberPage.getByLabel('语言').selectOption('en');
    await expect(memberPage.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await memberPage.reload();
    await expect(memberPage.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  } finally {
    await fx.close();
  }
});

test('the ledger downloads as CSV from the settings page', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: fx.mode, reason: 'Export me' },
      { 'idempotency-key': 'e2e-export-grant-0001' });
    await fx.ownerPage.getByRole('link', { name: 'Settings', exact: true }).click();
    const [download] = await Promise.all([
      fx.ownerPage.waitForEvent('download'),
      fx.ownerPage.getByRole('link', { name: 'Download ledger (CSV)', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('crumb-ledger.csv');
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain('Export me');
  } finally {
    await fx.close();
  }
});

test('a role changes only after a deliberate confirmation', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage } = fx;
    const roleOf = async id => (await fx.api.request('GET', '/api/admin/members')).body.items.find(item => item.id === id).role;
    await ownerPage.goto(`${fx.origin}/#/team/members`);
    const dialog = ownerPage.getByRole('dialog');
    await ownerPage.getByRole('button', { name: 'Change role for Mina Park', exact: true }).click();
    // Arrow keys move between the choices. Nothing is saved until the button is pressed.
    await dialog.getByRole('radio', { name: /^Member/ }).focus();
    await ownerPage.keyboard.press('ArrowDown');
    await ownerPage.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('radio', { name: /^Owner/ })).toBeChecked();
    await ownerPage.keyboard.press('Escape');
    expect(await roleOf(fx.memberId)).toBe('member');

    await ownerPage.getByRole('button', { name: 'Change role for Mina Park', exact: true }).click();
    await dialog.getByRole('radio', { name: /^Admin/ }).check();
    await dialog.getByRole('button', { name: 'Change role', exact: true }).click();
    await expect(ownerPage.getByRole('status').filter({ hasText: 'Role for Mina Park changed to Admin.' })).toBeVisible();
    expect(await roleOf(fx.memberId)).toBe('admin');

    // Someone who has not joined yet: the link made for the old role stops working.
    const invite = await fx.api.request('POST', '/api/admin/invitations', { username: 'sam', displayName: 'Sam Lee', role: 'member' });
    await ownerPage.reload();
    await ownerPage.getByRole('button', { name: 'Change role for Sam Lee', exact: true }).click();
    await dialog.getByRole('radio', { name: /^Admin/ }).check();
    await dialog.getByRole('button', { name: 'Change role', exact: true }).click();
    await expect(ownerPage.getByRole('status').filter({ hasText: 'make a new one for them' })).toBeVisible();
    const joiner = client(fx.origin);
    await joiner.bootstrap();
    const used = await joiner.request('POST', '/api/invitations/accept', { token: tokenFrom(invite.body.invitationUrl, 'invite'), password: PASSWORD });
    expect(used.status).toBe(400);
  } finally {
    await fx.close();
  }
});

test('sending again after a lost answer records the reward once, even from a reopened dialog', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage } = fx;
    // The server records the reward, but its answer never reaches the page.
    await ownerPage.route('**/api/admin/grants', async route => {
      await route.fetch();
      await route.abort('connectionreset');
    });
    const give = async () => {
      await ownerPage.getByRole('button', { name: 'Give recognition', exact: true }).click();
      await ownerPage.getByLabel('Team member').selectOption(fx.memberId);
      await ownerPage.getByLabel('Amount').fill('100');
      await ownerPage.getByLabel('Message').fill('Thanks for the Sunday shift');
      await ownerPage.getByRole('button', { name: 'Send reward', exact: true }).click();
    };
    await give();
    await expect(ownerPage.getByRole('dialog').getByRole('alert')).toContainText('Could not reach Crumb');
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await ownerPage.unroute('**/api/admin/grants');
    const grants = async () => (await fx.api.request('GET', `/api/admin/ledger?userId=${fx.memberId}`)).body.items
      .filter(item => item.kind === 'grant');
    // The retry is answered from storage, and the page says so rather than "Sent".
    await give();
    await expect(ownerPage.getByRole('status').filter({ hasText: 'had already been recorded' })).toBeVisible();
    expect(await grants()).toHaveLength(1);
    // Sending the same thing again on purpose, after that answer, is a second reward.
    await give();
    await expect(ownerPage.getByRole('status').filter({ hasText: 'Sent 100 points to Mina Park.' })).toBeVisible();
    expect(await grants()).toHaveLength(2);
  } finally {
    await fx.close();
  }
});

test('asking again after a lost answer makes one request, even from a reopened dialog', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: fx.mode, reason: 'Thanks' },
      { 'idempotency-key': 'e2e-lost-answer-grant-0001' });
    const { memberPage } = fx;
    await memberPage.reload();
    await memberPage.route('**/api/redemptions', async route => {
      await route.fetch();
      await route.abort('connectionreset');
    });
    const ask = async () => {
      await memberPage.getByRole('button', { name: 'Redeem Coffee', exact: true }).click();
      await memberPage.getByRole('button', { name: 'Confirm request', exact: true }).click();
    };
    await ask();
    await expect(memberPage.getByRole('dialog').getByRole('alert')).toContainText('Could not reach Crumb');
    await memberPage.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await memberPage.unroute('**/api/redemptions');
    await ask();
    await expect(memberPage.getByRole('status').filter({ hasText: 'had already gone through' })).toBeVisible();
    await expect(memberPage.getByText('Awaiting confirmation', { exact: true })).toHaveCount(1);
    expect((await fx.api.request('GET', '/api/admin/redemptions?status=pending')).body.items).toHaveLength(1);
  } finally {
    await fx.close();
  }
});

test('asking at a price that just changed shows the new price instead of charging it', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: fx.mode, reason: 'Thanks' },
      { 'idempotency-key': 'e2e-price-change-grant-01' });
    const { memberPage } = fx;
    await memberPage.reload();
    await memberPage.getByRole('button', { name: 'Redeem Coffee', exact: true }).click();
    // While the member is looking at 40 points, a manager changes the price.
    expect((await fx.api.request('PATCH', `/api/admin/rewards/${fx.coffeeId}`, { amount: '60', mode: fx.mode })).status).toBe(200);
    await memberPage.getByRole('button', { name: 'Confirm request', exact: true }).click();
    await expect(memberPage.getByRole('status').filter({ hasText: 'The price of this benefit just changed' })).toBeVisible();
    await expect(memberPage.getByText('60 points', { exact: true })).toBeVisible();
    expect((await fx.api.request('GET', '/api/admin/redemptions?status=pending')).body.items).toHaveLength(0);
  } finally {
    await fx.close();
  }
});

test('an admin can cancel a request the member withdrew in person', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: fx.mode, reason: 'Thanks' },
      { 'idempotency-key': 'e2e-admin-cancel-grant-01' });
    const { ownerPage, memberPage } = fx;
    await memberPage.reload();
    await memberPage.getByRole('button', { name: 'Redeem Coffee', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Confirm request', exact: true }).click();
    await expect(memberPage.getByText('Awaiting confirmation', { exact: true })).toBeVisible();

    await ownerPage.goto(`${fx.origin}/#/team/redemptions`);
    await ownerPage.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Cancel request', exact: true }).click();
    await expect(ownerPage.getByRole('status').filter({ hasText: 'Cancelled Coffee.' })).toBeVisible();
    await memberPage.reload();
    await expect(memberPage.getByText('Cancelled', { exact: true })).toBeVisible();
    await expect(memberPage.getByTestId('available-balance')).toHaveText('100 points');
  } finally {
    await fx.close();
  }
});

test('opened at another address, the page says where Crumb lives', async ({ browser }) => {
  const crumb = await startCrumb();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(crumb.origin.replace('127.0.0.1', 'localhost'));
    await expect(page.getByRole('heading', { name: 'Open Crumb at its own address' })).toBeVisible();
    await expect(page.getByRole('link', { name: `Open ${crumb.origin}` })).toHaveAttribute('href', crumb.origin);
  } finally {
    await context.close();
    await crumb.close();
  }
});

test('settings say which rule is fixed, and why', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    await fx.ownerPage.getByRole('link', { name: 'Settings', exact: true }).click();
    // The fixture has a priced benefit but no rewards yet: only the unit is fixed.
    await expect(fx.ownerPage.getByText(/Benefits already have prices in this unit/)).toBeVisible();
    const threshold = fx.ownerPage.getByLabel('Unlock a collectible every');
    await expect(threshold).toBeEnabled();
    // After the first reward the threshold is fixed too, and looks it.
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: fx.mode, reason: 'First' },
      { 'idempotency-key': 'e2e-settings-lock-grant-01' });
    await fx.ownerPage.reload();
    await expect(fx.ownerPage.getByText(/Rewards have been recorded/)).toBeVisible();
    await expect(threshold).toBeDisabled();
    await expect(threshold).toHaveCSS('border-top-style', 'dashed');
  } finally {
    await fx.close();
  }
});

/* ------------------------------------------------ answers that never arrived whole */

const grantRows = fx => fx.db.prepare(`SELECT count(*) AS n FROM ledger WHERE kind = 'grant'`).get().n;
const pendingRequests = fx => fx.db.prepare(`SELECT count(*) AS n FROM redemptions WHERE status = 'pending'`).get().n;

async function giveHundred(page, fx) {
  await page.getByRole('button', { name: 'Give recognition', exact: true }).click();
  await page.getByLabel('Team member').selectOption(fx.memberId);
  await page.getByLabel('Amount', { exact: true }).fill('100');
  await page.getByLabel('Message', { exact: true }).fill('Thanks for the Sunday shift');
  await page.getByRole('button', { name: 'Send reward', exact: true }).click();
}

async function askForCoffee(page) {
  await page.getByRole('button', { name: 'Redeem Coffee', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm request', exact: true }).click();
}

// The server records the change; the answer then arrives with a body cut short.
const cutShort = async route => route.fulfill({ response: await route.fetch(), body: '{' });
// The server records the change; the connection then drops before the answer arrives.
const lost = async route => {
  await route.fetch();
  await route.abort('connectionreset');
};

test('a success whose answer arrives cut short is not taken as done: sending again records the reward once', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage } = fx;
    await ownerPage.route('**/api/admin/grants', cutShort, { times: 1 });
    await giveHundred(ownerPage, fx);
    await expect(ownerPage.getByRole('dialog').getByRole('alert')).toContainText('did not arrive completely');
    expect(grantRows(fx)).toBe(1);
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await giveHundred(ownerPage, fx);
    await expect(ownerPage.getByRole('status').filter({ hasText: 'had already been recorded' })).toBeVisible();
    expect(grantRows(fx)).toBe(1);
  } finally {
    await fx.close();
  }
});

test('a request or a new benefit whose answer arrives cut short is not made twice either', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: fx.mode, reason: 'Thanks' },
      { 'idempotency-key': 'e2e-cut-short-grant-00001' });
    const { memberPage, ownerPage } = fx;
    await memberPage.reload();
    await memberPage.route('**/api/redemptions', cutShort, { times: 1 });
    await askForCoffee(memberPage);
    await expect(memberPage.getByRole('dialog').getByRole('alert')).toContainText('did not arrive completely');
    await memberPage.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await askForCoffee(memberPage);
    await expect(memberPage.getByRole('status').filter({ hasText: 'had already gone through' })).toBeVisible();
    expect(pendingRequests(fx)).toBe(1);

    await ownerPage.goto(`${fx.origin}/#/team/benefits`);
    await ownerPage.route('**/api/admin/rewards', cutShort, { times: 1 });
    const addTea = async () => {
      await ownerPage.getByLabel('Name', { exact: true }).fill('Tea');
      await ownerPage.getByLabel('Price', { exact: true }).fill('15');
      await ownerPage.getByRole('button', { name: 'Add benefit', exact: true }).click();
    };
    await addTea();
    await expect(ownerPage.getByRole('alert').filter({ hasText: 'did not arrive completely' })).toBeVisible();
    await addTea();
    await expect(ownerPage.getByRole('status').filter({ hasText: 'had already been added' })).toBeVisible();
    expect(fx.db.prepare(`SELECT count(*) AS n FROM rewards WHERE name = 'Tea'`).get().n).toBe(1);
  } finally {
    await fx.close();
  }
});

test('after a lost answer and a reload, the same reward finishes the first attempt, and a second one is still possible', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage } = fx;
    await ownerPage.route('**/api/admin/grants', lost, { times: 1 });
    await giveHundred(ownerPage, fx);
    await expect(ownerPage.getByRole('dialog').getByRole('alert')).toContainText('Could not reach Crumb');
    expect(grantRows(fx)).toBe(1);
    await ownerPage.reload();
    // The page still knows an attempt was left unconfirmed, and says what sending again will do.
    await ownerPage.getByRole('button', { name: 'Give recognition', exact: true }).click();
    await expect(ownerPage.getByRole('dialog')).toContainText('was not confirmed by Crumb');
    await ownerPage.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await giveHundred(ownerPage, fx);
    await expect(ownerPage.getByRole('status').filter({ hasText: 'had already been recorded' })).toBeVisible();
    expect(grantRows(fx)).toBe(1);
    // Once that is settled, the same reward sent on purpose is a second one.
    await giveHundred(ownerPage, fx);
    await expect(ownerPage.getByRole('status').filter({ hasText: 'Sent 100 points to Mina Park.' })).toBeVisible();
    expect(grantRows(fx)).toBe(2);
  } finally {
    await fx.close();
  }
});

test('after a lost answer and a reload, asking for the same benefit finishes the first request', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: fx.mode, reason: 'Thanks' },
      { 'idempotency-key': 'e2e-reload-request-grant-1' });
    const { memberPage } = fx;
    await memberPage.reload();
    await memberPage.route('**/api/redemptions', lost, { times: 1 });
    await askForCoffee(memberPage);
    await expect(memberPage.getByRole('dialog').getByRole('alert')).toContainText('Could not reach Crumb');
    await memberPage.reload();
    await memberPage.getByRole('button', { name: 'Redeem Coffee', exact: true }).click();
    await expect(memberPage.getByRole('dialog')).toContainText('was not confirmed by Crumb');
    await memberPage.getByRole('button', { name: 'Confirm request', exact: true }).click();
    await expect(memberPage.getByRole('status').filter({ hasText: 'had already gone through' })).toBeVisible();
    expect(pendingRequests(fx)).toBe(1);
  } finally {
    await fx.close();
  }
});
