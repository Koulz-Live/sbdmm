/**
 * api/index.ts — Vercel Serverless Function entry point
 *
 * @vercel/node compiles this file and bundles all imports.
 * Telemetry is skipped (no persistent process in serverless).
 */
import { createApp } from '../apps/api/src/app';

const app = createApp();

export default app;
