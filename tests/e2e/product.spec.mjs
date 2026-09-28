import { test, expect } from '@playwright/test';
import { PASSWORD, provision, signIn, startCrumb } from './fixtures.mjs';

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
