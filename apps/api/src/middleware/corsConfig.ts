/**
 * CORS Configuration
 *
 * SECURITY MANDATES:
 * 1. NEVER allow '*' in production — this would allow any origin to call the API
 * 2. The allowlist is loaded from environment config — enforced at runtime
 * 3. Credentials (cookies, auth headers) are allowed only for explicitly listed origins
 * 4. Preflight OPTIONS requests are handled automatically
 * 5. Only expose headers that clients legitimately need
 *
 * HUMAN DECISION: Review and update CORS_ALLOWED_ORIGINS in each environment's
 * secret store before deploying. Staging and production MUST have distinct lists.
 */

import cors, { CorsOptions } from 'cors';
import { config } from '../lib/config';
import { logger } from '../lib/logger';

const allowedOrigins = new Set(config.cors.allowedOrigins);
const isProd = config.server.nodeEnv === 'production';

// Log allowed origins at startup for auditability (not a security risk)
logger.info('[CORS] Allowed origins', { origins: [...allowedOrigins] });

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // SECURITY (production): Reject requests with no Origin header.
    // No-origin requests come from non-browser clients (curl, server-to-server, etc.).
    // Our API is exclusively consumed by browser clients; legitimate server-to-server
    // callers should use service-role keys, not the public CORS-protected API.
    // In development we allow no-origin for local tooling convenience.
    if (!origin) {
      if (isProd) {
        logger.warn('[CORS] Blocked no-origin request in production');
        callback(new Error('CORS: Origin header required'), false);
      } else {
        callback(null, true);
      }
      return;
    }

    if (allowedOrigins.has(origin)) {
      callback(null, true);
    } else {
      // Log blocked origins for security monitoring — do not throw, just reject
      logger.warn('[CORS] Blocked request from disallowed origin', { origin });
      callback(new Error('CORS: Origin not allowed'), false);
    }
  },

  // Allow cookies / Authorization headers for authenticated requests
  credentials: true,

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-Idempotency-Key',
    'X-Tenant-ID', // Tenant header for multi-tenant routing
  ],

  // Expose these headers to the browser so clients can use them
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],

  // Cache preflight for 24 hours to reduce OPTIONS overhead
  maxAge: 86_400,
};

export const corsMiddleware = cors(corsOptions);
