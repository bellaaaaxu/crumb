/* Takes the README screenshots from the real app.
 *
 *   node scripts/screenshots.mjs                 writes assets/screenshots/member.png, admin.png and spend.png
 *   node scripts/screenshots.mjs --all --out DIR also captures every page, for review
 *   node scripts/screenshots.mjs --theme bakery --all --out DIR
 *                                                the same, for the team on the Bakery collection theme.
 *                                                The README stays on Pastry shop: without --out, another
 *                                                theme's pictures go to a new crumb-screenshots-<theme>-*
 *                                                folder in the temporary folder, never to assets/screenshots;
 *                                                each "wrote" line names it.
 *
 * It starts a throwaway Crumb on a random port with a temporary database,
 * fills it with the invented team from sample-team.mjs, and photographs it in
 * Chromium. With --all it then starts a second one for the views the sample team
 * cannot show (see captureReviewViews). Nothing here touches a real instance or real people.
 * Needs the dev dependencies: npm ci && npx playwright install chromium. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { openDatabase } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { DEFAULT_THEME, THEME_IDS } from '../server/themes.mjs';
import { DAY, THEME_OPTION_HINT, jsonClient, seedSampleTeam } from './sample-team.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'sample-password-for-screenshots';
// A large phone: the member page is made for one, and this is wide enough to read in the README.
const PHONE = { viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 };
// The signed-in person's name in the header opens their menu; it is there once a page is.
const nameMenu = page => page.getByRole('button', { name: /^Menu for / });

/* The folder the pictures go to: --out as given, made if it is not there, or the README's for
 * Pastry shop. The README shows Pastry shop: another theme's pictures never land in its folder
 * by default, but in a new folder in the temporary directory, crumb-screenshots-<theme>-
 * and six random characters, made here and nowhere else. A fixed name there could be a folder
 * someone else on the machine made first (a shared /tmp), holding links that would make the
 * pictures overwrite files of whoever runs this, or pictures swapped before anyone looks. */
