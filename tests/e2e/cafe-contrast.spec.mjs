/* Every café text, focus ring and input border meets WCAG AA as the page draws it (spec §13
 * "Every café text passes AA", §4.6's notes, assumption 24): the café member page with its
 * keypad, toasts and error toasts, the Team page with the treat dialog open, Settings (locked,
 * with form errors, and with all three cards selectable), the sign-in pages, the oven intro, the
 * café card on the light setup page, and the public demo's café.
 *
 * Each check takes the colour the browser computed and the first opaque ground behind it (every
 * stop of a gradient), multiplies in the opacity of the element and its ancestors, blends the
 * colour onto the ground by that alpha, and computes; tests/contrast.mjs does the arithmetic.
 * Text must reach 4.5:1, a focus ring and an input border 3:1. Inactive controls and what is in
 * them are exempt from the text check (WCAG 1.4.3 does not cover them): every disabled control, a
 * locked theme card. A disabled field's border is still checked (spec §4.6 counts paper, a
 * disabled field's ground), except a disabled select's, which the browser itself fades. The
 * moment of signing out is skipped. Every page here is also watched for Content Security Policy
 * violations and console errors. Every person and team here is invented. */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { blend, contrast, parseColour, stops } from '../contrast.mjs';
import { client, tokenFrom } from '../helpers.mjs';
import { keyIn, nameMenu, provision, signIn, startCrumb } from './fixtures.mjs';

const DEMO = pathToFileURL(resolve('index.html')).href;
/* Café's list file: its keys in rotation order, the mascot first. */
const CAFE = JSON.parse(readFileSync(resolve('themes/cafe.json'), 'utf8'));
const TEAM = 'Northside Coffee Co.';
const CAFE_CARD = 'Café · 24 coffees and sweets';
const TEXT_MIN = 4.5;
const EDGE_MIN = 3;

/* No text is checked in an inactive control or anything in it (WCAG 1.4.3 leaves them out): every
 * disabled control, which covers the spec's .btn:disabled, .grant:disabled and .btn-confirm:disabled
 * and the demo's .act:disabled and .quest-head:disabled; and a locked theme card, whose radio is
 * the disabled control. The moment of signing out is skipped too. */
const EXEMPT = [':disabled', '.radio:has(input:disabled)', '.signing-out'];

/* Field borders are checked on disabled fields too: spec §4.6 counts paper, a disabled field's
 * ground, among the grounds a border must reach 3:1 on. Not a disabled select's: Chromium's own
 * stylesheet fades it to opacity 0.7, which puts the café's border at 2.38:1 on paper (the
 * locked currency on Settings); that is put to the maintainer at gate 3. */
const EDGE_EXEMPT = ['select:disabled', '.radio:has(input:disabled)', '.signing-out'];

/* While the demo's tour plays itself, its counter fades: in the café to 0.8, not Pastry shop's and
 * Bakery's 0.72, so that its text still reads. It is checked as it is then, faded. */
const PLAYING_COUNTER_OPACITY = '0.8';

let requests = 0;
const key = () => ({ 'idempotency-key': `e2e-cafe-contrast-${String(++requests).padStart(4, '0')}` });

/* CSP violations and console errors from the next page load on. The answer a test cuts off on
 * purpose is logged by the browser too: `expected` is a piece of its line, left out. */
async function watch(page) {
  const problems = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => {
      window.__cspViolations = [...(window.__cspViolations ?? []), `${event.violatedDirective} ${event.blockedURI}`];
    });
  });
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  page.on('pageerror', error => problems.push(error.message));
  return async (expected = null) => [...problems, ...await page.evaluate(() => window.__cspViolations ?? [])]
    .filter(line => expected === null || !line.includes(expected));
}

/* Lets every transition and every animation that ends finish first (a toast slides in, a tile
 * fades in), so the colours read are the ones that stay. One that never ends is left running.
 * When the theme goes on, every element's colour changes and runs a transition (0.01 ms with
 * less motion asked for), and an element's starts only once its parent's has ended: so this
 * waits round after round until none is left. With the page's clock stopped (the intros),
 * `frames` is false: no frame callback would come. */
async function settle(page, { frames = true } = {}) {
  await page.evaluate(async withFrames => {
    for (let round = 0; round < 100; round += 1) {
      const ending = document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity);
      if (!ending.length) break;
      await Promise.all(ending.map(animation => animation.finished.catch(() => {})));
    }
    if (withFrames) await new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
  }, frames);
}

