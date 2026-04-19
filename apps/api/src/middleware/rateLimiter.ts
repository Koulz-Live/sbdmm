/**
 * Rate Limiting Middleware
 *
 * SECURITY: Rate limiting is a critical defence against:
 * - Brute force attacks on auth endpoints
 * - API abuse and scraping
 * - DoS amplification
 * - AI token exhaustion attacks
 *
 * DESIGN DECISIONS:
 * - Standard rate limit applied to all routes
 * - Stricter limits on auth and AI proxy routes
 * - Rate limit headers returned so legitimate clients can back off gracefully
 * - In production, use a Redis store (e.g. rate-limit-redis) for distributed limiting
 *   across multiple API instances. In-memory store is fine for single-instance dev.
 *
 * HUMAN DECISION: In production, replace in-memory store with Redis.
 * In-memory rate limits do NOT work across horizontally scaled instances.
 */

import rateLimit from 'express-rate-limit';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { ERROR_CODES } from '@sbdmm/shared';
import { Request, Response } from 'express';

// ─── Standard API Rate Limit ──────────────────────────────────────────────────
export const standardRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,      // Default: 15 minutes
  max: config.rateLimit.maxRequests,         // Default: 100 requests per window
  standardHeaders: true,                     // Return RateLimit-* headers
  legacyHeaders: false,                      // Disable X-RateLimit-* legacy headers

  // SECURITY: Do not reveal internal details in rate limit error messages
  message: {
    success: false,
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many requests. Please slow down and try again later.',
    },
  },

  handler: (req: Request, res: Response) => {
    logger.warn('[RATE_LIMIT] Request blocked', {
      request_id: req.requestId,
      ip: req.ip,                // HUMAN DECISION: Hash or truncate IP in logs for GDPR/POPIA compliance
      path: req.path,
    });
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests. Please slow down and try again later.',
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },

  // SECURITY: Skip rate limiting for health checks to avoid availability issues
  skip: (req: Request) => req.path === '/health' || req.path === '/ready',
});

// ─── Strict Auth Rate Limit ───────────────────────────────────────────────────
// Applied to login, password reset, token refresh endpoints
// Significantly lower limit to prevent brute force
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                    // Only 10 auth attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many authentication attempts. Please wait before trying again.',
    },
  },
  handler: (req: Request, res: Response) => {
    // SECURITY: Log at warn level — repeated auth failures are a security signal
    logger.warn('[RATE_LIMIT] Auth endpoint blocked — potential brute force', {
      request_id: req.requestId,
      ip: req.ip,
      path: req.path,
    });
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many authentication attempts. Please wait before trying again.',
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
});

// ─── AI Proxy Rate Limit ──────────────────────────────────────────────────────
// Applied to the AI orchestration proxy route
// Prevents token exhaustion and cost abuse
export const aiRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,              // 1 hour
  max: config.rateLimit.aiMaxRequests,   // Default: 20 AI requests per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'AI request limit reached. Your quota resets in 1 hour.',
    },
  },
  handler: (req: Request, res: Response) => {
    logger.warn('[RATE_LIMIT] AI endpoint blocked', {
      request_id: req.requestId,
      ip: req.ip,
      user_id: (req as unknown as { user?: { id: string } }).user?.id,
    });
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'AI request limit reached. Your quota resets in 1 hour.',
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
});

// ─── Per-User Authenticated Rate Limit ────────────────────────────────────────
// Keyed on authenticated user ID, not IP address.
// Prevents a single compromised account from flooding the API even across multiple
// IPs (e.g., distributed bots rotating IP addresses but using the same token).
//
// IMPORTANT: Only apply this AFTER requireAuth middleware so req.user is populated.
// It complements — not replaces — the IP-based standardRateLimit.
//
// Default: 300 requests per 15 minutes per user (3× the IP limit to accommodate
// users on shared IPs like corporate NAT).
export const perUserRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,          // 15 minutes (same as standard)
  max: config.rateLimit.maxRequests * 3,         // 300 req/15 min per user
  standardHeaders: true,
  legacyHeaders: false,
  // Key by authenticated user ID rather than IP
  keyGenerator: (req: Request): string => {
    const userId = (req as unknown as { user?: { id: string } }).user?.id;
    // Fallback to IP if somehow called before auth (belt-and-suspenders)
    return userId ?? req.ip ?? 'unknown';
  },
  message: {
    success: false,
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many requests from your account. Please slow down.',
    },
  },
  handler: (req: Request, res: Response) => {
    const userId = (req as unknown as { user?: { id: string } }).user?.id;
    logger.warn('[RATE_LIMIT] Per-user limit reached', {
      request_id: req.requestId,
      user_id: userId,
      path: req.path,
    });
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests from your account. Please slow down.',
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
  skip: (req: Request) => req.path === '/health' || req.path === '/ready',
});

// ─── Sensitive Write Rate Limit ───────────────────────────────────────────────
// Applied to state-changing endpoints that are high-value targets:
// e.g., user creation, role changes, financial operations, compliance overrides.
//
// Stricter than standardRateLimit; keyed by IP.
// Intended for use on individual sensitive routes, not the entire API.
//
// Default: 30 writes per 15 minutes per IP.
export const sensitiveWriteRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,          // 15 minutes
  max: parseInt(process.env['RATE_LIMIT_SENSITIVE_WRITE_MAX'] ?? '30', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Too many write operations. Please wait before trying again.',
    },
  },
  handler: (req: Request, res: Response) => {
    logger.warn('[RATE_LIMIT] Sensitive write blocked', {
      request_id: req.requestId,
      ip: req.ip,
      path: req.path,
      user_id: (req as unknown as { user?: { id: string } }).user?.id,
    });
    res.status(429).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many write operations. Please wait before trying again.',
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
});
