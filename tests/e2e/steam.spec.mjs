/* The café mascot's steam in the app (design section 3): a tap gives the same shake as before
 * and runs one cycle of steam instead of spilling crumbs, a second tap starts it over, the
 * intro's cup steams while the intro shows, and with less motion asked for nothing moves. Each
 * step is compared with the same step drawn by the page's own pixel table, so these tests
 * follow the step table of sprites.js instead of repeating it. Pastry shop's and Bakery's
 * crumbs are tested in themes.spec.mjs. Every person and team here is invented. */
import { test, expect } from '@playwright/test';
import { nameMenu, provision } from './fixtures.mjs';

function pageErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  return errors;
}

/* A sprite as the page's own pixel table draws it at that size: at one step of its steam, or
 * whole when `step` is left out. page.evaluate runs at the page's global scope, where
 * sprites.js's `const Pixel` is visible by its name. */
const drawingOf = (page, key, size, step) => page.evaluate(([spriteKey, pixelSize, at]) => {
  const canvas = document.createElement('canvas');
  Pixel.drawSprite(canvas, Pixel.SPRITES[spriteKey], pixelSize, 0, at); // eslint-disable-line no-undef
  return canvas.toDataURL();
}, [key, size, step]);
const shownOn = locator => locator.evaluate(canvas => canvas.toDataURL());

/* The steam's cycle as the page's pixel table has it, and Hot Coffee at each of its steps. */
const cycleOf = page => page.evaluate(() => ({ steps: Pixel.STEAM_STEPS.length, stepMs: Pixel.STEAM_STEP_MS })); // eslint-disable-line no-undef
async function stepsOf(page, size, steps) {
  const drawings = [];
  for (let at = 0; at < steps; at += 1) drawings.push(await drawingOf(page, 'hotcoffee', size, at));
  return drawings;
}

/* Counts the crumbs that land on the page from now on. */
const countCrumbs = page => page.evaluate(() => {
  window.__crumbs = 0;
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element && node.classList.contains('particle')) window.__crumbs += 1;
      }
    }
  }).observe(document.body, { childList: true });
});
const crumbsSeen = page => page.evaluate(() => window.__crumbs);

/* Notes whether the intro is ever on the page, from the first moment of a load. */
function watchIntro() {
  window.__introSeen = false;
  new MutationObserver(() => {
    if (document.querySelector('.oven')) window.__introSeen = true;
  }).observe(document, { childList: true, subtree: true });
}

