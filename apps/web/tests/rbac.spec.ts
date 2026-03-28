/**
 * rbac.spec.ts — Role-Based Access Control E2E tests
 *
 * Verifies that:
 *  1. Buyer cannot access /admin (redirected to /unauthorized)
 *  2. Buyer cannot access /vendors (tenant_admin only)
 *  3. Super admin can access /admin
 *  4. The API correctly returns 403 for cross-role requests
 *     (tested via page.route interception — no real API calls needed)
 *
 * These tests use saved auth state from auth.setup.ts.
 * They are intentionally fast — they test navigation guards, not full data flows.
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';

const STATE_DIR = '/tmp/e2e-state';

// ─── Buyer role ────────────────────────────────────────────────────────────────

test.describe('Buyer role restrictions', () => {
  test.use({ storageState: path.join(STATE_DIR, 'buyer.json') });

  async function skipIfNoState(page: Page): Promise<void> {
    const hasState = await page.context().storageState().then(() => true).catch(() => false);
    test.skip(!hasState, 'No buyer auth state available');
  }

  test('buyer is redirected away from /admin', async ({ page }) => {
    await skipIfNoState(page);
    await page.goto('/admin');
    // Should either redirect to /unauthorized or /dashboard — NOT render the admin panel
    await expect(page).not.toHaveURL(/\/admin/, { timeout: 5_000 });
  });

  test('buyer is redirected away from /vendors', async ({ page }) => {
    await skipIfNoState(page);
    await page.goto('/vendors');
    await expect(page).not.toHaveURL(/\/vendors/, { timeout: 5_000 });
  });

  test('buyer can access /dashboard', async ({ page }) => {
    await skipIfNoState(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8_000 });
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('buyer can access /orders', async ({ page }) => {
    await skipIfNoState(page);
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible({ timeout: 8_000 });
  });

  test('API returns 403 when buyer calls admin endpoint', async ({ page }) => {
    await skipIfNoState(page);
    // Use page.evaluate to fire the fetch directly in the browser context
    // (so the real session cookie/token is used)
    const { status } = await page.evaluate(async () => {
      const res = await fetch('/api/v1/admin/tenants', {
        headers: { 'Content-Type': 'application/json' },
      });
      return { status: res.status };
    });
    expect(status).toBe(403);
  });
});

// ─── Tenant Admin role ─────────────────────────────────────────────────────────

test.describe('Tenant Admin access', () => {
  test.use({ storageState: path.join(STATE_DIR, 'admin.json') });

  async function skipIfNoState(page: Page): Promise<void> {
    const hasState = await page.context().storageState().then(() => true).catch(() => false);
    test.skip(!hasState, 'No admin auth state available');
  }

  test('tenant_admin can access /vendors', async ({ page }) => {
    await skipIfNoState(page);
    await page.goto('/vendors');
    await expect(page.getByRole('heading', { name: /vendors/i })).toBeVisible({ timeout: 8_000 });
  });

  test('tenant_admin is redirected away from /admin (super_admin only)', async ({ page }) => {
    await skipIfNoState(page);
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin$/, { timeout: 5_000 });
  });

  test('tenant_admin sees "Onboard Vendor" button on vendors page', async ({ page }) => {
    await skipIfNoState(page);
    await page.goto('/vendors');
    await expect(page.getByRole('button', { name: /onboard vendor/i })).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Super Admin role ──────────────────────────────────────────────────────────

test.describe('Super Admin access', () => {
  test.use({ storageState: path.join(STATE_DIR, 'super.json') });

  async function skipIfNoState(page: Page): Promise<void> {
    const hasState = await page.context().storageState().then(() => true).catch(() => false);
    test.skip(!hasState, 'No super_admin auth state available');
  }

  test('super_admin can access /admin', async ({ page }) => {
    await skipIfNoState(page);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /platform admin/i })).toBeVisible({ timeout: 10_000 });
  });

  test('/admin shows Tenants, Users, and Audit Log tabs', async ({ page }) => {
    await skipIfNoState(page);
    await page.goto('/admin');
    await expect(page.getByRole('button', { name: /tenants/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /users/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /audit log/i })).toBeVisible();
  });
});
