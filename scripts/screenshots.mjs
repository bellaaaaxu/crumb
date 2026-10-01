/* Takes the README screenshots from the real app.
 *
 *   node scripts/screenshots.mjs                 writes assets/screenshots/member.png, admin.png and spend.png
 *   node scripts/screenshots.mjs --all --out DIR also captures every page, for review
 *
 * It starts a throwaway Crumb on a random port with a temporary database,
 * fills it with the invented team from sample-team.mjs, and photographs it in
 * Chromium. Nothing here touches a real instance or real people.
 * Needs the dev dependencies: npm ci && npx playwright install chromium. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { openDatabase } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { DAY, seedSampleTeam } from './sample-team.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = resolve(outIndex >= 0 ? args[outIndex + 1] : join(root, 'assets', 'screenshots'));
const captureAll = args.includes('--all');
const PASSWORD = 'sample-password-for-screenshots';
// A large phone: the member page is made for one, and this is wide enough to read in the README.
const PHONE = { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 };

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
    const { owner, people } = await seedSampleTeam({ origin, setupToken, password: PASSWORD, time });

    mkdirSync(outDir, { recursive: true });
    // The signed-in person's name in the header opens their menu; it is there once a page is.
    const nameMenu = page => page.getByRole('button', { name: /^Menu for / });
    const signIn = async (context, username) => {
      const page = await context.newPage();
      if (people[username]?.role === 'member') {
        // A team member: a fresh personal link, opened on this device.
        const { signinUrl } = await owner.send('POST', `/api/admin/members/${people[username].id}/signin-link`);
        await page.goto(signinUrl);
        await page.getByRole('button', { name: 'Sign in on this device', exact: true }).click();
      } else {
        await page.goto(origin);
        await page.getByLabel('Username').fill(username);
        await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      }
      await nameMenu(page).waitFor();
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
    // Mina's page as she sees it every day: the one-time home-screen tip dismissed, then a
    // fresh load with the oven intro played through and the tile settled.
    const phone = await browser.newContext(PHONE);
    const memberPage = await signIn(phone, 'mina');
    await memberPage.getByTestId('available-balance').waitFor();
    if (captureAll) await shoot(memberPage, 'member-home-tip', false);
    await memberPage.getByRole('button', { name: 'Got it', exact: true }).click();
    await memberPage.reload();
    // The page is drawn only once the intro has left. Then wait for the page to come to rest
    // (the tile sliding in, any pastry dropping) rather than for the intro itself, which a slow
    // machine may never catch on screen, or for a set time. The number does not roll on this
    // load: this device last saw the same balance.
    await memberPage.getByTestId('available-balance').waitFor();
    await memberPage.waitForFunction(() => !document.querySelector('.oven') && document.getAnimations().length === 0);
    await shoot(memberPage, 'member', false);

    // The keypad, with 12.50 keyed in and not confirmed: nothing is recorded.
    await memberPage.getByRole('button', { name: 'I grabbed something', exact: true }).click();
    const keypad = memberPage.getByRole('group', { name: 'Amount keypad' });
    for (const digit of '1250') await keypad.getByRole('button', { name: digit, exact: true }).click();
    await memberPage.getByRole('dialog').getByText('$12.50').first().waitFor();
    await shoot(memberPage, 'spend', false);
    await memberPage.keyboard.press('Escape');

    // The Team page, treating three people at once.
    const desk = await browser.newContext({ ...DESK, reducedMotion: 'reduce' });
    const ownerPage = await signIn(desk, 'olive');
    await ownerPage.goto(`${origin}/#/team`);
    await ownerPage.getByRole('button', { name: 'Treat someone', exact: true }).click();
    const treat = ownerPage.getByRole('dialog');
    for (const name of ['Dana Reyes', 'Leo Martins', 'Sam Okafor']) await treat.getByRole('checkbox', { name, exact: true }).check();
    await treat.getByLabel('How much each').fill('20.00');
    await treat.getByLabel('A few words').fill('Mid-Autumn: thank you for the mooncake rush.');
    await treat.getByRole('button', { name: 'Treat 3 people · $60.00 all in', exact: true }).waitFor();
    await shoot(ownerPage, 'admin', false);
    await ownerPage.keyboard.press('Escape');

    if (captureAll) {
      for (const [route, name] of [['#/team', 'team'], ['#/settings', 'settings'], ['#/me', 'owner-me']]) {
        await ownerPage.goto(`${origin}/${route}`);
        await shoot(ownerPage, name);
      }
      await shoot(memberPage, 'member-full');
      const phoneOwner = await signIn(await browser.newContext({ ...PHONE, reducedMotion: 'reduce' }), 'olive');
      await phoneOwner.goto(`${origin}/#/team`);
      await shoot(phoneOwner, 'team-phone');
      await nameMenu(phoneOwner).click();
      await shoot(phoneOwner, 'menu-phone', false);
      await phoneOwner.keyboard.press('Escape');
      const signedOut = await (await browser.newContext(PHONE)).newPage();
      await signedOut.goto(origin);
      await shoot(signedOut, 'sign-in-phone');
      const { signinUrl } = await owner.send('POST', `/api/admin/members/${people.dana.id}/signin-link`);
      const linkPage = await (await browser.newContext(PHONE)).newPage();
      await linkPage.goto(signinUrl);
      await linkPage.getByRole('button', { name: 'Sign in on this device', exact: true }).waitFor();
      await shoot(linkPage, 'sign-in-link-phone');
      await ownerPage.goto(`${origin}/#/team`);
      await ownerPage.getByRole('button', { name: 'Dana Reyes', exact: true }).click();
      await ownerPage.getByRole('button', { name: 'New sign-in link for Dana Reyes', exact: true }).click();
      await ownerPage.getByRole('dialog').getByRole('button', { name: 'Make a new link', exact: true }).click();
      await ownerPage.locator('.qr-image').waitFor();
      await shoot(ownerPage, 'link-panel-qr');
      await nameMenu(memberPage).click();
      await memberPage.getByLabel('Language').selectOption('zh-CN');
      await memberPage.getByTestId('available-balance').waitFor();
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