/* Runs in the page. Without `ring`: every visible text under `root` (an element with text of its
 * own, or a field showing a value) with its colour, and every visible text field and select with
 * its border colour, each with what lies behind it; and, for each selector in `canaries`, how
 * many of those texts are in it. With `ring`: the focus ring of the control that has the
 * keyboard (on the control, or on the picture next to a control hidden under it, as the icon
 * picker's are), with what lies under the ring at the middle of each side; null once the
 * keyboard is on nothing or has left `within`. "What lies behind" is a list of backgrounds from
 * an element outward, nearest first, up to the first opaque one; under everything is the body's
 * ground, which the browser paints across the whole page. No text inside an `exempt` element, no
 * field border inside an `edgeExempt` one. */
function probe({ root, exempt, edgeExempt, canaries = [], ring = false, within = null, browserRing = null }) {
  const opaque = colour => colour.startsWith('rgb(');
  const gradientOf = image => (/gradient\(/.test(image) ? image : null);
  const describe = node => {
    const own = `${node.tagName.toLowerCase()}${[...node.classList].map(name => `.${name}`).join('')}`;
    return node.classList.length || !node.parentElement ? own : `${describe(node.parentElement)} > ${own}`;
  };
  const behind = node => {
    const layers = [];
    for (let at = node; at; at = at.parentElement) {
      const style = getComputedStyle(at);
      const image = gradientOf(style.backgroundImage);
      layers.push({ colour: style.backgroundColor, image, on: describe(at) });
      if (opaque(style.backgroundColor) || (image && (image.match(/rgba?\([^)]*\)/g) ?? []).every(opaque))) return layers;
    }
    const page = getComputedStyle(document.body);
    layers.push({ colour: page.backgroundColor, image: gradientOf(page.backgroundImage), on: 'the page' });
    return layers;
  };
  const opacity = node => {
    let alpha = 1;
    for (let at = node; at; at = at.parentElement) alpha *= Number(getComputedStyle(at).opacity);
    return alpha;
  };

  if (ring) {
    const active = document.activeElement;
    if (!active || active === document.body || (within && !active.closest(within))) return null;
    window.crumbStops ??= new WeakMap();
    if (!window.crumbStops.has(active)) window.crumbStops.set(active, (window.crumbStopCount = (window.crumbStopCount ?? 0) + 1));
    const stop = window.crumbStops.get(active);
    const drawn = node => Boolean(node) && getComputedStyle(node).outlineStyle !== 'none'
      && Number.parseFloat(getComputedStyle(node).outlineWidth) > 0 && opacity(node) > 0;
    const ringed = [active, active.nextElementSibling].find(drawn);
    if (!ringed) return { stop, what: describe(active), style: 'none' };
    const style = getComputedStyle(ringed);
    if (style.outlineStyle === 'auto') return { stop, what: describe(ringed), style: 'auto', browsers: Boolean(browserRing) && ringed.matches(browserRing) };
    const box = ringed.getBoundingClientRect();
    const out = Number.parseFloat(style.outlineOffset) + Number.parseFloat(style.outlineWidth) / 2;
    const middles = [
      [box.left + box.width / 2, box.top - out], [box.left + box.width / 2, box.bottom + out],
      [box.left - out, box.top + box.height / 2], [box.right + out, box.top + box.height / 2],
    ];
    // The ground the control sits on. Where the ring brushes a neighbouring control (the pill of
    // the page shown, the pressed shop button), that control is passed over.
    const CONTROL = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
    const neighbour = node => {
      const control = node.closest(CONTROL);
      return Boolean(control) && !control.contains(ringed);
    };
    const grounds = middles
      .filter(([x, y]) => x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight)
      .map(([x, y]) => document.elementsFromPoint(x, y).find(node => node !== active && !ringed.contains(node) && !neighbour(node)))
      .filter(Boolean)
      .map(behind);
    return { stop, what: describe(ringed), style: style.outlineStyle, ink: style.outlineColor, alpha: opacity(ringed), grounds };
  }

  const top = document.querySelector(root);
  if (!top) return null;
  const FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea';
  const visible = node => {
    if (node.closest('.sr-only')) return false;
    const box = node.getBoundingClientRect();
    if (box.width * box.height <= 1) return false;
    // Not on the page at all: the skip link waits above its top until it has the keyboard.
    if (box.bottom + window.scrollY <= 0 || box.right + window.scrollX <= 0) return false;
    return getComputedStyle(node).visibility === 'visible' && opacity(node) > 0;
  };
  const ownText = node => [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim() !== '');
  const showsText = node => (node.matches(FIELD)
    ? node.matches('select, [type="file"]') || node.value !== ''
    : ownText(node) && !node.matches('option, script, style, noscript, title'));
  const shownText = node => {
    if (node.matches('[type="password"]')) return '(a password)';
    if (node.matches('select')) return node.selectedOptions[0]?.textContent ?? '';
    return node.matches(FIELD) ? node.value : node.textContent;
  };
  const nodes = [top, ...top.querySelectorAll('*')].filter(visible);
  const textNodes = nodes.filter(node => !node.closest(exempt) && showsText(node));
  const texts = textNodes.map(node => ({
    what: describe(node), text: shownText(node).trim().replace(/\s+/g, ' ').slice(0, 40).trim(),
    ink: getComputedStyle(node).color, alpha: opacity(node), ground: behind(node),
  }));
  const fields = nodes
    .filter(node => node.matches(FIELD) && !node.closest(edgeExempt) && getComputedStyle(node).borderTopStyle !== 'none' && Number.parseFloat(getComputedStyle(node).borderTopWidth) > 0)
    .map(node => ({
      what: describe(node), disabled: node.matches(':disabled'), edge: getComputedStyle(node).borderTopColor, alpha: opacity(node),
      inside: behind(node), beside: behind(node.parentElement),
    }));
  const hits = Object.fromEntries(canaries.map(selector => [selector, textNodes.filter(node => node.closest(selector)).length]));
  return { texts, fields, hits };
}

