/* A field with a mistake in it has a red border (--minus), whatever kind of field it is and
 * whatever the team's theme: a text field on the Settings page, and a password field on the
 * setup page. Every person and team here is invented. */
import { test, expect } from '@playwright/test';
import { provision, startCrumb } from './fixtures.mjs';
import { parseColour } from '../contrast.mjs';

const SIDES = ['top', 'right', 'bottom', 'left'];

/* The four border colours of a field, and the --minus and --field-border it sits under, all as
 * rgb() so they compare however the stylesheet writes them. */
const borderOf = locator => locator.evaluate(node => {
  const style = getComputedStyle(node);
  return {
    sides: ['top', 'right', 'bottom', 'left'].map(side => style.getPropertyValue(`border-${side}-color`)),
    minus: style.getPropertyValue('--minus').trim(),
    fieldBorder: style.getPropertyValue('--field-border').trim(),
  };
});
const rgb = text => {
  const { r, g, b } = parseColour(text);
  return `rgb(${r}, ${g}, ${b})`;
};

/* Polled: a border colour changes through a transition (0.01 ms under reduced motion), and a
 * page that draws its form again can leave a field it has just taken out, which has no style. */
async function expectBorder(field, variable) {
  await expect.poll(async () => {
    const { sides, minus, fieldBorder } = await borderOf(field);
    if (!minus || !fieldBorder) return 'not on the page';
    expect(rgb(minus)).not.toBe(rgb(fieldBorder));
    return sides.map(side => (side === rgb(variable === '--minus' ? minus : fieldBorder) ? variable : side));
  }, `every side is ${variable}`).toEqual(SIDES.map(() => variable));
}
const expectRed = field => expectBorder(field, '--minus');

for (const theme of ['default', 'bakery', 'cafe']) {
  test(`${theme}: a text field left empty on Settings has a red border`, async ({ browser }) => {
    const fx = await provision(browser, { mode: 'credit', spending: 'self', theme });
    try {
      const page = fx.ownerPage;
      await page.goto(`${fx.origin}/#/settings`);
      await expect(page.getByRole('heading', { name: 'Who did what' })).toBeVisible();
      const name = page.getByLabel('Organization name', { exact: true });
      await expectBorder(name, '--field-border');
      await name.fill('');
      await page.getByRole('button', { name: 'Save settings', exact: true }).click();
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await expectRed(name);
      // Mended, it goes back to the usual border.
      await name.fill('Northside Coffee Co.');
      await page.getByRole('button', { name: 'Save settings', exact: true }).click();
      await expect(name).not.toHaveAttribute('aria-invalid', 'true');
      await expectBorder(name, '--field-border');
    } finally {
      await fx.close();
    }
  });
}

test('a password that is too short on the setup page has a red border, whichever theme card is chosen', async ({ browser }) => {
  const crumb = await startCrumb();
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.goto(crumb.origin);
    await expect(page.getByRole('heading', { name: 'Set up Crumb' })).toBeVisible();
    const password = page.getByLabel('Password', { exact: true });
    for (const theme of ['default', 'bakery', 'cafe']) {
      await page.locator(`input[name="theme"][value="${theme}"]`).check();
      await password.fill('short');
      await page.getByRole('button', { name: 'Create organization', exact: true }).click();
      await expect(password).toHaveAttribute('aria-invalid', 'true');
      await expectRed(password);
    }
  } finally {
    await context.close();
    await crumb.close();
  }
});
