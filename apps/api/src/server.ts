/**
 * SBDMM Platform — Secure Express API Server
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
 *
 * ANTI-PATTERNS AVOIDED:
 * - No wildcard CORS
 * - No stack traces to clients
 * - No giant single-file server (routes are modular)
 * - No service role key in any route that comes from client context
 * - No unauthenticated access to business data routes
 */

import 'express-async-errors'; // Must be first import — enables async error handling
// TELEMETRY: Must be imported before all other modules so OTel can patch them
import { Sentry, captureException } from './lib/telemetry';
import express, { Request, Response, NextFunction } from 'express';
import { requestIdMiddleware } from './middleware/requestId';
import { secureHeaders } from './middleware/secureHeaders';
import { corsMiddleware } from './middleware/corsConfig';
import { standardRateLimit } from './middleware/rateLimiter';
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
import { aiRouter } from './ai/aiProxy.route';
import { webhookRouter } from './webhooks/webhookVerifier';
import { config } from './lib/config';
import { logger } from './lib/logger';

const app = express();

// ─── 1. Request ID ────────────────────────────────────────────────────────────
app.use(requestIdMiddleware);

// ─── 2. Secure Headers ───────────────────────────────────────────────────────
app.use(secureHeaders);

// ─── 3. CORS ─────────────────────────────────────────────────────────────────
app.use(corsMiddleware);

// ─── 4. Body Parsing ──────────────────────────────────────────────────────────
// SECURITY: Set strict request size limits to prevent DoS via large payloads
app.use(express.json({ limit: '512kb' }));   // 512kb is generous for a logistics API
app.use(express.urlencoded({ extended: false, limit: '128kb' }));

// Disable the X-Powered-By header (belt and suspenders — helmet already does this)
app.disable('x-powered-by');

// ─── 5. Rate Limiting ─────────────────────────────────────────────────────────
// Standard rate limit on all routes — more specific limits applied per route group
app.use(standardRateLimit);

// ─── 6. Request Logging ───────────────────────────────────────────────────────
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info('[REQUEST] Incoming', {
    request_id: req.requestId,
    method: req.method,
    path: req.path,
    // SECURITY: Log IP for security monitoring but consider anonymization for GDPR/POPIA
    ip: req.ip,
    // SECURITY: Never log Authorization header value or query params that may have tokens
    user_agent: req.headers['user-agent']?.slice(0, 200),
  });
  next();
});

// ─── 7. Routes ────────────────────────────────────────────────────────────────

// Public routes — no authentication required
// SECURITY: Webhook routes have their own signature verification middleware
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
app.use('/api/v1/ai', aiRouter);

// ─── 8. 404 Handler ───────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
  });
});

// ─── 9. Global Error Handler ─────────────────────────────────────────────────
// MUST be registered last — after all routes
app.use(globalErrorHandler);

// ─── Server Startup ───────────────────────────────────────────────────────────
const PORT = config.server.port;

app.listen(PORT, () => {
  logger.info('[SERVER] SBDMM API started', {
    port: PORT,
    environment: config.server.nodeEnv,
    // SECURITY: Never log secrets or connection strings here
  });
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
// HUMAN DECISION: For production, implement proper graceful shutdown
// with connection draining for active requests.
process.on('SIGTERM', () => {
  logger.info('[SERVER] SIGTERM received — shutting down gracefully');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('[SERVER] Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  captureException(reason instanceof Error ? reason : new Error(String(reason)));
  // HUMAN DECISION: In production, consider crashing and restarting (container will restart)
  // rather than running in an unknown state.
});

export { app };
