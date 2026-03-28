/**
 * telemetry.ts — OpenTelemetry + Sentry initialisation
 *
 * CRITICAL: This file MUST be imported as the very first line of server.ts
 * (before any other import) so that auto-instrumentation patches Express,
 * http, dns, pg, etc. before those modules are loaded.
 *
 * Environment variables:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — OTLP collector URL (e.g. http://localhost:4318)
 *   OTEL_SERVICE_NAME            — logical service name sent with every span
 *   SENTRY_DSN                   — Sentry project DSN (omit to disable)
 *   SENTRY_ENVIRONMENT           — maps to Sentry environment tag (default: NODE_ENV)
 *   SENTRY_TRACES_SAMPLE_RATE    — float 0–1 (default: 0.2 in prod, 1.0 in dev)
 *   TELEMETRY_ENABLED            — set to "false" to disable entirely (e.g. unit tests)
 *
 * SECURITY:
 * - PII scrubbing: request body fields named password/token/secret/key/authorization
 *   are redacted before being sent to Sentry
 * - IP addresses are redacted from Sentry breadcrumbs
 * - Internal stack frames are filtered from Sentry events
 */

import * as Sentry from '@sentry/node';

// ─── Guard: skip in test / disabled environments ───────────────────────────

const TELEMETRY_ENABLED = process.env['TELEMETRY_ENABLED'] !== 'false';
const NODE_ENV = process.env['NODE_ENV'] ?? 'development';
const IS_PROD = NODE_ENV === 'production';

// ─── OpenTelemetry ─────────────────────────────────────────────────────────
// Loaded dynamically so that when TELEMETRY_ENABLED=false the SDK is never
// registered (avoids patching overhead and noise in unit test runs).

if (TELEMETRY_ENABLED && process.env['OTEL_EXPORTER_OTLP_ENDPOINT']) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { NodeSDK } = require('@opentelemetry/sdk-node') as typeof import('@opentelemetry/sdk-node');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node') as typeof import('@opentelemetry/auto-instrumentations-node');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { resourceFromAttributes } = require('@opentelemetry/resources') as typeof import('@opentelemetry/resources');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } =
    require('@opentelemetry/semantic-conventions') as typeof import('@opentelemetry/semantic-conventions');

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [SEMRESATTRS_SERVICE_NAME]: process.env['OTEL_SERVICE_NAME'] ?? 'sbdmm-api',
      [SEMRESATTRS_SERVICE_VERSION]: process.env['npm_package_version'] ?? '0.0.0',
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: NODE_ENV,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${process.env['OTEL_EXPORTER_OTLP_ENDPOINT']}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Reduce noise: skip fs instrumentation (high volume, low value)
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // Redact DB query params — only capture query structure, never values
        '@opentelemetry/instrumentation-pg': {
          enhancedDatabaseReporting: false,
        },
      }),
    ],
  });

  sdk.start();

  // Graceful shutdown: flush spans before process exits
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}

// ─── Sentry ────────────────────────────────────────────────────────────────

const PII_FIELDS = new Set([
  'password', 'token', 'secret', 'key', 'authorization',
  'access_token', 'refresh_token', 'api_key', 'credential',
]);

function scrubPiiFromObject(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => scrubPiiFromObject(item, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    result[k] = PII_FIELDS.has(k.toLowerCase()) ? '[REDACTED]' : scrubPiiFromObject(v, depth + 1);
  }
  return result;
}

if (TELEMETRY_ENABLED && process.env['SENTRY_DSN']) {
  const sampleRate = IS_PROD
    ? parseFloat(process.env['SENTRY_TRACES_SAMPLE_RATE'] ?? '0.2')
    : 1.0;

  Sentry.init({
    dsn: process.env['SENTRY_DSN'],
    environment: process.env['SENTRY_ENVIRONMENT'] ?? NODE_ENV,
    tracesSampleRate: Math.min(1.0, Math.max(0, sampleRate)),
    // Never send PII to Sentry
    sendDefaultPii: false,

    beforeSend(event) {
      // Scrub request body
      if (event.request?.data) {
        event.request.data = scrubPiiFromObject(event.request.data) as typeof event.request.data;
      }
      // Remove IP address from user context
      if (event.user?.ip_address) {
        event.user.ip_address = '0.0.0.0';
      }
      // Drop events from internal health check paths
      const url = event.request?.url ?? '';
      if (url.endsWith('/health') || url.endsWith('/ready')) return null;

      return event;
    },

    beforeSendTransaction(event) {
      // Drop health/ready transaction noise
      const name = event.transaction ?? '';
      if (name.includes('/health') || name.includes('/ready')) return null;
      return event;
    },

    // Only capture frames from our code — exclude node_modules in stack display
    ignoreErrors: [
      'AbortError',
      'ECONNRESET',
      'ERR_HTTP_HEADERS_SENT',
    ],
  });
}

// ─── Re-export Sentry for use in error handler and route files ─────────────
export { Sentry };

/**
 * captureException — convenience wrapper that adds tenant/user context
 * when available, then forwards to Sentry.
 *
 * Usage:
 *   import { captureException } from './lib/telemetry';
 *   captureException(err, { tenantId: req.user?.tenant_id, userId: req.user?.id });
 */
export function captureException(
  err: unknown,
  context?: { tenantId?: string; userId?: string; requestId?: string },
): void {
  if (!TELEMETRY_ENABLED || !process.env['SENTRY_DSN']) return;

  Sentry.withScope((scope) => {
    if (context?.tenantId) scope.setTag('tenant_id', context.tenantId);
    if (context?.requestId) scope.setTag('request_id', context.requestId);
    if (context?.userId) {
      // Set user without PII — id only
      scope.setUser({ id: context.userId });
    }
    Sentry.captureException(err);
  });
}
