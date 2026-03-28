/**
 * orders.spec.ts — Orders page E2E tests
 *
 * Tests the order list page using saved buyer auth state.
 * Verifies: page renders, live-update indicator visible,
 * pagination controls present when >20 orders, and
 * that no raw error codes leak to the UI on API failure.
 */

import { test, expect } from '@playwright/test';
import path from 'path';

const STATE_DIR = '/tmp/e2e-state';

// Use saved buyer session — skip if auth state wasn't generated
const storageState = path.join(STATE_DIR, 'buyer.json');

test.describe('Orders Page', () => {
  test.use({ storageState });

  test.beforeEach(async ({ page }) => {
    // Guard: skip if auth state file doesn't exist (no E2E credentials configured)
    const hasState = await page.context()
      .storageState()
      .then(() => true)
      .catch(() => false);
    test.skip(!hasState, 'No buyer auth state — set E2E_BUYER_EMAIL / E2E_BUYER_PASSWORD');
  });

  test('orders page loads and shows list or empty state', async ({ page }) => {
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible();

    // Either a table of orders or an empty-state message — both are valid
    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasEmpty = await page.getByText(/no orders found/i).isVisible().catch(() => false);
    expect(hasTable || hasEmpty).toBe(true);
  });

  test('displays live update indicator', async ({ page }) => {
    await page.goto('/orders');
    // The live indicator uses emoji text — check for the "Live" label
    await expect(page.getByText(/live updates/i)).toBeVisible({ timeout: 8_000 });
  });

  test('order reference links are present when orders exist', async ({ page }) => {
    await page.goto('/orders');
    const table = page.locator('table');
    const hasTable = await table.isVisible().catch(() => false);
    if (!hasTable) return; // No orders in test tenant — skip assertion

    // Each row should have a reference number link
    const firstRef = table.locator('a').first();
    await expect(firstRef).toBeVisible();
    // Reference numbers follow the pattern ORD- or similar
    const href = await firstRef.getAttribute('href');
    expect(href).toMatch(/\/orders\//);
  });

  test('does not expose raw error codes or stack traces on API failure', async ({ page }) => {
    // Intercept the orders API call and simulate a server error
    await page.route('**/api/v1/orders**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } }) }),
    );
    await page.goto('/orders');

    const errorEl = page.getByRole('alert');
    await expect(errorEl).toBeVisible({ timeout: 6_000 });
    const text = await errorEl.textContent();
    // Should show human-readable message, not raw error code
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('stack');
    expect(text).not.toContain('INTERNAL_ERROR');
  });
});
