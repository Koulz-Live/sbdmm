/**
 * api/index.ts — Root-level Vercel Serverless Function entry point
 *
 * Vercel requires serverless functions to live in /api at the project root.
 * This file re-exports from the actual implementation inside apps/api.
 */
export { default } from '../apps/api/api/index';
