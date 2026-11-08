import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright "Synthetic User" runner.
 *
 * - Local dev:      PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test
 * - Staging/live:   PLAYWRIGHT_BASE_URL=https://client-resumora-live.web.app npx playwright test
 *   (defaults to the production Hosting URL)
 *
 * Only `*.spec.ts` files are matched, so the existing `node:test` suites
 * (`*.test.ts`) are never picked up by Playwright.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://client-resumora-live.web.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
