import { test, expect } from '@playwright/test';
import { PASSWORD, provision, startCrumb } from './fixtures.mjs';
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

test('a new team member gets a sign-in link, opens it on their phone and is in, with no password', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage } = fx;
    await ownerPage.getByRole('link', { name: 'Members', exact: true }).click();
    await ownerPage.getByLabel('Name', { exact: true }).fill('Sam Okafor');
    await ownerPage.getByLabel('Username').fill('sam');
    await ownerPage.getByRole('button', { name: 'Create invitation', exact: true }).click();
    const link = await ownerPage.getByLabel('Sign-in link', { exact: true }).inputValue();
    expect(link).toMatch(new RegExp(`^${fx.origin}/#signin=[A-Za-z0-9_-]{43}$`));

    // The owner trying the link on their own laptop is told it would sign them out; looking uses nothing up.
    const peek = await ownerPage.context().newPage();
    await peek.goto(link);
    await expect(peek.getByText('This link signs in Sam Okafor on this device')).toBeVisible();
    await expect(peek.getByText('You are signed in here as Olive Chen')).toBeVisible();
    await peek.close();

    const context = await browser.newContext();
    const phone = await context.newPage();
    await phone.goto(link);
    await expect(phone).toHaveURL(`${fx.origin}/`);
    await expect(phone.getByText('This link signs in Sam Okafor on this device')).toBeVisible();
    await expect(phone.getByText(/You are signed in here/)).toHaveCount(0);
    await phone.getByRole('button', { name: 'Sign in on this device', exact: true }).click();
    await expect(phone.getByTestId('available-balance')).toHaveText('0 points');

    // Used once, the link does nothing more: whoever opens it again is told so and sent to sign-in.
    const again = await (await browser.newContext()).newPage();
    await again.goto(link);
    await expect(again.getByRole('alert')).toContainText('already used');
    await again.getByRole('button', { name: 'Go to sign in', exact: true }).click();
    await expect(again.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await again.context().close();

    // A lost or new phone: a new link from the admin signs the old one out at once, so it asks first.
    await ownerPage.getByRole('button', { name: 'New sign-in link for Sam Okafor', exact: true }).click();
    const confirm = ownerPage.getByRole('dialog');
    await expect(confirm).toContainText('signed out on every device');
    await confirm.getByRole('button', { name: 'Make a new link', exact: true }).click();
    await expect(ownerPage.getByLabel('Sign-in link', { exact: true })).toBeVisible();
    await expect(ownerPage.locator('.link-panel')).toContainText('signed out everywhere else');
    await phone.reload();
    await expect(phone.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(phone.getByText(/personal link/)).toBeVisible();
    await context.close();
  } finally {
    await fx.close();
  }
});

