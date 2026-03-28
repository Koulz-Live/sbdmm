/**
 * Structured Logger
 *
 * SECURITY DESIGN:
 * - All log output is structured JSON for ingestion by SIEM/observability tools
 * - PII and secret fields are automatically redacted
 * - Request IDs are attached to every log entry for incident correlation
 * - Stack traces are NEVER sent to clients — only logged server-side
 * - Log level is environment-driven; production should use 'info' or higher
 *
 * HUMAN DECISION: Replace winston transport in production with a secure
 * log aggregation service (e.g. Datadog, AWS CloudWatch, GCP Logging).
 * Ensure your log pipeline has appropriate access controls and retention policies.
 */

import winston from 'winston';

// Fields that must NEVER appear in logs as raw values.
// Add fields here as your domain grows (e.g. 'pan', 'ssn', 'passport_number').
const REDACTED_FIELDS = new Set(
  (
    process.env['LOG_REDACT_FIELDS'] ||
    'password,token,secret,apiKey,authorization,ssn,pan,cvv,service_role_key'
  )
    .split(',')
    .map((f) => f.trim().toLowerCase()),
);

const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Recursively redact sensitive keys from any object before logging.
 * This is a last-resort safety net — you should also scrub data at the
 * source before passing it to logger.
 */
function redactSensitiveFields(obj: unknown, depth = 0): unknown {
  // Limit recursion depth to prevent performance issues on deep objects
  if (depth > 10 || obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    // Detect raw JWT tokens in string values
    if (/^(Bearer\s+)?[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(obj)) {
      return REDACTED_PLACEHOLDER;
    }
    // Detect OpenAI API keys
    if (/^sk-[A-Za-z0-9]{20,}/.test(obj)) {
      return REDACTED_PLACEHOLDER;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveFields(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (REDACTED_FIELDS.has(key.toLowerCase())) {
        result[key] = REDACTED_PLACEHOLDER;
      } else {
        result[key] = redactSensitiveFields(value, depth + 1);
      }
    }
    return result;
  }

  return obj;
}

const logLevel = process.env['LOG_LEVEL'] ?? (process.env['NODE_ENV'] === 'production' ? 'info' : 'debug');

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'ISO' }),
    winston.format.errors({ stack: true }),
    // Apply redaction transform
    winston.format((info) => {
      return redactSensitiveFields(info) as winston.Logform.TransformableInfo;
    })(),
    winston.format.json(),
  ),
  defaultMeta: {
    service: 'sbdmm-api',
    environment: process.env['NODE_ENV'] ?? 'development',
  },
  transports: [
    new winston.transports.Console({
      // In production, console output should be forwarded to a log aggregator.
      // Silence console in test environment to keep test output clean.
      silent: process.env['NODE_ENV'] === 'test',
    }),
    // HUMAN DECISION: Add file or remote transports for production.
    // Example: new winston.transports.Http({ host: 'your-log-aggregator' })
  ],
});

// Child logger factory — creates a logger with bound context (e.g. request_id, tenant_id)
// SECURITY: tenant_id and user_id in logs aids incident investigation but
// treat them as semi-sensitive — do not log full email or PII.
export function createChildLogger(context: Record<string, string | undefined>): winston.Logger {
  return logger.child(redactSensitiveFields(context) as Record<string, unknown>);
}

export { logger };
