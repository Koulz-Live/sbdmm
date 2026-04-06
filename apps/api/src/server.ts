/**
 * server.ts — Local development entry point
 *
 * Calls app.listen() for running locally with `npm run dev`.
 * In production (Vercel), this file is NOT used — Vercel imports
 * api/index.ts which exports the Express app as a serverless handler.
 */

// TELEMETRY: Must be imported before all other modules so OTel can patch them
import { captureException } from './lib/telemetry';
import { createApp } from './app';
import { config } from './lib/config';
import { logger } from './lib/logger';

const app = createApp();
const PORT = config.server.port;

app.listen(PORT, () => {
  logger.info('[SERVER] SBDMM API started', {
    port: PORT,
    environment: config.server.nodeEnv,
  });
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  logger.info('[SERVER] SIGTERM received — shutting down gracefully');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('[SERVER] Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  captureException(reason instanceof Error ? reason : new Error(String(reason)));
});

