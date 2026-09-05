/**
 * Hermes Chat production QA
 *
 * DOM (production):
 * - #hermes-chat .admin-harness-chat
 * - .admin-harness-chat__bubble--user | --assistant
 * - thinking: text /Hermes is thinking/i
 * - patch: button Attach code patch + textarea.admin-harness-chat__code
 * - API: POST /api/admin/hermes-command
 *
 * Auth: ADMIN_REFUND_PASSWORD from gcloud/env (never logged).
 * UI tests mock hermes-command replies so chat UI is verified even when Hermes tunnel is down.
 */
const { test, expect } = require('@playwright/test');

const BASE_URL = 'https://resumora.net/admin/master#hermes-chat';

function adminPassword() {
  return (
    process.env.ADMIN_REFUND_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    process.env.SELF_HEAL_ADMIN_PASSWORD ||
    ''
  );
}

async function unlockAdmin(page) {
  const pw = adminPassword();
  test.skip(!pw, 'Admin password not available in env/vault — cannot unlock production admin');

  const passwordInput = page.locator('input[type="password"]').first();
  if (await passwordInput.isVisible({ timeout: 4000 }).catch(() => false)) {
    await passwordInput.fill(pw);
    await page.getByRole('button', { name: /unlock/i }).click();
    await expect(page.getByRole('heading', { name: /master operations/i })).toBeVisible({
      timeout: 20000,
    });
  }
}

async function openHermesChat(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await unlockAdmin(page);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const section = page.locator('#hermes-chat');
  await section.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    document.getElementById('hermes-chat')?.scrollIntoView({ block: 'center' });
  });
  await expect(section).toBeVisible();
}

async function selectProject(page, name) {
  const select = page.locator('#hermes-chat select').first();
  await select.selectOption({ label: name });
}

async function sendMessage(chat, text) {
  const input = chat.getByPlaceholder(/summarize health/i);
  await input.scrollIntoViewIfNeeded();
  await input.fill(text);
  await input.evaluate((el) => {
    const form = el.closest('form');
    if (form) form.requestSubmit();
    else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

async function mockHermesOk(page, reply) {
  await page.route('**/api/admin/hermes-command', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          engine: 'hermes',
          projectId: 'resumora',
          reply,
          patchStored: true,
        }),
      });
      return;
    }
    await route.continue();
  });
}

test.describe('Hermes Chat Production QA', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openHermesChat(page);
  });

  test('1. Message bubbles, response area, and Clear Chat', async ({ page }) => {
    await mockHermesOk(
      page,
      'Health looks stable for Resumora. Score is within normal range.'
    );
    await selectProject(page, 'Resumora');

    const chat = page.locator('#hermes-chat .admin-harness-chat');
    await sendMessage(chat, 'Summarize health for this project');

    await expect(chat.locator('.admin-harness-chat__bubble--user')).toBeVisible({
      timeout: 10000,
    });
    await expect(chat.locator('.admin-harness-chat__bubble--assistant')).toBeVisible({
      timeout: 15000,
    });
    await expect(chat.locator('.admin-harness-chat__bubble--assistant')).toContainText(/Health looks stable/i);

    await chat.getByRole('button', { name: /clear chat/i }).click({ force: true });
    await expect(chat.locator('.admin-harness-chat__bubble--user')).toHaveCount(0);
    await expect(chat.locator('.admin-harness-chat__bubble--assistant')).toHaveCount(0);
  });

  test('2. Markdown rendering and Copy to Clipboard', async ({ page }) => {
    await mockHermesOk(
      page,
      'Here is a script:\n\n```bash\necho hello\n```\n'
    );
    await selectProject(page, 'Resumora');

    const chat = page.locator('#hermes-chat .admin-harness-chat');
    await sendMessage(chat, 'Give me a bash script to clear the cache');

    await expect(chat.locator('.admin-harness-chat__bubble--assistant')).toBeVisible({
      timeout: 15000,
    });
    await expect(chat.locator('.admin-md-code')).toBeVisible();

    await chat.getByRole('button', { name: /^copy$/i }).first().click({ force: true });
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.length).toBeGreaterThan(0);
    expect(clipboardText).toMatch(/echo hello/);
  });

  test('3. Thinking state appears during API fetch', async ({ page }) => {
    await page.route('**/api/admin/hermes-command', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          engine: 'hermes',
          reply: 'Done after delay.',
        }),
      });
    });

    await selectProject(page, 'Resumora');

    const chat = page.locator('#hermes-chat .admin-harness-chat');
    await sendMessage(chat, 'Do something slow');

    await expect(chat.getByText(/thinking/i).first()).toBeVisible({ timeout: 3000 });
  });

  test('4. Attach Code Patch stored per project', async ({ page }) => {
    await page.unroute('**/api/admin/hermes-command').catch(() => {});
    await mockHermesOk(page, 'Patch received and stored for project context.');
    await selectProject(page, 'Resumora');

    const chat = page.locator('#hermes-chat .admin-harness-chat');
    await chat.getByRole('button', { name: /attach code patch/i }).click({ force: true });

    const patchBox = chat.locator('textarea.admin-harness-chat__code');
    await expect(patchBox).toBeVisible();
    await patchBox.fill('console.log("Patch code 1");');

    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/admin/hermes-command') && res.request().method() === 'POST',
      { timeout: 20000 }
    );
    await sendMessage(chat, 'Please review this patch');
    const res = await responsePromise;
    expect(res.ok()).toBeTruthy();

    await expect(chat.locator('.admin-harness-chat__bubble--user')).toContainText(
      'console.log("Patch code 1");'
    );
    await expect(chat.locator('.admin-harness-chat__bubble--assistant')).toBeVisible({
      timeout: 15000,
    });
    await expect(chat.locator('.admin-harness-chat__bubble--assistant')).toContainText(
      /Patch received/i
    );

    await selectProject(page, 'ElegancyArt');
    await expect(chat.getByText('console.log("Patch code 1");')).toHaveCount(0);

    await selectProject(page, 'Resumora');
    await expect(chat.locator('.admin-harness-chat__bubble--user')).toContainText(
      'console.log("Patch code 1");'
    );
  });
});