test('an admin invitation is opened on another device and used to set a password', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { ownerPage } = fx;
    await ownerPage.getByRole('link', { name: 'Members', exact: true }).click();
    await ownerPage.getByLabel('Name', { exact: true }).fill('Sam Okafor');
    await ownerPage.getByLabel('Username').fill('sam');
    await ownerPage.getByLabel('Role', { exact: true }).selectOption('admin');
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
    // An admin starts on the team pages, and makes sign-in links for team members, but changes no roles.
    await page.getByRole('link', { name: 'Members', exact: true }).click();
    await expect(page.getByRole('button', { name: 'New sign-in link for Mina Park', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change role for Mina Park', exact: true })).toHaveCount(0);
    await context.close();
  } finally {
    await fx.close();
  }
});

test('a deactivated member is signed out on their next action', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    await fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount: '100', mode: fx.mode, reason: 'Before leaving' },
      { 'idempotency-key': 'e2e-deactivated-member-grant' });
    await fx.memberPage.reload();
    await expect(fx.memberPage.getByTestId('available-balance')).toHaveText('100 points');
    await fx.ownerPage.getByRole('link', { name: 'Members', exact: true }).click();
    await fx.ownerPage.getByRole('button', { name: 'Deactivate Mina Park', exact: true }).click();
    await fx.ownerPage.getByRole('button', { name: 'Deactivate', exact: true }).click();
    await expect(fx.ownerPage.getByText('Deactivated', { exact: true })).toBeVisible();
    // The phone still shows the old page; the next thing Mina does takes her to sign-in instead.
    await fx.memberPage.getByRole('button', { name: 'Redeem Coffee', exact: true }).click();
    await fx.memberPage.getByRole('button', { name: 'Confirm request', exact: true }).click();
    await expect(fx.memberPage.getByText('You have been signed out')).toBeVisible();
    await expect(fx.memberPage.getByText(/personal link/)).toBeVisible();
    await expect(fx.memberPage.getByTestId('available-balance')).toHaveCount(0);
    const { body } = await fx.api.request('GET', '/api/admin/redemptions?status=pending');
    expect(body.items).toHaveLength(0);

    // No sign-in link while deactivated; once back, the admin is told they need one.
    await expect(fx.ownerPage.getByRole('button', { name: 'New sign-in link for Mina Park', exact: true })).toHaveCount(0);
    await fx.ownerPage.getByRole('button', { name: 'Reactivate Mina Park', exact: true }).click();
    await expect(fx.ownerPage.getByRole('status').filter({ hasText: 'Mina Park was reactivated' })).toContainText('new sign-in link');
    await expect(fx.ownerPage.getByRole('button', { name: 'New sign-in link for Mina Park', exact: true })).toBeVisible();
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
    await expect(ownerPage.getByRole('status').filter({ hasText: 'now signs in with a password' })).toBeVisible();
    await expect(ownerPage.getByRole('button', { name: 'Password reset link for Mina Park', exact: true })).toBeVisible();
    await expect(ownerPage.getByRole('button', { name: 'New sign-in link for Mina Park', exact: true })).toHaveCount(0);
    expect(await roleOf(fx.memberId)).toBe('admin');

    // Between admin and owner the password stays, but the person is still signed out: say so.
    await ownerPage.getByRole('button', { name: 'Change role for Mina Park', exact: true }).click();
    await dialog.getByRole('radio', { name: /^Owner/ }).check();
    await dialog.getByRole('button', { name: 'Change role', exact: true }).click();
    await expect(ownerPage.getByRole('status').filter({ hasText: 'changed to Owner' })).toContainText('was signed out');
    expect(await roleOf(fx.memberId)).toBe('owner');

    // Someone who has not joined yet: the link made for the old role stops working.
    const invite = await fx.api.request('POST', '/api/admin/invitations', { username: 'sam', displayName: 'Sam Lee', role: 'member' });
    await ownerPage.reload();
    await ownerPage.getByRole('button', { name: 'Change role for Sam Lee', exact: true }).click();
    await dialog.getByRole('radio', { name: /^Admin/ }).check();
    await dialog.getByRole('button', { name: 'Change role', exact: true }).click();
    await expect(ownerPage.getByRole('status').filter({ hasText: 'make a new one for them' })).toBeVisible();
    const joiner = client(fx.origin);
    await joiner.bootstrap();
    const used = await joiner.request('POST', '/api/signin/accept', { token: tokenFrom(invite.body.signinUrl, 'signin') });
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

/* ---------------------------------------------------------------- sign-in links, the rough edges */

test('a team member is asked before signing out, since only a new link gets them back in', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const { memberPage, ownerPage } = fx;
    await memberPage.getByRole('button', { name: 'Sign out', exact: true }).click();
    const dialog = memberPage.getByRole('dialog');
    await expect(dialog).toContainText('new link from your admin');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(memberPage.getByTestId('available-balance')).toBeVisible();
    await memberPage.getByRole('button', { name: 'Sign out', exact: true }).click();
    await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(memberPage.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

    // Owners and admins have a password to come back with: they sign out at once.
    await ownerPage.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(ownerPage.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(ownerPage.getByRole('dialog')).toHaveCount(0);
  } finally {
    await fx.close();
  }
});

test('a used link opened again on the phone it signed in simply opens Crumb', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    // Tapping the old link in the chat again, as people do to open the app.
    const again = await fx.memberPage.context().newPage();
    await again.goto(fx.memberLink);
    await expect(again.getByTestId('available-balance')).toHaveText('0 points');
    await expect(again.getByRole('status').filter({ hasText: 'already been used' })).toContainText('Mina Park');
  } finally {
    await fx.close();
  }
});

