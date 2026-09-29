/* The public demo is a static page with no server: open it straight from disk. */
import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const DEMO = pathToFileURL(resolve('index.html')).href;
const filled = page => page.locator('#slots .slot.filled');

test('the tour plays by itself, hands over control, and the collection survives spending', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator('#get-note')).toHaveText('Playing on its own');
  await expect(page.locator('#caption-text')).toContainText('Sam');

  await page.getByRole('button', { name: 'Take control', exact: true }).click();
  await expect(page.locator('#get-note')).toHaveText('You’re driving');
  await page.getByRole('button', { name: 'Reset the demo', exact: true }).click();
  await expect(page.locator('#balance-text')).toHaveText('$84.25');
  await expect(filled(page)).toHaveCount(6);

  await page.locator('[data-grant="50"]').click();
  await expect(page.locator('#balance-text')).toHaveText('$134.25');
  await expect(filled(page)).toHaveCount(7);

  await page.locator('#spend').click();
  for (const key of ['1', '2', '5', '0']) await page.locator('.sheet .key', { hasText: new RegExp(`^${key}$`) }).click();
  await page.locator('#sheet-ok').click();
  await expect(page.locator('#balance-text')).toHaveText('$121.75');
  await expect(filled(page)).toHaveCount(7);

  await page.getByRole('button', { name: 'Reset the demo', exact: true }).click();
  await expect(page.locator('#balance-text')).toHaveText('$84.25');
  await expect(filled(page)).toHaveCount(6);
});

test('the demo says it is a demo and points to the real thing', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.getByText(/invented/i).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /deploy/i }).first()).toHaveAttribute('href', /DEPLOYMENT\.md$/);
  await expect(page.getByRole('link', { name: /feedback/i }).first()).toHaveAttribute('href', /issues\/new\/choose$/);
  await expect(page).toHaveTitle(/appreciation/i);
});

test('with reduced motion the tour waits for the visitor', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(DEMO);
  await expect(page.locator('#get-note')).toHaveText('You’re driving');
  await context.close();
});
