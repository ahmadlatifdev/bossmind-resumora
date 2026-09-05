// @ts-check
const { defineConfig } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Load BossMind vault for admin unlock (never log values).
const vault = path.join('D:', 'BossMind', 'config', 'secrets.env');
if (fs.existsSync(vault)) {
  const text = fs.readFileSync(vault, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(
      /^(ADMIN_REFUND_PASSWORD|ADMIN_PASSWORD|SELF_HEAL_ADMIN_PASSWORD)=(.*)$/
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

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /.*hermes-chat\.spec\.cjs/,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'https://resumora.net',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
