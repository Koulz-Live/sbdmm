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
import type { NextFunction, Request, Response } from 'express';
import { config } from '../lib/config';
import { logger } from '../lib/logger';

const allowedOrigins = new Set(config.cors.allowedOrigins);

// Log allowed origins at startup for auditability (not a security risk)
logger.info('[CORS] Allowed origins', { origins: [...allowedOrigins] });

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // corsHandler() short-circuits before reaching here for no-origin and same-origin
    // requests. By the time we reach this callback, origin is always a cross-origin value.
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
    } else {
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

/**
 * Same-origin bypass wrapper for Vercel deployments.
 *
 * On Vercel, the frontend and the Express API are served from the same domain
 * (e.g. sbdmm.vercel.app). Browsers still include an `Origin` header on fetch()
 * calls, so Express's cors() sees `Origin: https://sbdmm.vercel.app` and checks
 * it against the allowlist. If that domain is not explicitly listed in
 * CORS_ALLOWED_ORIGINS the request is rejected with "Origin not allowed."
 *
 * Rather than requiring every deployment domain to be manually added to the
 * env var, we detect the case where Origin === the server's own host and allow
 * it unconditionally — this is definitionally same-origin and safe.
 *
 * This wrapper is used in place of `corsMiddleware` in the Express app entry point.
 */
export function corsHandler(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin as string | undefined;
  const host   = req.headers.host   as string | undefined;   // e.g. "sbdmm.vercel.app"

  // No Origin header = not a cross-origin request.
  // CORS is only triggered when a browser sends a cross-origin fetch — same-origin
  // GET/HEAD requests and server-to-server calls carry no Origin header.
  // Passing these straight through is correct; JWT auth still protects every route.
  // (Our earlier "block no-origin in production" was overly strict — it broke
  //  same-origin browser GETs which legitimately omit the Origin header.)
  if (!origin) {
    next();
    return;
  }

  // Same-origin request where the browser DID include an Origin header
  // (e.g. same-origin POST, or full-URL fetch from the same domain).
  if (host && (origin === `https://${host}` || origin === `http://${host}`)) {
    // Same-origin: set minimal CORS headers and continue. No allowlist check needed.
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization,X-Request-ID,X-Idempotency-Key,X-Tenant-ID',
    );
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID,X-RateLimit-Limit,X-RateLimit-Remaining');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
    return;
  }

  // Genuinely cross-origin request: enforce the allowlist via cors().
  corsMiddleware(req, res, next);
}
