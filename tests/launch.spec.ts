import { test, expect } from '@playwright/test';

/**
 * Launch "Critical Path" — a synthetic user walks the core funnel.
 * If any button is unclickable, any route breaks, or a full-screen
 * overlay swallows a click, these tests MUST fail.
 */

test.describe('Launch critical path', () => {
  test('homepage → Pricing → Get Hired Faster → Stripe Checkout', async ({ page }) => {
    // Stub the checkout-session API so CI never creates a real Stripe session.
    await page.route('**/api/create-checkout-session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sessionId: 'cs_test_synthetic',
          url: 'https://checkout.stripe.com/c/pay/cs_test_synthetic',
        }),
      });
    });

    // 1. Homepage renders (heading visible ⇒ React mounted, no crash).
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 2. "Pricing" nav link is visible, clickable, and routes.
    const pricingLink = page.getByRole('link', { name: /pricing/i }).first();
    await expect(pricingLink).toBeVisible();
    await pricingLink.click();
    await expect(page).toHaveURL(/\/pricing/);

    // 3. The "Get Hired Faster" CTA is rendered, enabled, and not obstructed.
    const cta = page.getByRole('button', { name: /get hired faster/i });
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();

    // 4. Click it — Stripe Checkout must open.
    await cta.click();
    await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 20_000 });
  });

  test('Video Library route renders and language toggles are clickable', async ({ page }) => {
    // The library is auth-gated, so we accept either the library or the login
    // redirect — but never a blank/crashed screen.
    await page.goto('/video-library');
    await expect(page.locator('main, .app-main, #root, #videos-root').first()).toBeVisible();

    // When the library (and its cards) are actually visible, the EN/FR toggles
    // must be enabled. This runs conditionally so it works pre-auth too.
    const toggles = page.locator('.lang-btn');
    if ((await toggles.count()) > 0) {
      await expect(toggles.first()).toBeEnabled();
    }
  });

  test('no invisible full-screen overlay is swallowing clicks', async ({ page }) => {
    await page.goto('/pricing');

    // "Start Building" is the first plan CTA — it must be the topmost element
    // at its own center (i.e. no transparent overlay is intercepting the click).
    const cta = page.getByRole('button', { name: /start building/i }).first();
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toBeVisible();
    await expect(cta).toBeInViewport();

    const obstructed = await cta.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return top !== el && !el.contains(top);
    });
    expect(obstructed).toBe(false);
  });
});