export function outputFolder(theme, out) {
  if (out === undefined && theme !== DEFAULT_THEME) return mkdtempSync(join(tmpdir(), `crumb-screenshots-${theme}-`));
  const dir = resolve(out ?? join(root, 'assets', 'screenshots'));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/* An invented logo for the review pictures, as a PNG the server takes like any upload: a
 * rounded teal block with a ring and two bars, wider than it is tall and with see-through
 * corners, so the pictures show the ground a logo sits on. No words: it names no business. */
export async function sampleLogo() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">'
    + '<rect x="10" y="10" width="300" height="180" rx="40" fill="#2f6f6a"/>'
    + '<circle cx="110" cy="100" r="52" fill="none" stroke="#f4efe2" stroke-width="16"/>'
    + '<rect x="182" y="64" width="88" height="20" rx="10" fill="#f4efe2"/>'
    + '<rect x="182" y="116" width="60" height="20" rx="10" fill="#f2b84b"/>'
    + '</svg>';
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/* A throwaway Crumb on a random local port, with a database and a setup code of its own in a
 * new temporary folder, on the clock given. close() stops it and deletes the folder. */
async function startCrumb(clock) {
  const dir = mkdtempSync(join(tmpdir(), 'crumb-shots-'));
  const setupToken = randomBytes(32).toString('base64url');
  writeFileSync(join(dir, 'setup-token'), setupToken);
  const db = openDatabase(join(dir, 'crumb.sqlite'));
  const server = createServer();
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  server.on('request', createApp({
    db, clock, log: () => {},
    config: { publicOrigin: origin, dataDir: dir, dbPath: join(dir, 'crumb.sqlite'), port: 0, host: '127.0.0.1',
      secureCookies: false, setupTokenFile: join(dir, 'setup-token'), trustProxy: false, allowLocalHttp: true },
  }));
  return {
    origin,
    setupToken,
    async close() {
      server.closeAllConnections();
      await new Promise(done => server.close(done));
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/* What a theme's review needs and the sample team cannot show, from a second team on a fresh
 * Crumb of its own, on the same theme, in this order: the setup page while there is no team yet,
 * this theme's card chosen; Settings before the first treat, every theme card still to be chosen
 * (the sample team has sent treats, so its Settings shows them locked), with an uploaded logo in
 * the header and as the preview; a benefit with an icon on the Team page, and the icon picker;
 * the logo on the sign-in page, then a wrong password's form error; the focus ring on a member's
 * shelf; a toast and an error toast; the benefit and "Your requests" with a badge of each colour
 * on the member's page; and the logo in its header. The people and the team's settings are the
 * sample team's, except that this team confirms what people spend, so it has a benefit list;
 * the benefit, its description and the decline reason are the browser tests'
 * (tests/e2e/fixtures.mjs, tests/e2e/product.spec.mjs). */
async function captureReviewViews({ browser, theme, shoot, shootPart }) {
  const crumb = await startCrumb(() => Date.now());
  // An uploaded logo is drawn once its picture has loaded, not as soon as its box is there.
  const logoDrawn = (page, selector) => page.waitForFunction(
    found => [...document.querySelectorAll(found)].some(image => image.complete && image.naturalWidth > 0), selector);
  try {
    const desk = await browser.newContext({ ...DESK, reducedMotion: 'reduce' });

    // No team yet: the setup page, with this theme's card chosen. The page stays as it is;
    // the card shows its own theme.
    const setupPage = await desk.newPage();
    await setupPage.goto(crumb.origin);
    await setupPage.locator(`input[name="theme"][value="${theme}"]`).check();
    await shoot(setupPage, `setup-${theme}-card`);
    await setupPage.close();

    // The team, on this theme, with one benefit whose icon is the theme's second item (the
    // first is the mascot) and one team member, who joins with her link. No treat yet.
    const owner = jsonClient(crumb.origin, PASSWORD);
    await owner.send('GET', '/api/session');
    await owner.send('POST', '/api/setup', {
      setupToken: crumb.setupToken, username: 'olive', password: PASSWORD, displayName: 'Olive Chen',
      org: { name: 'Corner Café (sample team)', mode: 'credit', currency: 'CAD', unitLabel: 'Café credit', threshold: '25.00', locale: 'en',
        welcome: 'Thank you for everything you do on the floor and behind the counter.', spending: 'confirm', theme },
    });
    const { theme: { keys } } = await owner.send('GET', '/api/admin/rewards');
    const coffee = await owner.change('/api/admin/rewards',
      { name: 'Coffee', description: 'Any drink from the counter', amount: '12.50', mode: 'credit', active: true, iconKey: keys[1] });
    const invite = await owner.send('POST', '/api/admin/invitations', { username: 'mina', displayName: 'Mina Park', role: 'member' });
    const mina = jsonClient(crumb.origin, PASSWORD);
    await mina.send('GET', '/api/session');
    await mina.send('POST', '/api/signin/accept', { token: new URL(invite.signinUrl).hash.slice('#signin='.length) });

    // The owner signs in and uploads the logo in Settings, as a person would. Drawn afresh, the
    // page has it in the header and as the preview, and every theme card can still be chosen.
    const ownerPage = await desk.newPage();
    await ownerPage.goto(crumb.origin);
    await ownerPage.getByLabel('Username').fill('olive');
    await ownerPage.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await ownerPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await nameMenu(ownerPage).waitFor();
    await ownerPage.goto(`${crumb.origin}/#/settings`);
    await ownerPage.getByLabel('Upload a logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await sampleLogo() });
    await ownerPage.locator('.logo-preview').waitFor();
    await ownerPage.reload();
    await ownerPage.getByRole('region', { name: 'Who did what', exact: true }).waitFor();
    await logoDrawn(ownerPage, '.logo-preview');
    await logoDrawn(ownerPage, '.brand-logo');
    await shoot(ownerPage, 'settings-cards-open');
    // The same page as it first shows on a laptop: the Logo tile with its preview, by the header.
    await ownerPage.getByRole('region', { name: 'Logo', exact: true }).scrollIntoViewIfNeeded();
    await shoot(ownerPage, 'logo-settings', false);

    // The Team page: the benefit in the list with its icon; then its icon picker, the icon chosen.
    await ownerPage.goto(`${crumb.origin}/#/team`);
    await ownerPage.locator('.row-icon canvas').waitFor();
    await logoDrawn(ownerPage, '.brand-logo');
    await shoot(ownerPage, 'benefit-team');
    await ownerPage.getByRole('button', { name: 'Edit Coffee', exact: true }).click();
    await ownerPage.getByRole('dialog').locator('.icon-picker').scrollIntoViewIfNeeded();
    await shoot(ownerPage, 'icon-picker', false);
    await ownerPage.keyboard.press('Escape');

    // The sign-in page on a phone, with the logo; then a wrong password: the form error, and
    // the keyboard back in the emptied password field.
    const signedOut = await (await browser.newContext({ ...PHONE, reducedMotion: 'reduce' })).newPage();
    await signedOut.goto(crumb.origin);
    await logoDrawn(signedOut, '.auth-logo');
    await shoot(signedOut, 'logo-sign-in');
    await signedOut.getByLabel('Username').fill('olive');
    await signedOut.getByLabel('Password', { exact: true }).fill(`${PASSWORD}-wrong`);
    await signedOut.getByRole('button', { name: 'Sign in', exact: true }).click();
    await signedOut.locator('.form-error:not([hidden])').waitFor();
    await shoot(signedOut, 'form-error');

    // The first treat: from here on the theme is fixed, and every picture that needed the cards
    // open is taken. Then two requests for the benefit, one confirmed and one declined, through
    // Mina's client; her phone below signs in with a new link, which signs that client out.
    await owner.change('/api/admin/grants', { userId: invite.user.id, amount: '50.00', mode: 'credit',
      reason: 'Kind, calm and quick with a customer who was having a very bad day.' });
    const ask = () => mina.change('/api/redemptions', { rewardId: coffee.id, expectedCostUnits: coffee.costUnits });
    const confirmed = await ask();
    await owner.change(`/api/admin/redemptions/${confirmed.redemption.id}/complete`, {});
    const declined = await ask();
    await owner.change(`/api/admin/redemptions/${declined.redemption.id}/reject`, { reason: 'The machine is broken this week' });

    const { signinUrl } = await owner.send('POST', `/api/admin/members/${invite.user.id}/signin-link`);
    const memberPage = await (await browser.newContext({ ...PHONE, reducedMotion: 'reduce' })).newPage();
    await memberPage.goto(signinUrl);
    await memberPage.getByRole('button', { name: 'Sign in on this device', exact: true }).click();
    await memberPage.getByTestId('available-balance').waitFor();
    await memberPage.getByRole('button', { name: 'Got it', exact: true }).click();
    // From the keyboard, to the first item on the shelf: it shows its ring and its name.
    const firstItem = memberPage.getByRole('list', { name: 'Your collection', exact: true }).getByRole('button').first();
    for (let presses = 0; !(await firstItem.evaluate(item => item === document.activeElement)); presses += 1) {
      if (presses === 20) throw new Error('Tab did not reach the first item on the shelf');
      await memberPage.keyboard.press('Tab');
    }
    await shoot(memberPage, 'focus-ring', false);

    // The third request, from the page: its toast.
    await memberPage.getByRole('button', { name: 'I’ll have this', exact: true }).click();
    await memberPage.getByRole('button', { name: 'Yes, please', exact: true }).click();
    await memberPage.locator('.toast-info').waitFor();
    await shoot(memberPage, 'toast', false);

    // An error toast: the price changes while Mina is asking, so nothing is asked for.
    await memberPage.reload();
    await memberPage.getByTestId('available-balance').waitFor();
    await memberPage.getByRole('button', { name: 'I’ll have this', exact: true }).click();
    await owner.send('PATCH', `/api/admin/rewards/${coffee.id}`, { amount: '13.00', mode: 'credit' });
    await memberPage.getByRole('button', { name: 'Yes, please', exact: true }).click();
    await memberPage.locator('.toast-error').waitFor();
    await shoot(memberPage, 'toast-error', false);

    // Mina's page, whole: the logo in the header, the benefit with its icon, and "Your requests"
    // with a badge of each colour (waiting, declined, completed); then those two parts alone.
    await memberPage.reload();
    await memberPage.getByText('Awaiting confirmation', { exact: true }).waitFor();
    await logoDrawn(memberPage, '.brand-logo');
    await shoot(memberPage, 'benefit-member');
    await shootPart(memberPage.getByRole('region', { name: 'Your requests', exact: true }), 'badges');
    await shootPart(memberPage.locator('header.topbar'), 'logo-header');
  } finally {
    await crumb.close();
  }
}

async function main({ theme, out, all: captureAll }) {
  const time = { now: Date.now() - 42 * DAY };
  const crumb = await startCrumb(() => time.now);
  const { origin, setupToken } = crumb;

  const browser = await chromium.launch();
  try {
    const { owner, people } = await seedSampleTeam({ origin, setupToken, password: PASSWORD, time, theme });

    const outDir = outputFolder(theme, out);
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
    // One part of a page, cut to its own box.
    const shootPart = async (part, name) => {
      await settle(part.page());
      await part.screenshot({ path: join(outDir, `${name}.png`), animations: 'disabled' });
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
      await captureReviewViews({ browser, theme, shoot, shootPart });
    }
  } finally {
    await browser.close();
    await crumb.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // The same option parser as demo.mjs: --theme bakery and --theme=bakery both work, and an
  // unknown option is refused.
  const { values } = parseArgs({ options: {
    theme: { type: 'string', default: DEFAULT_THEME }, out: { type: 'string' }, all: { type: 'boolean', default: false },
  } });
  if (!THEME_IDS.includes(values.theme)) {
    console.error(THEME_OPTION_HINT);
    process.exit(2);
  }
  main(values).catch(error => {
    console.error(error);
    process.exit(1);
  });
}
