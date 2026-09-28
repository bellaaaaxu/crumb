/* Takes the README screenshots from the real app.
 *
 *   node scripts/screenshots.mjs                 writes assets/screenshots/member.png, admin.png and redemptions.png
 *   node scripts/screenshots.mjs --all --out DIR also captures every page, for review
 *
 * It starts a throwaway Crumb on a random port with a temporary database,
 * fills it with an invented team through the same HTTP API the app uses (a
 * movable clock spreads the history over a few weeks), and photographs it
 * in Chromium. Nothing here touches a real instance or real people.
 * Needs the dev dependencies: npm ci && npx playwright install chromium. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { openDatabase } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = resolve(outIndex >= 0 ? args[outIndex + 1] : join(root, 'assets', 'screenshots'));
const captureAll = args.includes('--all');
const PASSWORD = 'sample-password-for-screenshots';
const DAY = 24 * 60 * 60 * 1000;

function jsonClient(origin) {
  const jar = new Map();
  let csrf = null;
  const send = async (method, path, body, extra = {}) => {
    const headers = { origin, ...extra };
    if (csrf) headers['x-csrf-token'] = csrf;
    if (jar.size) headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(data)}`);
    if (data?.csrfToken) csrf = data.csrfToken;
    return data;
  };
  /* The seeding clock jumps days at a time, so sessions expire as they would for real: sign in again. */
  const signIn = async username => {
    const session = await send('GET', '/api/session');
    if (session.user?.username !== username) await send('POST', '/api/login', { username, password: PASSWORD });
  };
  return { send, signIn, change: (path, body) => send('POST', path, body, { 'idempotency-key': randomUUID() }) };
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'crumb-shots-'));
  const setupToken = randomBytes(32).toString('base64url');
  writeFileSync(join(dir, 'setup-token'), setupToken);
  const db = openDatabase(join(dir, 'crumb.sqlite'));
  const time = { now: Date.now() - 42 * DAY };
  const server = createServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  server.on('request', createApp({
    db, clock: () => time.now, log: () => {},
    config: { publicOrigin: origin, dataDir: dir, dbPath: join(dir, 'crumb.sqlite'), port: 0, host: '127.0.0.1',
      secureCookies: false, setupTokenFile: join(dir, 'setup-token'), trustProxy: false, allowLocalHttp: true },
  }));

  const browser = await chromium.launch();
  try {
    const owner = jsonClient(origin);
    await owner.send('GET', '/api/session');
    await owner.send('POST', '/api/setup', {
      setupToken, username: 'olive', password: PASSWORD, displayName: 'Olive Chen',
      org: { name: 'Corner Café (sample team)', mode: 'credit', currency: 'CAD', unitLabel: 'Café credit', threshold: '25.00', locale: 'en',
        welcome: 'Thank you for everything you do on the floor and behind the counter.' },
    });
    for (const [name, description, amount] of [
      ['Coffee on the house', 'Any drink from the bar.', '4.50'],
      ['Lunch from the kitchen', 'One meal, any day this week.', '14.00'],
      ['Bookstore voucher', 'A card for the shop next door.', '25.00'],
      ['Movie night for two', 'Two tickets at the Rio.', '32.00'],
    ]) await owner.change('/api/admin/rewards', { name, description, amount, mode: 'credit', active: true });

    const people = {};
    for (const [username, displayName, role] of [
      ['mina', 'Mina Park', 'member'], ['sam', 'Sam Okafor', 'member'], ['priya', 'Priya Nair', 'admin'],
      ['leo', 'Leo Martins', 'member'], ['dana', 'Dana Reyes', 'member'],
    ]) {
      const invite = await owner.send('POST', '/api/admin/invitations', { username, displayName, role });
      const joiner = jsonClient(origin);
      await joiner.send('GET', '/api/session');
      await joiner.send('POST', '/api/invitations/accept', { token: new URL(invite.invitationUrl).hash.slice(8), password: PASSWORD });
      people[username] = { id: invite.user.id, client: joiner };
    }

    const grants = [
      ['mina', '30.00', 'Stayed late to close when the espresso machine flooded. The morning crew walked into a spotless bar.'],
      ['sam', '20.00', 'Trained two new baristas this month, patiently.'],
      ['mina', '25.00', 'Remembered every regular’s order during the Saturday rush.'],
      ['leo', '15.00', 'Rebuilt the pastry case layout — sales of the morning buns doubled.'],
      ['dana', '25.00', 'Covered three shifts while Sam was away.'],
      ['mina', '40.00', 'Handled the catering order for 80 people without a single mistake.'],
      ['priya', '20.00', 'Sorted out the supplier mix-up before anyone noticed.'],
      ['mina', '30.00', 'Kind, calm and quick with a customer who was having a very bad day.'],
      ['sam', '25.00', 'Fixed the grinder with a paperclip. Legend.'],
    ];
    for (const [username, amount, reason] of grants) {
      time.now += 4 * DAY;
      await owner.signIn('olive');
      await owner.change('/api/admin/grants', { userId: people[username].id, amount, mode: 'credit', reason });
    }

    const mina = people.mina.client;
    time.now += DAY;
    await mina.signIn('mina');
    const rewards = await mina.send('GET', '/api/rewards');
    const coffee = rewards.items.find(item => item.name === 'Coffee on the house');
    const lunch = rewards.items.find(item => item.name === 'Lunch from the kitchen');
    const firstCoffee = await mina.change('/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits });
    await owner.signIn('olive');
    await owner.change(`/api/admin/redemptions/${firstCoffee.redemption.id}/complete`);
    time.now = Date.now() - 2 * 60 * 60 * 1000;
    await mina.signIn('mina');
    await mina.change('/api/redemptions', { rewardId: lunch.id, expectedCostUnits: lunch.costUnits });
    const sam = people.sam.client;
    await sam.signIn('sam');
    await sam.change('/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits });
    time.now = Date.now();

    mkdirSync(outDir, { recursive: true });
    const signIn = async (context, username) => {
      const page = await context.newPage();
      await page.goto(origin);
      await page.getByLabel('Username').fill(username);
      await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
      return page;
    };
    const settle = async page => {
      await page.locator('.loading').first().waitFor({ state: 'detached' }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
    };
    const shoot = async (page, name, fullPage = true) => {
      await settle(page);
      await page.screenshot({ path: join(outDir, `${name}.png`), fullPage, animations: 'disabled' });
      console.log(`wrote ${join(outDir, `${name}.png`)}`);
    };

    // The README images: sized to read clearly at README width rather than whole pages.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const memberPage = await signIn(phone, 'mina');
    await memberPage.getByTestId('available-balance').waitFor();
    await shoot(memberPage, 'member', false);

    const desk = await browser.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const ownerPage = await signIn(desk, 'olive');
    await ownerPage.goto(`${origin}/#/team`);
    await ownerPage.getByRole('button', { name: 'Give recognition', exact: true }).click();
    await ownerPage.getByLabel('Team member').selectOption(people.leo.id);
    await ownerPage.getByLabel('Amount').fill('20.00');
    await ownerPage.getByLabel('Message').fill('Opened on a snow day and kept the whole street caffeinated.');
    await shoot(ownerPage, 'admin', false);
    await ownerPage.keyboard.press('Escape');

    await ownerPage.goto(`${origin}/#/team/redemptions`);
    await ownerPage.getByRole('button', { name: 'Confirm delivery', exact: true }).first().waitFor();
    await shoot(ownerPage, 'redemptions', false);

    if (captureAll) {
      for (const [route, name] of [['#/team', 'team-overview'], ['#/team/members', 'team-members'], ['#/team/benefits', 'team-benefits'],
        ['#/team/history', 'team-history'], ['#/team/activity', 'team-activity'], ['#/settings', 'settings'], ['#/me', 'owner-me']]) {
        await ownerPage.goto(`${origin}/${route}`);
        await shoot(ownerPage, name);
      }
      await shoot(memberPage, 'member-full');
      const phoneOwner = await signIn(await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' }), 'olive');
      await phoneOwner.goto(`${origin}/#/team/members`);
      await shoot(phoneOwner, 'team-members-phone');
      const signedOut = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
      await signedOut.goto(origin);
      await shoot(signedOut, 'sign-in-phone');
      await memberPage.evaluate(() => { document.querySelector('.language select').value = 'zh-CN'; });
      await memberPage.locator('.language select').selectOption('zh-CN');
      await shoot(memberPage, 'member-zh');
    }
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(done => server.close(done));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
