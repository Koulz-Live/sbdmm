/**
 * Input Sanitizer Middleware
 *
 * SECURITY: Applies deep sanitization to parsed request bodies, params, and query
 * strings before any route handler sees them.
 *
 * WHY THIS EXISTS ALONGSIDE ZOD:
 * Zod validates structure and type. This middleware handles byte-level attacks
 * that are structurally valid but semantically dangerous:
 *
 * 1. Null-byte injection (\x00) — can truncate strings in C-layer libraries,
 *    confuse PostgreSQL text operations, or bypass prefix checks.
 * 2. Prototype pollution — __proto__, constructor, prototype keys in JSON bodies
 *    can corrupt the JavaScript object prototype chain.
 * 3. Oversized string values — a string that passes Zod's `.max()` at the schema
 *    level might still slip through if the schema is permissive. Belt-and-suspenders.
 *
 * WHAT THIS DOES NOT DO:
 * - HTML/XSS escaping: Our API returns JSON to a React frontend that uses
 *   React's built-in XSS protection. Raw HTML is never rendered server-side.
 *   If you add an HTML email-generation route, sanitize there specifically.
 * - SQL injection: Supabase's parameterized queries handle this. Do not try to
 *   sanitize SQL syntax here — you'll break legitimate inputs.
 * - Path traversal in file routes: Handled in documents.ts at the storage layer.
 *
 * HUMAN DECISION: If you add a route that accepts free-form HTML (e.g., a rich-text
 * editor), add DOMPurify/sanitize-html sanitization in that route handler —
 * do not broaden this middleware to escape HTML globally.
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

// ─── Dangerous prototype-pollution keys ──────────────────────────────────────
const PROTOTYPE_POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ─── Max string length enforced at the middleware layer ──────────────────────
// This is a belt-and-suspenders limit. Zod schemas should be more specific.
// 100 KB per individual string value is extremely generous for business data.
const MAX_STRING_LENGTH = 100_000;

/**
 * deepSanitize — Recursively walks a parsed JSON value and:
 * 1. Strips null bytes from strings
 * 2. Truncates strings exceeding MAX_STRING_LENGTH
 * 3. Removes prototype-pollution keys from objects
 * 4. Returns a clean deep copy (does not mutate the original)
 *
 * Returns the sanitized value and a boolean indicating whether any mutation occurred.
 */
function deepSanitize(
  value: unknown,
  path = 'root',
  requestId?: string,
): { value: unknown; mutated: boolean } {
  if (typeof value === 'string') {
    let sanitized = value;
    let mutated = false;

    // Strip null bytes — these are never legitimate in business data
    if (sanitized.includes('\x00')) {
      sanitized = sanitized.replace(/\x00/g, '');
      mutated = true;
      logger.warn('[INPUT_SANITIZER] Null byte stripped', { path, request_id: requestId });
    }

    // Truncate oversized strings (defence-in-depth)
    if (sanitized.length > MAX_STRING_LENGTH) {
      sanitized = sanitized.slice(0, MAX_STRING_LENGTH);
      mutated = true;
      logger.warn('[INPUT_SANITIZER] Oversized string truncated', {
        path,
        original_length: value.length,
        request_id: requestId,
      });
    }

    return { value: sanitized, mutated };
  }

  if (Array.isArray(value)) {
    let anyMutated = false;
    const sanitizedArray = value.map((item, i) => {
      const { value: sanitizedItem, mutated } = deepSanitize(item, `${path}[${i}]`, requestId);
      if (mutated) anyMutated = true;
      return sanitizedItem;
    });
    return { value: sanitizedArray, mutated: anyMutated };
  }

  if (value !== null && typeof value === 'object') {
    let anyMutated = false;
    const sanitizedObj: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // SECURITY: Prototype pollution prevention — drop dangerous keys entirely
      if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
        anyMutated = true;
        logger.warn('[INPUT_SANITIZER] Prototype pollution key blocked', {
          key,
          path,
          request_id: requestId,
        });
        continue; // Skip this key — do not include it in output
      }

      const { value: sanitizedVal, mutated } = deepSanitize(val, `${path}.${key}`, requestId);
      sanitizedObj[key] = sanitizedVal;
      if (mutated) anyMutated = true;
    }

    return { value: sanitizedObj, mutated: anyMutated };
  }

  // Primitives (number, boolean, null) — pass through unchanged
  return { value, mutated: false };
}

/**
 * inputSanitizer — Express middleware.
 * Sanitizes req.body, req.query, and req.params in place.
 *
 * ORDERING: Must come AFTER body parsing middleware (express.json / express.urlencoded)
 * and BEFORE route handlers.
 */
export function inputSanitizer(req: Request, _res: Response, next: NextFunction): void {
  const requestId = req.requestId;

  // Sanitize body (JSON or URL-encoded)
  if (req.body && typeof req.body === 'object') {
    const { value, mutated } = deepSanitize(req.body, 'body', requestId);
    if (mutated) {
      req.body = value;
    }
  }

  // Sanitize query string values
  if (req.query && typeof req.query === 'object') {
    const { value, mutated } = deepSanitize(req.query, 'query', requestId);
    if (mutated) {
      // req.query is read-only in some Express versions; casting is intentional
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).query = value;
    }
  }

  // Sanitize route params (e.g., :id, :orderId)
  if (req.params && typeof req.params === 'object') {
    const { value, mutated } = deepSanitize(req.params, 'params', requestId);
    if (mutated) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).params = value;
    }
  }

  next();
}