test('tapping the café mascot steams one cycle and spills no crumbs; a second tap starts it over', async ({ browser }) => {
  // A café team; full motion, as the steam is what this looks at. The owner signed in with a
  // password, so no intro was shown, and is on the Team page.
  const fx = await provision(browser, { theme: 'cafe', reducedMotion: 'no-preference' });
  try {
    const page = fx.ownerPage;
    const errors = pageErrors(page);
    const mascot = page.locator('.topbar .mascot');
    const picture = mascot.locator('canvas');
    const { steps, stepMs } = await cycleOf(page);
    // Assumption 5: one cycle, 8 steps of 120 ms, about a second.
    expect(steps * stepMs).toBe(960);
    const whole = await drawingOf(page, 'hotcoffee', 3);
    const step = await stepsOf(page, 3, steps);
    // At rest the steam shows in full; at every step of a cycle some of it is hidden.
    expect(await shownOn(picture)).toBe(whole);
    for (const [at, drawing] of step.entries()) expect(drawing, `step ${at}`).not.toBe(whole);

    // From here the page's clock stands still and moves only as far as the test moves it.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    await countCrumbs(page);
    // The tap still gives the little shake (the class that runs it), and the steam with it.
    await expect(mascot).not.toHaveClass(/crack/);
    await mascot.click();
    await expect(mascot).toHaveClass(/crack/);
    expect(await shownOn(picture)).toBe(step[0]);
    for (let at = 1; at < steps; at += 1) {
      await page.clock.runFor(stepMs);
      expect(await shownOn(picture), `step ${at}`).toBe(step[at]);
    }
    // After the last step it is the whole drawing again, and stays so.
    await page.clock.runFor(stepMs);
    expect(await shownOn(picture)).toBe(whole);
    await page.clock.runFor(steps * stepMs);
    expect(await shownOn(picture)).toBe(whole);

    // Tapped again partway through, it starts over from its first step, and the cycle it cut
    // short draws nothing more: that cycle's next step was due half a step after the tap.
    await mascot.click();
    await page.clock.runFor(2 * stepMs + stepMs / 2);
    expect(await shownOn(picture)).toBe(step[2]);
    await mascot.click();
    expect(await shownOn(picture)).toBe(step[0]);
    await page.clock.runFor(stepMs / 2);
    expect(await shownOn(picture)).toBe(step[0]);
    await page.clock.runFor(stepMs / 2);
    expect(await shownOn(picture)).toBe(step[1]);
    await page.clock.runFor((steps - 2) * stepMs);
    expect(await shownOn(picture)).toBe(step[steps - 1]);
    await page.clock.runFor(stepMs);
    expect(await shownOn(picture)).toBe(whole);

    // A canvas that has left the page ends its cycle and is drawn on no more: here the owner
    // goes from the Team page to their own while the steam runs, and the header is drawn again.
    await expect(page).toHaveURL(/#\/team$/);
    await mascot.click();
    await page.clock.runFor(stepMs);
    expect(await shownOn(picture)).toBe(step[1]);
    const left = await picture.elementHandle();
    await page.evaluate(() => { window.location.hash = '#/me'; });
    await expect.poll(() => left.evaluate(canvas => canvas.isConnected)).toBe(false);
    await page.clock.runFor(steps * stepMs);
    expect(await left.evaluate(canvas => canvas.toDataURL())).toBe(step[1]);
    expect(await shownOn(picture)).toBe(whole);

    expect(await crumbsSeen(page)).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('the café intro keeps its cup steaming while it shows, and the steam stops when it leaves', async ({ browser }) => {
  const fx = await provision(browser, { theme: 'cafe', reducedMotion: 'no-preference' });
  try {
    const page = fx.memberPage;
    const errors = pageErrors(page);
    const { steps, stepMs } = await cycleOf(page);
    const step = await stepsOf(page, 8, steps);
    // The intro plays once per page load for someone signed in. The page's clock stands still,
    // so the intro changes only as the test moves the clock on.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    await page.reload();
    const intro = page.locator('.oven');
    await expect(intro).toBeVisible();
    const picture = intro.locator('canvas');
    expect(await shownOn(picture)).toBe(step[0]);
    for (let at = 1; at < steps; at += 1) {
      await page.clock.runFor(stepMs);
      expect(await shownOn(picture), `step ${at}`).toBe(step[at]);
    }
    // It starts to leave at 0.9 s, as in 0.3.
    await page.clock.runFor(900 - (steps - 1) * stepMs);
    await expect(intro).toHaveClass(/leaving/);
    // Leaving stops the steam where it is: its next step was due at the end of the cycle.
    await page.clock.runFor(steps * stepMs - 900);
    expect(await shownOn(picture)).toBe(step[steps - 1]);
    // The slide out takes 420 ms; then the intro is gone and the page is drawn.
    await page.clock.runFor(900 + 420 - steps * stepMs);
    await expect(intro).toHaveCount(0);
    await page.clock.resume();
    await expect(nameMenu(page)).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await fx.close();
  }
});

test('with less motion asked for, a tap leaves the café mascot whole and there is no intro', async ({ browser }) => {
  // Both devices ask for less motion, as the fixture's do unless told otherwise.
  const fx = await provision(browser, { theme: 'cafe' });
  try {
    const page = fx.ownerPage;
    const errors = pageErrors(page);
    const picture = page.locator('.topbar .mascot canvas');
    const { steps, stepMs } = await cycleOf(page);
    const whole = await drawingOf(page, 'hotcoffee', 3);
    expect(await shownOn(picture)).toBe(whole);

    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    await countCrumbs(page);
    await page.locator('.topbar .mascot').click();
    expect(await shownOn(picture)).toBe(whole);
    for (let at = 1; at <= steps + 1; at += 1) {
      await page.clock.runFor(stepMs);
      expect(await shownOn(picture), `${at * stepMs} ms after the tap`).toBe(whole);
    }
    expect(await crumbsSeen(page)).toBe(0);
    await page.clock.resume();

    // A reload of a signed-in page shows no intro, not even for a moment.
    await page.addInitScript(watchIntro);
    await page.reload();
    await expect(nameMenu(page)).toBeVisible();
    expect(await shownOn(picture)).toBe(whole);
    expect(await page.evaluate(() => window.__introSeen)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await fx.close();
  }
});
