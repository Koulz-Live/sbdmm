/**
 * app.ts — Express application factory
 *
 * Exports the configured Express app WITHOUT calling app.listen().
 * This allows the same app to be used in two ways:
 *   - Local dev:  server.ts calls app.listen()
 *   - Vercel:     api/index.ts exports the app as a serverless handler
 *
 * MIDDLEWARE STACK ORDER (SECURITY-CRITICAL — do not reorder without review):
 *
 * 1. Request ID          — Assign correlation ID before anything else
 * 2. Secure Headers      — Set security headers on every response
 * 3. CORS                — Validate origin before processing any request
 * 4. Body Parsing        — Parse request bodies (with size limits)
 * 5. Rate Limiting       — Reject abusive requests early
 * 6. Request Logging     — Log incoming requests (after rate limit to avoid log spam)
 * 7. Routes              — Business logic routes
 *    ├─ Public Routes    — Health, webhooks (no auth)
 *    ├─ Auth Middleware  — Verify JWT on all protected routes
 *    └─ Protected Routes — Role-scoped business routes
 * 8. 404 Handler         — Catch unmatched routes
 * 9. Error Handler       — Centralized error handling (MUST be last)
 */

import 'express-async-errors'; // Must be first import — enables async error handling
import express, { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware } from './middleware/requestId';
import { secureHeaders, additionalSecurityHeaders } from './middleware/secureHeaders';
import { corsHandler } from './middleware/corsConfig';
import { standardRateLimit } from './middleware/rateLimiter';
import { inputSanitizer } from './middleware/inputSanitizer';
import { globalErrorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { ordersRouter } from './routes/orders';
import { dashboardRouter } from './routes/dashboard';
import { vendorsRouter } from './routes/vendors';
import { quotesRouter } from './routes/quotes';
import { documentsRouter } from './routes/documents';
import { complianceRouter } from './routes/compliance';
import { integrationsRouter } from './routes/integrations';
import { adminRouter } from './routes/admin';
import { notificationsRouter } from './routes/notifications';
import { aiRouter } from './ai/aiProxy.route';
import { webhookRouter } from './webhooks/webhookVerifier';
import { designRouter } from './routes/design';
import { feedRouter } from './routes/feed';
import { savesRouter } from './routes/saves';
import { messagesRouter } from './routes/messages';
import { ratingsRouter } from './routes/ratings';
import { logger } from './lib/logger';

export function createApp() {
  const app = express();

  // ─── 1. Request ID ──────────────────────────────────────────────────────────
  app.use(requestIdMiddleware);

  // ─── 2. Secure Headers ──────────────────────────────────────────────────────
  app.use(secureHeaders);
  app.use(additionalSecurityHeaders); // Permissions-Policy + X-Permitted-Cross-Domain-Policies

  // ─── 3. CORS ────────────────────────────────────────────────────────────────
  app.use(corsHandler);

  // ─── 4. Body Parsing ────────────────────────────────────────────────────────
  // SECURITY: Set strict request size limits to prevent DoS via large payloads
  app.use(express.json({ limit: '512kb' }));
  app.use(express.urlencoded({ extended: false, limit: '128kb' }));

  // Disable the X-Powered-By header (belt and suspenders — helmet already does this)
  app.disable('x-powered-by');

  // ─── 5. Rate Limiting ───────────────────────────────────────────────────────
  // NOTE: In-memory rate limiting works fine on Vercel — each function instance
  // has its own memory. For stricter distributed limiting, wire Upstash Redis.
  app.use(standardRateLimit);

  // ─── 5a. Input Sanitization ─────────────────────────────────────────────────
  // SECURITY: Strip null bytes, remove prototype-pollution keys, truncate oversized
  // strings. Runs after body parsing, before any route handler or Zod validation.
  app.use(inputSanitizer);

  // ─── 6. Request Logging ─────────────────────────────────────────────────────
  // SECURITY (GDPR/POPIA): IP is not logged in plaintext. The request_id provides
  // sufficient correlation without storing personal data in application logs.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info('[REQUEST] Incoming', {
      request_id: req.requestId,
      method: req.method,
      path: req.path,
      user_agent: req.headers['user-agent']?.slice(0, 200),
    });
    next();
  });

  // ─── 7. Routes ──────────────────────────────────────────────────────────────

  // Public routes — no authentication required
  app.use('/', healthRouter);
  app.use('/webhooks', webhookRouter);

  // Protected API routes — authentication is applied inside each router
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/orders', ordersRouter);
  app.use('/api/v1/vendors', vendorsRouter);
  app.use('/api/v1/quotes', quotesRouter);
  app.use('/api/v1/documents', documentsRouter);
  app.use('/api/v1/compliance', complianceRouter);
  app.use('/api/v1/integrations', integrationsRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/ai', aiRouter);
  app.use('/api/v1/design', designRouter);
  app.use('/api/v1/feed', feedRouter);
  app.use('/api/v1/saves', savesRouter);
  app.use('/api/v1/orders/:orderId/messages', messagesRouter);
  app.use('/api/v1/ratings', ratingsRouter);

  // ─── 8. 404 Handler ─────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
    });
  });

  // ─── 9. Global Error Handler ────────────────────────────────────────────────
  // MUST be registered last — after all routes
  app.use(globalErrorHandler);

  return app;
}