test('a tap whose answer is cut short, though the phone was signed in, goes straight in', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const invite = await fx.api.request('POST', '/api/admin/invitations', { username: 'sam', displayName: 'Sam Lee', role: 'member' });
    const context = await browser.newContext();
    const phone = await context.newPage();
    await phone.route('**/api/signin/accept', cutShort);
    await phone.goto(invite.body.signinUrl);
    await phone.getByRole('button', { name: 'Sign in on this device', exact: true }).click();
    await expect(phone.getByTestId('available-balance')).toHaveText('0 points');
    await context.close();
  } finally {
    await fx.close();
  }
});

test('a tap whose answer is lost says what to do, then that the link is used, with the way out focused', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const invite = await fx.api.request('POST', '/api/admin/invitations', { username: 'sam', displayName: 'Sam Lee', role: 'member' });
    const context = await browser.newContext();
    const phone = await context.newPage();
    // The server gets the tap and uses the link, but no answer and no cookie reach the phone.
    await phone.route('**/api/signin/accept', async route => {
      const request = route.request();
      const headers = await request.allHeaders();
      await fetch(request.url(), {
        method: 'POST', body: request.postData(),
        headers: { 'content-type': headers['content-type'], cookie: headers.cookie, origin: headers.origin, 'x-csrf-token': headers['x-csrf-token'] },
      });
      await route.abort('connectionreset');
    }, { times: 1 });
    await phone.goto(invite.body.signinUrl);
    const tap = phone.getByRole('button', { name: 'Sign in on this device', exact: true });
    await tap.click();
    await expect(phone.getByRole('alert')).toContainText('did not answer');
    await expect(phone.getByRole('alert')).not.toContainText('safe');
    await tap.click();
    await expect(phone.getByRole('alert')).toContainText('already used');
    await expect(phone.getByRole('button', { name: 'Go to sign in', exact: true })).toBeFocused();
    await expect(tap).toHaveCount(0);
    await context.close();
  } finally {
    await fx.close();
  }
});

test('a new sign-in link for someone who has not joined asks first, and cancelling changes nothing', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const invite = await fx.api.request('POST', '/api/admin/invitations', { username: 'sam', displayName: 'Sam Lee', role: 'member' });
    const { ownerPage } = fx;
    await ownerPage.goto(`${fx.origin}/#/team/members`);
    const dialog = ownerPage.getByRole('dialog');
    await ownerPage.getByRole('button', { name: 'New sign-in link for Sam Lee', exact: true }).click();
    await expect(dialog).toContainText('current link stops working');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    const visitor = client(fx.origin);
    await visitor.bootstrap();
    const preview = await visitor.request('POST', '/api/signin/preview', { token: tokenFrom(invite.body.signinUrl, 'signin') });
    expect(preview.status, 'the first link still works').toBe(200);

    await ownerPage.getByRole('button', { name: 'New sign-in link for Sam Lee', exact: true }).click();
    await dialog.getByRole('button', { name: 'Make a new link', exact: true }).click();
    const panel = ownerPage.locator('.link-panel');
    await expect(panel).toContainText('They open it on their phone');
    await expect(panel).not.toContainText('signed out');
  } finally {
    await fx.close();
  }
});

test('a link page replaced while it loads never shows or uses the old link', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'points' });
  try {
    const first = await fx.api.request('POST', '/api/admin/invitations', { username: 'sam', displayName: 'Sam Okafor', role: 'member' });
    const second = await fx.api.request('POST', '/api/admin/invitations', { username: 'lee', displayName: 'Lee Chan', role: 'member' });
    const context = await browser.newContext();
    const page = await context.newPage();
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let heldRequest = null;
    await page.route('**/api/signin/preview', async route => {
      if (!heldRequest) {
        heldRequest = route.request();
        await held;
      }
      await route.continue();
    });
    await page.goto(first.body.signinUrl);
    await page.evaluate(hash => { window.location.hash = hash; }, new URL(second.body.signinUrl).hash);
    await expect(page.getByText('This link signs in Lee Chan on this device')).toBeVisible();
    const finished = page.waitForEvent('requestfinished', request => request === heldRequest);
    release();
    await finished;
    // Let the page handle that late answer before looking.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 50)))));
    await expect(page.getByText('Sam Okafor')).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign in on this device', exact: true }).click();
    await expect(page.locator('.who')).toHaveText('Lee Chan');
    await context.close();
  } finally {
    await fx.close();
  }
});
