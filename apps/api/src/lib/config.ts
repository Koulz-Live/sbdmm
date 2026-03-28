/**
 * Environment Configuration — Server Only
 *
 * SECURITY: All environment variable access in the backend MUST go through this module.
 * This ensures:
 * 1. Fail-fast validation at startup (no silent undefined values)
 * 2. A single place to audit what secrets the server uses
 * 3. Type safety across the codebase
 *
 * HUMAN DECISION: For production, integrate with a secrets manager
 * (e.g., AWS Secrets Manager, HashiCorp Vault, Doppler) and inject
 * values as environment variables at runtime — do not change this module's
 * read pattern, just change how values are injected.
 */

import dotenv from 'dotenv';

// Load .env.local in development
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`[CONFIG] Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function optionalInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) throw new Error(`[CONFIG] Environment variable ${key} must be an integer`);
  return parsed;
}

// ─── Validated Config Object ─────────────────────────────────────────────────
export const config = {
  server: {
    nodeEnv: optional('NODE_ENV', 'development') as 'development' | 'test' | 'staging' | 'production',
    port: optionalInt('PORT', 3001),
    apiBaseUrl: optional('API_BASE_URL', 'http://localhost:3001'),
  },

  cors: {
    // SECURITY: Never allow '*' in production. This is a strict allowlist.
    allowedOrigins: optional('CORS_ALLOWED_ORIGINS', 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim()),
  },

  // SECURITY: Supabase service role key NEVER goes to the client
  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'), // SERVER ONLY
    anonKey: required('SUPABASE_ANON_KEY'), // Safe for frontend
    jwtSecret: required('SUPABASE_JWT_SECRET'),
  },

  // SECURITY: OpenAI key is server-only. Never referenced in web app.
  openai: {
    apiKey: required('OPENAI_API_KEY'),
    orgId: optional('OPENAI_ORG_ID', ''),
    maxTokensPerRequest: optionalInt('AI_MAX_TOKENS_PER_REQUEST', 2048),
    maxRequestsPerUserPerHour: optionalInt('AI_MAX_REQUESTS_PER_USER_PER_HOUR', 50),
    allowedModels: optional('AI_ALLOWED_MODELS', 'gpt-4o-mini').split(',').map((m) => m.trim()),
  },

  rateLimit: {
    windowMs: optionalInt('RATE_LIMIT_WINDOW_MS', 900_000),
    maxRequests: optionalInt('RATE_LIMIT_MAX_REQUESTS', 100),
    aiMaxRequests: optionalInt('RATE_LIMIT_AI_MAX_REQUESTS', 20),
  },

  logging: {
    level: optional('LOG_LEVEL', 'info'),
  },

  webhooks: {
    logisticsProviderSecret: optional('WEBHOOK_SECRET_LOGISTICS_PROVIDER', ''),
  },

  features: {
    aiRouteOptimization: optional('FEATURE_AI_ROUTE_OPTIMIZATION', 'false') === 'true',
    paymentModule: optional('FEATURE_PAYMENT_MODULE', 'false') === 'true',
    crossBorderDocs: optional('FEATURE_CROSS_BORDER_DOCS', 'false') === 'true',
  },
} as const;

export type AppConfig = typeof config;
