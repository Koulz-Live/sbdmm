/**
 * playwright.config.ts — Platform-wide E2E test configuration
 *
 * Tests run against a locally running web (port 5173) and API (port 3001).
 * For CI, set the environment variables listed below so the tests target
 * staging credentials without hard-coding them.
 *
 * Environment variables:
 *   E2E_BASE_URL          — web app URL (default: http://localhost:5173)
 *   E2E_BUYER_EMAIL       — test buyer account email
 *   E2E_BUYER_PASSWORD    — test buyer account password
 *   E2E_ADMIN_EMAIL       — test tenant_admin account email
 *   E2E_ADMIN_PASSWORD    — test tenant_admin account password
 *   E2E_SUPER_EMAIL       — test super_admin account email
 *   E2E_SUPER_PASSWORD    — test super_admin account password
 *
 * SECURITY:
 * - All credentials come from environment variables — never from committed files
 * - Tests use dedicated staging accounts, never production data
 * - Playwright stores session state in /tmp (excluded from git)
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/tests',
  fullyParallel: true,
  // Retry twice in CI to handle flaky network conditions
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    // JUnit for CI artifact upload
    ...(process.env['CI'] ? [['junit', { outputFile: 'playwright-results.xml' }] as [string, Record<string, string>]] : []),
  ],
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:5173',
    // Trace on first retry — helps diagnose flaky tests without slowing every run
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Fail fast on navigation — surface broken routes quickly
    navigationTimeout: 10_000,
    actionTimeout: 8_000,
  },
  projects: [
    // Setup project: runs auth fixture to save session state
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    // Desktop Chrome — primary test target
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    // Firefox for cross-browser coverage in CI
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },
  ],
  // Start the Vite dev server before tests if not already running
  webServer: {
    command: 'npm run dev --workspace=apps/web',
    url: process.env['E2E_BASE_URL'] ?? 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
});