const shade = colour => `rgb(${[colour.r, colour.g, colour.b].map(Math.round).join(', ')})`;

/* Every colour a list of backgrounds can show behind something, each gradient stop on its own:
 * painted from the outermost (opaque) one in, each translucent one over every colour under it.
 * (blend takes the alpha to paint with: a colour's own, times any opacity it sits in.) */
function groundColours(layers) {
  let grounds = [{ r: 255, g: 255, b: 255, a: 1 }];
  for (const layer of [...layers].reverse()) {
    const fill = parseColour(layer.colour);
    let next = grounds.map(under => blend(fill, under, fill.a));
    if (layer.image) next = next.flatMap(under => stops(layer.image).map(stop => blend(stop, under, stop.a)));
    grounds = [...new Map(next.map(colour => [shade(colour), colour])).values()];
  }
  return grounds;
}

/* The lowest contrast of a colour, in an element whose opacity (its ancestors' multiplied in) is
 * `opacity`, against every colour its ground can show. */
function lowest(ink, opacity, layers) {
  const colour = parseColour(ink);
  return groundColours(layers)
    .map(ground => ({ ratio: contrast(blend(colour, ground, colour.a * opacity), ground), ground }))
    .reduce((worst, each) => (each.ratio < worst.ratio ? each : worst));
}

/* Checks every visible text and field border under `root` as the page shows it now. A line goes
 * into `failures` for each one short of its minimum; every selector in `canaries` must hold at
 * least one text that was checked, so a walk that finds nothing cannot pass. */
async function walk(page, scene, failures, { root = 'body', canaries = [], exempt = EXEMPT, frames = true } = {}) {
  await settle(page, { frames });
  const found = await page.evaluate(probe, { root, exempt: exempt.join(', '), edgeExempt: EDGE_EXEMPT.join(', '), canaries });
  expect(found, `${scene}: ${root} is on the page`).not.toBeNull();
  for (const [selector, count] of Object.entries(found.hits)) expect(count, `${scene}: a text in ${selector} was checked`).toBeGreaterThan(0);
  for (const text of found.texts) {
    const { ratio, ground } = lowest(text.ink, text.alpha, text.ground);
    if (ratio < TEXT_MIN) failures.push(`${scene}: ${text.what} “${text.text}” ${ratio.toFixed(2)}:1 on ${shade(ground)} (${text.ground.at(-1).on})`);
  }
  for (const field of found.fields) {
    for (const [side, layers] of [['inside', field.inside], ['beside', field.beside]]) {
      const { ratio, ground } = lowest(field.edge, field.alpha, layers);
      if (ratio < EDGE_MIN) failures.push(`${scene}: border of ${field.what} ${ratio.toFixed(2)}:1 ${side} it on ${shade(ground)}`);
    }
  }
  return found;
}

/* Checks the focus ring of the control that has the keyboard now, at 3:1 on everything under it.
 * A ring the browser draws itself (outline-style auto) is a failure unless the element matches
 * `browserRing`. Returns the probe's answer: null once the keyboard is on nothing or has left
 * `within`. */
