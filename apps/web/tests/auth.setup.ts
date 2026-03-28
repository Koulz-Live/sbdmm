/**
 * auth.setup.ts — Authentication state fixture
 *
 * Runs before any test project that declares `dependencies: ['setup']`.
 * Logs in as each test role and saves the browser storage state so
 * subsequent tests skip the login page entirely — faster and more reliable.
 *
 * Saved state files are written to /tmp/e2e-state/ (outside the repo).
 * They contain session cookies — never commit them to git.
 *
 * HUMAN DECISION: Create dedicated E2E test accounts in Supabase staging.
 * These accounts should have limited permissions and no access to production data.
 */

import { test as setup } from '@playwright/test';

const STATE_DIR = '/tmp/e2e-state';

// Reusable login helper — fills the login form and waits for the dashboard
async function loginAs(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Wait for redirect to dashboard — confirms auth succeeded
  await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
}

setup('authenticate as buyer', async ({ page }) => {
  const email = process.env['E2E_BUYER_EMAIL'] ?? '';
  const password = process.env['E2E_BUYER_PASSWORD'] ?? '';
  if (!email || !password) {
    console.warn('[E2E] Skipping buyer auth setup — E2E_BUYER_EMAIL / E2E_BUYER_PASSWORD not set');
    return;
  }
  await loginAs(page, email, password);
  await page.context().storageState({ path: `${STATE_DIR}/buyer.json` });
});

setup('authenticate as tenant_admin', async ({ page }) => {
  const email = process.env['E2E_ADMIN_EMAIL'] ?? '';
  const password = process.env['E2E_ADMIN_PASSWORD'] ?? '';
  if (!email || !password) {
    console.warn('[E2E] Skipping admin auth setup — E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set');
    return;
  }
  await loginAs(page, email, password);
  await page.context().storageState({ path: `${STATE_DIR}/admin.json` });
});

setup('authenticate as super_admin', async ({ page }) => {
  const email = process.env['E2E_SUPER_EMAIL'] ?? '';
  const password = process.env['E2E_SUPER_PASSWORD'] ?? '';
  if (!email || !password) {
    console.warn('[E2E] Skipping super_admin auth setup — E2E_SUPER_EMAIL / E2E_SUPER_PASSWORD not set');
    return;
  }
  await loginAs(page, email, password);
  await page.context().storageState({ path: `${STATE_DIR}/super.json` });
});
