/* Real servers for browser tests: a fresh database per call, set up through
 * the same HTTP API a person would use. Only invented people and data. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { expect } from '@playwright/test';
import { openDatabase } from '../../server/db.mjs';
import { createApp } from '../../server/app.mjs';
import { PASSWORD, client, orgInput } from '../helpers.mjs';

export { PASSWORD };

const MODES = {
  points: { org: { threshold: '100' }, coffee: '40' },
  credit: { org: { threshold: '50.00' }, coffee: '12.50' },
};

/**
 * Starts an empty Crumb (not set up yet). Its clock is real time unless a test sets
 * `time.now`: entries are then stamped at that moment, as on an earlier day.
 */
export async function startCrumb() {
  const dir = mkdtempSync(join(tmpdir(), 'crumb-e2e-'));
  const setupToken = randomBytes(32).toString('base64url');
  const setupTokenFile = join(dir, 'setup-token');
  writeFileSync(setupTokenFile, `${setupToken}\n`);
  const db = openDatabase(join(dir, 'crumb.sqlite'));
  const time = { now: null };
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  server.on('request', createApp({
    db,
    config: {
      publicOrigin: origin, dataDir: dir, dbPath: join(dir, 'crumb.sqlite'), port: 0, host: '127.0.0.1',
      secureCookies: false, setupTokenFile, trustProxy: false, allowLocalHttp: true,
    },
    clock: () => time.now ?? Date.now(),
    log: () => {},
  }));
  return {
    origin,
    db,
    setupToken,
    time,
    async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/* The signed-in person's name in the header, the button that opens their menu. Found by its
 * accessible name, so the tests do not depend on how the header is laid out. */
export const nameMenu = page => page.getByRole('button', { name: /^Menu for / });

/* A team member opens their personal sign-in link and taps once. */
export async function signInWithLink(page, url) {
  await page.goto(url);
  await page.getByRole('button', { name: 'Sign in on this device', exact: true }).click();
  await expect(nameMenu(page)).toBeVisible();
}

export async function signIn(page, origin, username, password = PASSWORD) {
  await page.goto(origin);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(nameMenu(page)).toBeVisible();
}

/* Opens the name menu and signs out (a team member confirms the dialog). */
export async function signOut(page, { member = false } = {}) {
  await nameMenu(page).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  if (member) await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

/* Keys an amount into the sheet: "1250" is $12.50 in credit mode, 40 points in points mode.
 * Also takes a list of key names, such as ['Delete last digit']. */
export async function keyIn(page, digits) {
  const keypad = page.getByRole('group', { name: 'Amount keypad' });
  for (const digit of digits) await keypad.getByRole('button', { name: digit, exact: true }).click();
}

/* A benefit's own button on the member page. It is named by its visible words, "I’ll have
 * this", for voice control; the row it sits in says which benefit. */
export function askFor(page, benefit) {
  return page.locator('.benefit').filter({ has: page.getByText(benefit, { exact: true }) })
    .getByRole('button', { name: 'I’ll have this', exact: true });
}

/* Opens a person's row on the Team page (their actions sit in it); leaves an open row open. */
export async function openPerson(page, name) {
  const row = page.getByRole('button', { name, exact: true });
  if (await row.getAttribute('aria-expanded') !== 'true') await row.click();
  return page.locator(`#${await row.getAttribute('aria-controls')}`);
}

/**
 * An organization with an owner and one member, but no rewards yet. `spending` is how the
 * team spends: 'confirm' (the default) also adds a "Coffee" benefit to ask for; 'self' has
 * no benefits. Points: unlock every 100, Coffee costs 40. Credit: unlock every $50.00,
 * Coffee costs $12.50. Owner and member use separate browser contexts, so they are two
 * different devices with two different sessions. Both ask for less motion unless a test
 * says otherwise, so the intro never stands in front of a page a test is about to use.
 */
export async function provision(browser, {
  mode = 'points', spending = 'confirm', memberName = 'Mina Park', memberUsername = 'mina', reducedMotion = 'reduce',
} = {}) {
  const crumb = await startCrumb();
  const api = client(crumb.origin);
  await api.bootstrap();
  const setup = await api.request('POST', '/api/setup', {
    setupToken: crumb.setupToken, username: 'olive', password: PASSWORD, displayName: 'Olive Chen',
    org: orgInput(mode, { name: 'Northside Coffee Co.', spending, ...MODES[mode].org }),
  });
  if (setup.status !== 201) throw new Error(`setup failed: ${JSON.stringify(setup.body)}`);
  api.csrf = setup.body.csrfToken;
  // A team that spends on trust has no benefit list, and the server takes no requests from it.
  const coffee = spending === 'confirm'
    ? await api.request('POST', '/api/admin/rewards',
      { name: 'Coffee', description: 'Any drink from the counter', amount: MODES[mode].coffee, mode, active: true },
      { 'idempotency-key': 'e2e-fixture-coffee-benefit' })
    : null;
  const invite = await api.request('POST', '/api/admin/invitations',
    { username: memberUsername, displayName: memberName, role: 'member' });

  const ownerContext = await browser.newContext({ reducedMotion });
  const memberContext = await browser.newContext({ reducedMotion });
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  await signIn(ownerPage, crumb.origin, 'olive');
  await signInWithLink(memberPage, invite.body.signinUrl);
  return {
    ...crumb,
    api,
    mode,
    memberId: invite.body.user.id,
    memberLink: invite.body.signinUrl,
    coffeeId: coffee ? coffee.body.id : null,
    ownerPage,
    memberPage,
    async close() {
      await ownerContext.close();
      await memberContext.close();
      await crumb.close();
    },
  };
}
