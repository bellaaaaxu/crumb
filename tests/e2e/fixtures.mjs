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

/** Starts an empty Crumb (not set up yet). */
export async function startCrumb() {
  const dir = mkdtempSync(join(tmpdir(), 'crumb-e2e-'));
  const setupToken = randomBytes(32).toString('base64url');
  const setupTokenFile = join(dir, 'setup-token');
  writeFileSync(setupTokenFile, `${setupToken}\n`);
  const db = openDatabase(join(dir, 'crumb.sqlite'));
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  server.on('request', createApp({
    db,
    config: {
      publicOrigin: origin, dataDir: dir, dbPath: join(dir, 'crumb.sqlite'), port: 0, host: '127.0.0.1',
      secureCookies: false, setupTokenFile, trustProxy: false, allowLocalHttp: true,
    },
    log: () => {},
  }));
  return {
    origin,
    db,
    setupToken,
    async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/* A team member opens their personal sign-in link and taps once. */
export async function signInWithLink(page, url) {
  await page.goto(url);
  await page.getByRole('button', { name: 'Sign in on this device', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

export async function signIn(page, origin, username, password = PASSWORD) {
  await page.goto(origin);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

/**
 * An organization with an owner, one member and a "Coffee" benefit, but no
 * rewards yet. Points: unlock every 100, Coffee costs 40. Credit: unlock
 * every $50.00, Coffee costs $12.50. Owner and member use separate browser
 * contexts, so they are two different devices with two different sessions.
 */
export async function provision(browser, { mode = 'points', memberName = 'Mina Park', memberUsername = 'mina' } = {}) {
  const crumb = await startCrumb();
  const api = client(crumb.origin);
  await api.bootstrap();
  const setup = await api.request('POST', '/api/setup', {
    setupToken: crumb.setupToken, username: 'olive', password: PASSWORD, displayName: 'Olive Chen',
    org: orgInput(mode, { name: 'Northside Coffee Co.', ...MODES[mode].org }),
  });
  if (setup.status !== 201) throw new Error(`setup failed: ${JSON.stringify(setup.body)}`);
  api.csrf = setup.body.csrfToken;
  const coffee = await api.request('POST', '/api/admin/rewards',
    { name: 'Coffee', description: 'Any drink from the counter', amount: MODES[mode].coffee, mode, active: true },
    { 'idempotency-key': 'e2e-fixture-coffee-benefit' });
  const invite = await api.request('POST', '/api/admin/invitations',
    { username: memberUsername, displayName: memberName, role: 'member' });

  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const memberPage = await memberContext.newPage();
  await signIn(ownerPage, crumb.origin, 'olive');
  await signInWithLink(memberPage, invite.body.signinUrl);
  return {
    ...crumb,
    api,
    mode,
    memberId: invite.body.user.id,
    coffeeId: coffee.body.id,
    ownerPage,
    memberPage,
    async close() {
      await ownerContext.close();
      await memberContext.close();
      await crumb.close();
    },
  };
}