async function ringHere(page, scene, failures, { within = null, browserRing = null, seen = new Set() } = {}) {
  await settle(page);
  const ring = await page.evaluate(probe, { ring: true, within, browserRing });
  if (ring === null || ring.browsers || seen.has(ring.stop)) return ring;
  if (ring.style !== 'solid') {
    failures.push(`${scene}: ${ring.what} has the keyboard but its ring is ${ring.style}`);
    return ring;
  }
  if (!ring.grounds.length) {
    failures.push(`${scene}: nothing found under the ring of ${ring.what}`);
    return ring;
  }
  const { ratio, ground, layers } = ring.grounds
    .map(each => ({ ...lowest(ring.ink, ring.alpha, each), layers: each }))
    .reduce((worst, each) => (each.ratio < worst.ratio ? each : worst));
  if (ratio < EDGE_MIN) failures.push(`${scene}: focus ring of ${ring.what} ${ratio.toFixed(2)}:1 on ${shade(ground)} (${layers.at(-1).on})`);
  return ring;
}

/* Whether the keyboard is on nothing: on the page itself, past the last control of the page or of
 * a modal dialog. */
const onNothing = page => page.evaluate(() => !document.activeElement || document.activeElement === document.body);

/* Presses Tab and checks the ring at every stop, until a stop comes round again, the keyboard
 * moves on to a control outside `within`, or `limit` presses. The keyboard resting on nothing
 * (two presses in a row at most) is not the end: past the last control of the page, or of a
 * modal dialog, the next press starts again at the first, so the controls before the one the
 * walk started from are reached too. With `fromHere`, the control that has the keyboard now is
 * checked first: only where a key press put it there, since a button a script focuses after a
 * click gets no ring from the browser. Returns what each checked ring was on. */
async function ringsAlong(page, scene, failures, { within = null, limit = 80, browserRing = null, fromHere = false } = {}) {
  const seen = new Set();
  const checked = [];
  let outside = 0;
  for (let press = 0; press < limit; press += 1) {
    if (press > 0 || !fromHere) await page.keyboard.press('Tab');
    const ring = await ringHere(page, scene, failures, { within, browserRing, seen });
    if (ring === null) {
      if ((within && !await onNothing(page)) || (outside += 1) > 2) break;
      continue;
    }
    outside = 0;
    if (seen.has(ring.stop)) break;
    seen.add(ring.stop);
    checked.push(ring.what);
  }
  return checked;
}

/* A team member's own API session, from a new sign-in link. A new link signs the member out
 * everywhere else, so the browser page signs in again afterwards with another. */
async function memberApi(fx) {
  const link = await fx.api.request('POST', `/api/admin/members/${fx.memberId}/signin-link`, undefined, key());
  const member = client(fx.origin);
  await member.bootstrap();
  const signedIn = await member.request('POST', '/api/signin/accept', { token: tokenFrom(link.body.signinUrl, 'signin') });
  member.csrf = signedIn.body.csrfToken;
  return member;
}

async function signInAgain(fx, page) {
  const link = await fx.api.request('POST', `/api/admin/members/${fx.memberId}/signin-link`, undefined, key());
  await page.goto('about:blank');
  await page.goto(link.body.signinUrl);
  await page.getByRole('button', { name: 'Sign in on this device', exact: true }).click();
  await expect(nameMenu(page)).toBeVisible();
}

/* A café team with something in every list: treats (one with a message, one taken back), a
 * benefit with a picture, and three requests, waiting, done and declined. Credit, $50 a step. */
async function busyCafe(browser) {
  const fx = await provision(browser, { mode: 'credit', theme: 'cafe' });
  const grant = (amount, reason) => fx.api.request('POST', '/api/admin/grants', { userId: fx.memberId, amount, mode: 'credit', reason }, key());
  expect((await grant('120.00', 'For closing up on Sunday')).status).toBe(201);
  const mistaken = await grant('5.00', '');
  expect((await fx.api.request('POST', `/api/admin/grants/${mistaken.body.entry.id}/revoke`, { reason: 'Meant for someone else' }, key())).status).toBe(200);
  // Its picture is the second item of Café's list (the first after the mascot).
  const pictured = await fx.api.request('POST', '/api/admin/rewards', { name: 'Friday coffee', description: 'Any size, any milk', amount: '9.00', mode: 'credit', active: true, iconKey: CAFE.keys[1] }, key());
  expect(pictured.status).toBe(201);
  const member = await memberApi(fx);
  const ask = async () => (await member.request('POST', '/api/redemptions', { rewardId: fx.coffeeId, expectedCostUnits: 1250 }, key())).body.redemption.id;
  const done = await ask();
  const declined = await ask();
  await ask();
  expect((await fx.api.request('POST', `/api/admin/redemptions/${done}/complete`, undefined, key())).status).toBe(200);
  expect((await fx.api.request('POST', `/api/admin/redemptions/${declined}/reject`, { reason: 'Out of beans today' }, key())).status).toBe(200);
  return fx;
}

