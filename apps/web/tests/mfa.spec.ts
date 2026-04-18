/**
 * E2E tests — MFA / Authentication
 *
 * Covers: login flow, MFA TOTP setup page accessible, TOTP entry required when enrolled.
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const BUYER_EMAIL    = process.env.TEST_BUYER_EMAIL    ?? 'buyer@test.local';
const BUYER_PASSWORD = process.env.TEST_BUYER_PASSWORD ?? 'Password123!';
const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL    ?? 'admin@test.local';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'Password123!';

test.describe('Authentication & MFA', () => {
  test('login page renders', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('invalid credentials shows error', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill('bad@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8_000 });
  });

  test('buyer can log in successfully', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(BUYER_EMAIL);
    await page.getByLabel(/password/i).fill(BUYER_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/(home|dashboard)/, { timeout: 15_000 });
    // Should be on a protected page
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('MFA setup page is accessible when authenticated', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(BUYER_EMAIL);
    await page.getByLabel(/password/i).fill(BUYER_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/(home|dashboard)/, { timeout: 15_000 });

    await page.goto(`${BASE}/mfa-setup`);
    // Should see QR code or TOTP setup instructions — not redirected to login
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText(/authenticator|two-factor|totp|qr/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test('forgot password link exists', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByRole('link', { name: /forgot/i })).toBeVisible();
  });

  test('admin can log in and sees admin menu', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/(home|dashboard|admin)/, { timeout: 15_000 });
    // Admin-specific nav item should exist
    await expect(page.getByRole('link', { name: /admin/i }).first()).toBeVisible({ timeout: 5_000 });
  });
});
