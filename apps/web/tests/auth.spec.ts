/**
 * auth.spec.ts — Authentication flow tests
 *
 * Tests the full login → dashboard → sign-out cycle.
 * Also verifies that unauthenticated users are redirected to /login
 * and that invalid credentials show an error without leaking internals.
 *
 * These tests do NOT use the saved auth state — they exercise the raw login form.
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('redirects unauthenticated user to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows login form with email and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows error message for invalid credentials without leaking internals', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('notreal@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword123');
    await page.getByRole('button', { name: /sign in/i }).click();

    // Error should be user-friendly, not a stack trace or DB error
    const errorEl = page.getByRole('alert');
    await expect(errorEl).toBeVisible({ timeout: 8_000 });
    const errorText = await errorEl.textContent();
    expect(errorText).not.toContain('stack');
    expect(errorText).not.toContain('supabase');
    expect(errorText).not.toContain('undefined');
    expect(errorText).not.toContain('null');
    // Must still be on login
    await expect(page).toHaveURL(/\/login/);
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    const email = process.env['E2E_BUYER_EMAIL'];
    const password = process.env['E2E_BUYER_PASSWORD'];
    test.skip(!email || !password, 'E2E_BUYER_EMAIL / E2E_BUYER_PASSWORD not set');

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
  });

  test('sign-out returns user to login page', async ({ page }) => {
    const email = process.env['E2E_BUYER_EMAIL'];
    const password = process.env['E2E_BUYER_PASSWORD'];
    test.skip(!email || !password, 'E2E_BUYER_EMAIL / E2E_BUYER_PASSWORD not set');

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 });
  });

  test('/unauthorized page renders for forbidden routes', async ({ page }) => {
    await page.goto('/unauthorized');
    await expect(page.getByRole('heading')).toBeVisible();
    // Should not expose technical details
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('stack');
  });
});
