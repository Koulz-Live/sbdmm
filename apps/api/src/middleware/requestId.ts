/**
 * Request ID Middleware
 *
 * SECURITY / OBSERVABILITY:
 * Assigns a unique correlation ID to every inbound request.
 * This ID propagates through all logs, error responses (safe version),
 * and downstream service calls — enabling full incident trace reconstruction.
 *
 * DESIGN: Uses crypto.randomUUID() — cryptographically random, not guessable.
 * The ID is attached to res.locals and the request object for downstream use.
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Extend Express Request to carry our request ID
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Allow upstream gateway to pass a trace ID (e.g., from Vercel, CDN, or API gateway)
  // SECURITY: Validate the format — never blindly trust caller-supplied IDs for security decisions.
  // They are only used for log correlation, not authorization.
  const upstreamId = req.headers['x-request-id'];
  const requestId =
    typeof upstreamId === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(upstreamId)
      ? upstreamId
      : randomUUID();

  req.requestId = requestId;
  res.locals['requestId'] = requestId;

  // Return the ID in the response header so callers can correlate support issues
  // SECURITY: This is safe — it reveals only a random ID, no system internals
  res.setHeader('X-Request-ID', requestId);

  next();
}
