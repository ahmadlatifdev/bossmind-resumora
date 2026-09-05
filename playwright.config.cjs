// @ts-check
const { defineConfig } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Load BossMind vault + local env for admin unlock (never log values).
const envFiles = [
  path.join('D:', 'BossMind', 'config', 'secrets.env'),
  path.join(__dirname, '.env'),
  path.join(__dirname, '.env.local'),
];
for (const file of envFiles) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(
      /^(ADMIN_REFUND_PASSWORD|ADMIN_PASSWORD|SELF_HEAL_ADMIN_PASSWORD|VITE_ADMIN_PASSWORD)=(.*)$/
    );
    if (!m) continue;
    const key = m[1];
    let val = m[2] ?? '';
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /.*hermes-chat\.spec\.cjs/,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npx vite --host 127.0.0.1 --port 5173',
        url: 'http://127.0.0.1:5173/admin.html',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
