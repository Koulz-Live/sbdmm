/**
 * monitoring.ts — Sentry initialisation for the React frontend
 *
 * MUST be imported at the very top of main.tsx (before React is initialised)
 * so Sentry can instrument XHR, fetch, and React component errors.
 *
 * Environment variables (set in .env.local or CI):
 *   VITE_SENTRY_DSN              — Sentry project DSN (omit to disable)
 *   VITE_SENTRY_ENVIRONMENT      — e.g. "production", "staging" (default: MODE)
 *   VITE_SENTRY_TRACES_SAMPLE_RATE  — float 0–1 (default: 0.1 in prod, 1.0 in dev)
 *
 * SECURITY:
 * - sendDefaultPii: false  — never send user IP, cookies, or request bodies
 * - PII scrub: beforeSend removes auth-related fields from captured data
 * - Replay is NOT enabled — session replay can capture sensitive form data
 * - Source maps: uploaded via @sentry/vite-plugin during CI build (not included in bundle)
 */

/// <reference types="vite/client" />

import * as Sentry from '@sentry/react';

const dsn = import.meta.env['VITE_SENTRY_DSN'] as string | undefined;
const environment = (import.meta.env['VITE_SENTRY_ENVIRONMENT'] as string | undefined) ?? import.meta.env.MODE;
const isProd = import.meta.env.PROD;

const PII_FIELDS = new Set([
  'password', 'token', 'secret', 'key', 'authorization',
  'access_token', 'refresh_token',
]);

function scrubPii(obj: unknown, depth = 0): unknown {
  if (depth > 4 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((i) => scrubPii(i, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = PII_FIELDS.has(k.toLowerCase()) ? '[REDACTED]' : scrubPii(v, depth + 1);
  }
  return out;
}

if (dsn) {
  const sampleRate = isProd
    ? parseFloat((import.meta.env['VITE_SENTRY_TRACES_SAMPLE_RATE'] as string | undefined) ?? '0.1')
    : 1.0;

  Sentry.init({
    dsn,
    environment,
    // Performance monitoring — capture a sample of page load / navigation transactions
    tracesSampleRate: Math.min(1.0, Math.max(0, sampleRate)),
    // SECURITY: Never send cookies, local storage, or PII
    sendDefaultPii: false,
    // Limit breadcrumb retention to reduce noise / PII exposure
    maxBreadcrumbs: 30,

    integrations: [
      // Browser tracing for Core Web Vitals and API call spans
      Sentry.browserTracingIntegration(),
    ],

    beforeSend(event) {
      // Scrub any captured form data / request body
      if (event.request?.data) {
        event.request.data = scrubPii(event.request.data) as typeof event.request.data;
      }
      // Remove cookies from breadcrumbs
      if (event.request?.cookies) {
        event.request.cookies = {};
      }
      return event;
    },

    // Don't report network errors that are expected (user offline, aborted requests)
    ignoreErrors: [
      'AbortError',
      'NetworkError',
      'Network request failed',
      /^Loading chunk \d+ failed/,
    ],
  });
}

// Re-export for use in React error boundaries and async catch blocks
export { Sentry };

/**
 * captureWebException — call this in React error boundaries and async catch blocks.
 * Includes the current page path as a tag for filtering in Sentry.
 */
export function captureWebException(
  err: unknown,
  context?: { userId?: string; tenantId?: string },
): void {
  if (!dsn) return;
  Sentry.withScope((scope) => {
    scope.setTag('page', window.location.pathname);
    if (context?.userId) scope.setUser({ id: context.userId });
    if (context?.tenantId) scope.setTag('tenant_id', context.tenantId);
    Sentry.captureException(err);
  });
}
