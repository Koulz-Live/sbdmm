/**
 * api/index.ts — Vercel Serverless Function entry point
 *
 * Vercel treats any file inside /api as a serverless function.
 * Exporting the Express app as default makes Vercel wrap it
 * automatically as an HTTP handler — no app.listen() needed.
 *
 * Vercel routes all /api/* and /webhooks/* requests here
 * (configured in vercel.json rewrites).
 *
 * TELEMETRY: OTel is skipped in serverless (no persistent process).
 * Sentry still works — it hooks into the request lifecycle.
 */

// Sentry must initialise before the app is created
import '../src/lib/telemetry';
import { createApp } from '../src/app';

const app = createApp();

// Vercel expects a default export of the handler
export default app;
