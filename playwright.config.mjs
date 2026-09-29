import { defineConfig, devices } from '@playwright/test';

/* Every test starts its own Crumb server on a random port with a throwaway
 * database (tests/e2e/fixtures.mjs), so tests never share or touch real data. */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
