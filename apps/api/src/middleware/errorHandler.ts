/**
 * Centralized Error Handler
 *
 * SECURITY: This is the last middleware in the Express stack.
 * It ensures:
 * 1. Stack traces NEVER leak to clients
 * 2. Internal error details are logged server-side with full context
 * 3. Clients receive only safe, standardized error responses
 * 4. Error codes are normalized and never expose system internals
 * 5. Request correlation IDs are always included for incident tracing
 *
 * IMPORTANT: This middleware MUST be registered last in server.ts,
 * after all routes and other middleware.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';
import { captureException } from '../lib/telemetry';
import { ERROR_CODES } from '@sbdmm/shared';

// Custom error class for application-level errors with safe client messages
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean; // true = expected error; false = programming bug

  constructor(
    message: string,
    statusCode = 500,
    code: string = ERROR_CODES.INTERNAL_ERROR,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error types
export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found.`, 404, ERROR_CODES.NOT_FOUND);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super(message, 401, ERROR_CODES.UNAUTHORIZED);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, 403, ERROR_CODES.FORBIDDEN);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed.') {
    super(message, 400, ERROR_CODES.VALIDATION_ERROR);
  }
}

export class ComplianceBlockError extends AppError {
  constructor(message = 'Request blocked by compliance rules.') {
    super(message, 422, ERROR_CODES.COMPLIANCE_BLOCK);
  }
}

// ─── Global Error Handler ─────────────────────────────────────────────────────
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? 'unknown';
  const timestamp = new Date().toISOString();

  // ─── Handle Zod Validation Errors ────────────────────────────────────────
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      fields[issue.path.join('.') || 'root'] = issue.message;
    }
    res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Request validation failed.',
        fields,
      },
      meta: { request_id: requestId, timestamp },
    });
    return;
  }

  // ─── Handle Known Operational Errors ─────────────────────────────────────
  if (err instanceof AppError && err.isOperational) {
    // Log at appropriate level — operational errors are expected
    logger.warn('[ERROR] Operational error', {
      request_id: requestId,
      error_code: err.code,
      status_code: err.statusCode,
      message: err.message,
      path: req.path,
      method: req.method,
    });

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message, // Safe — operational errors have pre-defined client messages
      },
      meta: { request_id: requestId, timestamp },
    });
    return;
  }

  // ─── Handle CORS Errors ───────────────────────────────────────────────────
  if (err.message?.startsWith('CORS:')) {
    res.status(403).json({
      success: false,
      error: { code: ERROR_CODES.FORBIDDEN, message: 'Origin not allowed.' },
      meta: { request_id: requestId, timestamp },
    });
    return;
  }

  // ─── Handle Unexpected / Programming Errors ───────────────────────────────
  // SECURITY: Log full details server-side, return generic message to client.
  // NEVER return err.message or err.stack to the client for unexpected errors.
  logger.error('[ERROR] Unexpected server error', {
    request_id: requestId,
    error_name: err.name,
    error_message: err.message,
    // Stack trace in server logs only
    stack: err.stack,
    path: req.path,
    method: req.method,
    user_id: req.user?.id,
    tenant_id: req.user?.tenant_id,
  });

  // Report to Sentry — attach tenant/user context for triage
  captureException(err, {
    ...(req.user?.tenant_id !== undefined ? { tenantId: req.user.tenant_id } : {}),
    ...(req.user?.id !== undefined ? { userId: req.user.id } : {}),
    requestId,
  });

  res.status(500).json({
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      // SECURITY: Generic message — internal details are in server logs, not in response
      message: 'An unexpected error occurred. Please try again or contact support.',
    },
    meta: { request_id: requestId, timestamp },
  });
}
