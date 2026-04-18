/**
 * E2E tests — Saves / Collections
 *
 * Covers: create collection, share link, export CSV button enabled.
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const BUYER_EMAIL    = process.env.TEST_BUYER_EMAIL    ?? 'buyer@test.local';
const BUYER_PASSWORD = process.env.TEST_BUYER_PASSWORD ?? 'Password123!';

test.describe('Saves & Collections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(BUYER_EMAIL);
    await page.getByLabel(/password/i).fill(BUYER_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/home');
    await page.goto(`${BASE}/saves`);
  });

  test('saves page loads', async ({ page }) => {
    await expect(page.getByText(/your saved ideas/i)).toBeVisible({ timeout: 10_000 });
  });

  test('create collection button opens form', async ({ page }) => {
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
  });

  test('create and open collection shows share + export buttons', async ({ page }) => {
    // Create a new collection
    await page.getByRole('button', { name: /create/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/collection name/i).fill('E2E Test Collection');
    await dialog.getByRole('button', { name: /create/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Click into it
    await page.getByText('E2E Test Collection').first().click();

    // Share and Export buttons appear
    await expect(page.getByRole('button', { name: /share/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: /export csv/i })).toBeVisible();
  });

  test('shared collection public page loads by token', async ({ page }) => {
    // Navigate to a fake token — expect 404 message not a crash
    await page.goto(`${BASE}/shared/00000000-0000-0000-0000-000000000000`);
    await expect(page.getByText(/not found|no longer shared/i)).toBeVisible({ timeout: 8_000 });
  });
});
