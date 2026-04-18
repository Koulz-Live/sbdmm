/**
 * api/index.ts — Vercel Serverless Function entry point
 *
 * @vercel/node compiles this file and bundles all imports.
 * Telemetry is skipped (no persistent process in serverless).
 */
import { createApp } from '../apps/api/src/app';

let app: ReturnType<typeof createApp>;
try {
  app = createApp();
} catch (err) {
  console.error('[VERCEL] createApp() failed at module load:', err);
  throw err;
}

export default app!;