test('the café member page, its log, shelf, menu and keypad, and its toasts pass AA', async ({ browser }) => {
  const fx = await busyCafe(browser);
  try {
    const page = fx.memberPage;
    const problems = await watch(page);
    await signInAgain(fx, page);
    await page.setViewportSize({ width: 430, height: 900 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cafe');
    const failures = [];

    // Asking for benefits: the tip, the balance tile, the benefits and the three requests.
    await expect(page.locator('.badge-rejected')).toBeVisible();
    await walk(page, 'member page', failures, {
      canaries: ['.home-tip', '.holder', '.credit-label', '.oven-caption', '.benefit .price', '.badge-pending', '.badge-completed', '.badge-rejected', '.row-note', '.quest-head', '.rec-amt.plus', '.rec-amt.minus'],
    });
    const stops = await ringsAlong(page, 'member page', failures);
    expect(stops.length, stops.join('\n')).toBeGreaterThan(8);
    expect(stops).toEqual(expect.arrayContaining(['a.skip-link', 'button.slot-button', 'button.quest-head']));

    await page.getByRole('button', { name: /Log · Recent/ }).click();
    await walk(page, 'member page, whole log', failures, { canaries: ['.quest-month', '.rec-note', '.badge-revoked'] });
    await page.locator('.slot-button').first().click();
    await walk(page, 'member page, a name on the shelf', failures, { root: '.slot-button.show-name', canaries: ['.slot-name'] });

    // Opened from the keyboard: the menu puts the keyboard on its first item, ringed as after any
    // keyboard move, and the walk starts there.
    await nameMenu(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.topbar .menu .language-select')).toBeFocused();
    const menu = await walk(page, 'name menu', failures, { root: '.topbar .menu', canaries: ['.language'] });
    expect(menu.fields.map(field => field.what)).toEqual(['select.language-select']);
    const menuStops = await ringsAlong(page, 'name menu', failures, { within: '.topbar .account', fromHere: true });
    expect(menuStops).toEqual(['select.language-select', 'button.btn.btn-quiet']);

    // Keying in an entry: the action button, the keypad empty, with an amount, and over.
    expect((await fx.api.request('PATCH', '/api/org', { spending: 'self' })).status).toBe(200);
    await page.reload();
    await expect(page.getByRole('button', { name: 'I grabbed something', exact: true })).toBeVisible();
    await walk(page, 'member page, keying in', failures, { canaries: ['.act', '.actions-hint'] });
    await page.getByRole('button', { name: 'I grabbed something', exact: true }).click();
    await walk(page, 'keypad at zero', failures, { root: 'dialog[open]', canaries: ['.sheet-amount.zero', '.key', '.sheet-available'] });
    // The keypad opens on its first key; past Cancel (Confirm is greyed out) the keyboard rests on
    // nothing, then starts again at that key.
    const keypadStops = await ringsAlong(page, 'keypad', failures, { within: 'dialog[open]' });
    expect(keypadStops.filter(what => what === 'button.key'), keypadStops.join('\n')).toHaveLength(12);
    expect(keypadStops).toContain('button.btn.btn-secondary');
    await keyIn(page, '1250');
    await walk(page, 'keypad with an amount', failures, { root: 'dialog[open]', canaries: ['.sheet-amount', '.btn-confirm'] });
    await keyIn(page, '99999');
    await expect(page.locator('.sheet-amount.over')).toBeVisible();
    await walk(page, 'keypad over the balance', failures, { root: 'dialog[open]', canaries: ['.sheet-amount.over', '.sheet-warn'] });
    await keyIn(page, ['Clear', '1', '0', '0']);
    await page.getByRole('button', { name: 'Jot it down', exact: true }).click();
    await expect(page.locator('.toast-info')).toBeVisible();
    await walk(page, 'toast', failures, { root: '#toasts', canaries: ['.toast-info'] });

    // A sign-out that does not go through says so in an error toast.
    await page.route('**/api/logout', route => route.abort('connectionreset'));
    await nameMenu(page).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.locator('.toast-error')).toBeVisible();
    await walk(page, 'error toast', failures, { root: '#toasts', canaries: ['.toast-error'] });

    expect(failures).toEqual([]);
    expect(await problems('ERR_CONNECTION_RESET')).toEqual([]);
  } finally {
    await fx.close();
  }
});

/* Opens what the Team page keeps shut: the invitation and benefit forms (with the icon picker),
 * a person's actions with a sign-in link just made for them (the link panel and its QR code). */
async function openTeamPage(page, name) {
  for (const summary of ['Invite someone', 'Add a benefit']) await page.locator('summary', { hasText: summary }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('button', { name: `New sign-in link for ${name}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Make a new link', exact: true }).click();
  await expect(page.getByLabel('Sign-in link', { exact: true })).toBeVisible();
}

test('the café Team page and the treat dialog, with its errors, pass AA', async ({ browser }) => {
  const fx = await busyCafe(browser);
  try {
    const page = fx.ownerPage;
    const problems = await watch(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${fx.origin}/#/team`);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Team', exact: true })).toBeVisible();
    await expect(page.locator('.loading')).toHaveCount(0);
    const failures = [];

    await openTeamPage(page, 'Mina Park');
    await walk(page, 'Team page', failures, {
      canaries: ['.page-title', '.tile-title', '.person-name', '.person-facts', '.link-panel', '.qr', '.icon-picker .slot', '.price', '.rec-amt', '.badge', '.field-hint', '.main-nav'],
    });
    const stops = await ringsAlong(page, 'Team page', failures, { limit: 120 });
    expect(stops).toEqual(expect.arrayContaining(['input.link-input', 'span.slot']));

    await page.getByRole('button', { name: 'Treat someone', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await walk(page, 'treat dialog', failures, { root: 'dialog[open]', canaries: ['.dialog-title', '.check-list', '.field-hint', '.btn-quiet'] });
    // The dialog opens on the first person's box: the walk goes from the second person's box down
    // to "Send it", past which the keyboard rests on nothing, then starts again at the top of the
    // dialog, "Everyone here" and "Clear", and ends at the first box.
    const treatStops = await ringsAlong(page, 'treat dialog', failures, { within: 'dialog[open]' });
    expect(treatStops).toEqual([
      'div.checkbox > input', 'div.field > input', 'div.field > textarea', 'button.btn.btn-secondary', 'button.btn.btn-primary',
      'button.btn.btn-quiet', 'button.btn.btn-quiet', 'div.checkbox > input',
    ]);
    // Sent with no one chosen, then with an amount that is not one.
    await dialog.getByRole('button', { name: 'Send it', exact: true }).click();
    await expect(dialog.getByText('Pick someone first.', { exact: true })).toBeVisible();
    await dialog.getByLabel('Mina Park', { exact: true }).check();
    await dialog.getByLabel('How much each', { exact: true }).fill('lots');
    await dialog.getByRole('button', { name: 'Send it', exact: true }).click();
    await expect(dialog.locator('[aria-invalid="true"]')).toHaveCount(1);
    await walk(page, 'treat dialog with errors', failures, { root: 'dialog[open]', canaries: ['.field-error'] });

    expect(failures).toEqual([]);
    expect(await problems()).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('café Settings, locked after the first treat and with form errors, pass AA', async ({ browser }) => {
  const fx = await busyCafe(browser);
  try {
    const page = fx.ownerPage;
    const problems = await watch(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${fx.origin}/#/settings`);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Who did what' })).toBeVisible();
    const failures = [];

    // The unlock step, currency and theme are locked: the notice, the greyed-out fields. The locked
    // unlock step's border is checked on its paper ground; the locked currency select's is not.
    await expect(page.locator('.notice')).toBeVisible();
    const locked = await walk(page, 'Settings, locked', failures, { canaries: ['.notice', '.field-hint', '.tile-title'] });
    expect(locked.fields.filter(field => field.disabled).map(field => field.what)).toEqual(['div.field > input']);
    await expect(page.getByLabel('Currency', { exact: true })).toBeDisabled();
    await ringsAlong(page, 'Settings, locked', failures, { limit: 120 });

    // A required field left empty, then a save the server turns down.
    await page.getByLabel('Organization name', { exact: true }).fill('');
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.locator('.field [aria-invalid="true"]')).toHaveCount(1);
    await walk(page, 'Settings, a field error', failures, { canaries: ['.field-error'] });
    await page.getByLabel('Organization name', { exact: true }).fill(TEAM);
    await page.route('**/api/org', route => (route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, json: { error: { code: 'INTERNAL', message: 'Something went wrong' } } })
      : route.continue()));
    await page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(page.locator('.settings-card .form-error')).toBeVisible();
    await walk(page, 'Settings, a form error', failures, { canaries: ['.form-error'] });

    expect(failures).toEqual([]);
    expect(await problems('status of 500')).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('the three cards pass AA on café Settings before the first treat, and the café card on the light setup page', async ({ browser }) => {
  let crumb;
  let fx;
  let context;
  try {
    crumb = await startCrumb();
    context = await browser.newContext({ reducedMotion: 'reduce' });
    const setup = await context.newPage();
    const setupProblems = await watch(setup);
    await setup.goto(crumb.origin);
    await expect(setup.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
    await expect(setup.locator('html')).not.toHaveAttribute('data-theme');
    const failures = [];
    const cafeCard = '.theme-card[data-theme="cafe"]';
    await walk(setup, 'setup, café card', failures, { root: cafeCard, canaries: ['.radio-label'] });
    // Chosen from the keyboard: Pastry shop's card has it first, the arrows move on.
    const cards = setup.getByRole('group', { name: 'Collection theme', exact: true });
    const pastry = cards.getByRole('radio', { name: 'Pastry shop · 39 pastries', exact: true });
    const cafe = cards.getByRole('radio', { name: CAFE_CARD, exact: true });
    for (let press = 0; press < 40 && !await pastry.evaluate(node => node === document.activeElement); press += 1) {
      await setup.keyboard.press('Tab');
    }
    await setup.keyboard.press('ArrowDown');
    await setup.keyboard.press('ArrowDown');
    await expect(cafe).toBeChecked();
    await expect(cafe).toBeFocused();
    await walk(setup, 'setup, café card chosen', failures, { root: cafeCard, canaries: ['.radio-label'] });
    expect(await ringHere(setup, 'setup, café card', failures, { within: cafeCard })).not.toBeNull();
    await expect(setup.locator('html')).not.toHaveAttribute('data-theme');

    // A café team with a benefit and no treat yet: every card can still be chosen.
    fx = await provision(browser, { mode: 'credit', theme: 'cafe' });
    const page = fx.ownerPage;
    const problems = await watch(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${fx.origin}/#/settings`);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Who did what' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Pastry shop · 39 pastries', exact: true })).toBeEnabled();
    await walk(page, 'Settings, cards selectable', failures, { canaries: [cafeCard, '.theme-card[data-theme="default"]', '.theme-card[data-theme="bakery"]', '.notice'] });
    await ringsAlong(page, 'Settings, cards selectable', failures, { limit: 120 });

    expect(failures).toEqual([]);
    expect(await setupProblems()).toEqual([]);
    expect(await problems()).toEqual([]);
  } finally {
    await context?.close();
    await fx?.close();
    await crumb?.close();
  }
});

test('the café sign-in page, sign-in link page and invitation page pass AA', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', theme: 'cafe' });
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    const problems = await watch(page);
    const failures = [];
    await page.goto(fx.origin);
    await expect(page.getByRole('heading', { name: `Sign in to ${TEAM}` })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cafe');
    await page.getByLabel('Username').fill('olive');
    const signInPage = await walk(page, 'sign-in page', failures, { canaries: ['h1', '.muted', '.auth-foot', '.field label'] });
    // Both fields and the language select had their borders checked.
    expect(signInPage.fields.map(field => field.what)).toEqual(['div.field > input', 'div.field > input', 'select.language-select']);
    await ringsAlong(page, 'sign-in page', failures);
    await page.getByLabel('Username').fill('');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('.form-error')).toBeVisible();
    await walk(page, 'sign-in page, an error', failures, { canaries: ['.form-error'] });

    const link = await fx.api.request('POST', `/api/admin/members/${fx.memberId}/signin-link`, undefined, key());
    await page.goto(link.body.signinUrl);
    await expect(page.getByRole('button', { name: 'Sign in on this device', exact: true })).toBeVisible();
    await walk(page, 'sign-in link page', failures, { canaries: ['h1', '.btn-primary'] });
    await ringsAlong(page, 'sign-in link page', failures);

    const invite = await fx.api.request('POST', '/api/admin/invitations', { username: 'theo', displayName: 'Theo Grant', role: 'admin' });
    await page.goto(invite.body.invitationUrl);
    await expect(page.getByRole('button', { name: 'Join', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.locator('.field [aria-invalid="true"]')).toHaveCount(1);
    await walk(page, 'invitation page with an error', failures, { canaries: ['h1', '.field-hint', '.field-error'] });

    expect(failures).toEqual([]);
    expect(await problems()).toEqual([]);
  } finally {
    await context.close();
    await fx.close();
  }
});

test('the café oven intro passes AA', async ({ browser }) => {
  const fx = await provision(browser, { mode: 'credit', theme: 'cafe' });
  const context = await browser.newContext({ reducedMotion: 'no-preference' });
  try {
    const page = await context.newPage();
    const problems = await watch(page);
    await signIn(page, fx.origin, 'olive');
    // The intro plays once per load for someone signed in. The page's clock stands still, so it
    // stays until tapped.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    await page.reload();
    await expect(page.locator('.oven')).toBeVisible();
    const failures = [];
    await walk(page, 'oven intro', failures, { root: '.oven', canaries: ['.oven-text', '.oven-sub'], frames: false });
    expect(failures).toEqual([]);
    await page.clock.resume();
    expect(await problems()).toEqual([]);
  } finally {
    await context.close();
    await fx.close();
  }
});

/* The demo, opened from disk on the café: the shop the demo remembers, put there before load. */
async function demoCafe(page) {
  await page.goto(DEMO);
  await page.evaluate(() => window.localStorage.setItem('crumb_demo_theme', 'cafe'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cafe');
  await expect(page.getByRole('button', { name: 'Café', exact: true })).toHaveAttribute('aria-pressed', 'true');
}

test('the demo’s café passes AA with the tour stopped: the page, the sheet, a name, toasts, every ring', async ({ browser }) => {
  // With less motion asked for, the tour does not drive the page.
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const problems = await watch(page);
    await demoCafe(page);
    const failures = [];
    await walk(page, 'demo', failures, {
      canaries: ['.tagline', '.stats', '.demo-note', '.counter', '.person', '.grant', '.nudge', '.caption', '.tile', '.oven-caption', '.quest', '.card .rule', '.cabinet', '.legend', '.page-foot', '.shop-switch'],
    });
    // The demo's stylesheet rings its buttons; its links and the log's scroller keep the
    // browser's own ring, which is not one of the theme's colours.
    const stops = await ringsAlong(page, 'demo', failures, { limit: 80, browserRing: 'a, .quest-scroller' });
    expect(stops).toEqual(expect.arrayContaining(['button.get', 'button.person', 'button.grant', 'button.act', 'button.quest-head']));

    await page.locator('#quest-toggle').click();
    await walk(page, 'demo, whole log', failures, { root: '#phone', canaries: ['.quest-month'] });
    await page.locator('#slots .slot.filled').first().click();
    await walk(page, 'demo, a name on the shelf', failures, { root: '.pastry-name', canaries: ['.pastry-name', '.pastry-name .en'] });
    await page.locator('[data-grant="50"]').click();
    await expect(page.locator('#phone .toast')).toBeVisible();
    await walk(page, 'demo, toast', failures, { root: '#phone .toast', canaries: ['.toast'] });
    await page.locator('#spend').click();
    await walk(page, 'demo sheet at zero', failures, { root: '.sheet', canaries: ['h3', '.avail', '.amount', '.key', '.btn-cancel'] });
    // The sheet leaves the keyboard on "Spend some credit", whose next stop is outside the sheet.
    // It is put on the first key from the second, by Shift+Tab, so the browser rings it as after
    // any keyboard move, and the walk starts there.
    await page.locator('.sheet .key').nth(1).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('.sheet .key').first()).toBeFocused();
    const sheetStops = await ringsAlong(page, 'demo sheet', failures, { within: '.sheet', fromHere: true });
    expect(sheetStops.filter(what => what === 'button.key'), sheetStops.join('\n')).toHaveLength(12);
    expect(sheetStops).toContain('button.btn-cancel');
    for (const digit of ['9', '9', '9', '9', '9']) await page.locator('.sheet .key', { hasText: new RegExp(`^${digit}$`) }).click();
    await expect(page.locator('#sheet-err')).not.toBeEmpty();
    await walk(page, 'demo sheet over the balance', failures, { root: '.sheet', canaries: ['.amount.over', '.sheet-err'] });
    await page.keyboard.press('Escape');
    // Robin has nothing to spend yet.
    await page.locator('.person', { hasText: 'Robin' }).click();
    await page.locator('#spend').click();
    await expect(page.locator('#phone .toast.error')).toBeVisible();
    await walk(page, 'demo, error toast', failures, { root: '#phone .toast.error', canaries: ['.toast.error'] });

    expect(failures).toEqual([]);
    expect(await problems()).toEqual([]);
  } finally {
    await context.close();
  }
});

test('the demo’s café intro and its playing tour pass AA, the counter faded as it is then', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    const problems = await watch(page);
    await page.goto(DEMO);
    await page.evaluate(() => window.localStorage.setItem('crumb_demo_theme', 'cafe'));
    // The tour runs on the page's timers: with its clock stopped, each scene stays until moved on.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'cafe');
    await expect(page.locator('#phone .oven')).toBeVisible();
    const failures = [];
    await walk(page, 'demo intro', failures, { root: '#phone .oven', canaries: ['.oven-text', '.oven-sub'], frames: false });

    // On to the treat: the toast is up and the counter is dimmed while the tour plays.
    await page.clock.runFor(3500);
    await expect(page.locator('body')).toHaveClass(/autoplay/);
    await expect(page.locator('#phone .toast')).toBeVisible();
    await expect(page.locator('.counter')).toHaveCSS('opacity', PLAYING_COUNTER_OPACITY);
    await walk(page, 'demo, tour playing', failures, { frames: false, canaries: ['.caption', '.toast', '.tile', '.counter', '.grant'] });
    expect(failures).toEqual([]);
    await page.clock.resume();
    expect(await problems()).toEqual([]);
  } finally {
    await context.close();
  }
});
