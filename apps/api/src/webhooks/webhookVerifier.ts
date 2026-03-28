/**
 * Webhook Verification Middleware
 *
 * SECURITY: Third-party webhooks MUST be verified before processing.
 * Without signature verification, any attacker can send fake webhook events
 * and trigger business logic (e.g., mark orders as delivered, modify compliance status).
 *
 * DESIGN: HMAC-SHA256 signature verification (industry standard, used by Stripe, GitHub, etc.)
 * The shared secret is stored server-side only — never exposed to clients.
 *
 * ANTI-PATTERNS TO AVOID:
 * - Never process webhook payloads before verifying the signature
 * - Never use timing-unsafe string comparison (use crypto.timingSafeEqual)
 * - Never log the raw webhook body if it might contain PII
 * - Never trust the 'source' field in the payload for routing decisions
 *
 * HUMAN DECISION: Generate a strong (32+ byte) random secret for each webhook
 * integration. Rotate secrets periodically and on suspected compromise.
 */

import { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '../lib/logger';
import { ERROR_CODES } from '@sbdmm/shared';

interface WebhookVerifyOptions {
  secretEnvKey: string;          // Name of the env var holding the secret
  signatureHeader: string;        // Header name where provider sends the signature
  signaturePrefix?: string;       // Some providers prefix the hash, e.g. 'sha256='
  timestampHeader?: string;       // Optional: header for timestamp to prevent replay attacks
  maxAgeSeconds?: number;         // Max acceptable age for timestamped webhooks
}

/**
 * createWebhookVerifier — Factory for webhook verification middleware.
 *
 * IMPORTANT: Express must be configured to receive raw body buffers for the
 * webhook route. Use express.raw() or express.text() instead of express.json()
 * on webhook routes — the signature is computed over the raw bytes.
 *
 * Example setup in server.ts:
 *   app.use('/webhooks/logistics', express.raw({ type: 'application/json' }), webhookRouter)
 */
export function createWebhookVerifier(options: WebhookVerifyOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const secret = process.env[options.secretEnvKey];

    if (!secret) {
      logger.error('[WEBHOOK] Webhook secret not configured', {
        env_key: options.secretEnvKey,
      });
      res.status(500).json({
        success: false,
        error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Webhook verification not configured.' },
      });
      return;
    }

    // Get the raw body — must be Buffer for correct HMAC computation
    const rawBody = req.body as Buffer | string;
    if (!rawBody) {
      logger.warn('[WEBHOOK] Empty webhook body received');
      res.status(400).json({
        success: false,
        error: { code: ERROR_CODES.WEBHOOK_SIGNATURE_INVALID, message: 'Empty webhook body.' },
      });
      return;
    }

    // Extract signature from header
    const signatureHeader = req.headers[options.signatureHeader.toLowerCase()] as string | undefined;
    if (!signatureHeader) {
      logger.warn('[WEBHOOK] Missing signature header', {
        header: options.signatureHeader,
        request_id: req.requestId,
      });
      res.status(401).json({
        success: false,
        error: {
          code: ERROR_CODES.WEBHOOK_SIGNATURE_INVALID,
          message: 'Webhook signature missing.',
        },
      });
      return;
    }

    // Strip prefix if present (e.g., 'sha256=abc...' → 'abc...')
    const receivedSignature = options.signaturePrefix
      ? signatureHeader.replace(options.signaturePrefix, '')
      : signatureHeader;

    // Timestamp validation (optional but recommended for replay attack prevention)
    if (options.timestampHeader && options.maxAgeSeconds) {
      const timestampHeader = req.headers[options.timestampHeader.toLowerCase()] as string | undefined;
      if (timestampHeader) {
        const eventTimestamp = parseInt(timestampHeader, 10);
        const nowSeconds = Math.floor(Date.now() / 1000);
        const ageSecs = Math.abs(nowSeconds - eventTimestamp);

        if (ageSecs > options.maxAgeSeconds) {
          logger.warn('[WEBHOOK] Replay attack detected — webhook too old', {
            age_seconds: ageSecs,
            max_age: options.maxAgeSeconds,
            request_id: req.requestId,
          });
          res.status(401).json({
            success: false,
            error: {
              code: ERROR_CODES.WEBHOOK_SIGNATURE_INVALID,
              message: 'Webhook event is too old. Possible replay attack.',
            },
          });
          return;
        }
      }
    }

    // Compute expected HMAC-SHA256 signature
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody as string, 'utf8');
    const expectedSignature = createHmac('sha256', secret)
      .update(bodyBuffer)
      .digest('hex');

    // SECURITY: Use timing-safe comparison to prevent timing oracle attacks
    let signaturesMatch = false;
    try {
      const receivedBuf = Buffer.from(receivedSignature, 'hex');
      const expectedBuf = Buffer.from(expectedSignature, 'hex');

      // Buffers must be equal length for timingSafeEqual
      if (receivedBuf.length === expectedBuf.length) {
        signaturesMatch = timingSafeEqual(receivedBuf, expectedBuf);
      }
    } catch {
      signaturesMatch = false;
    }

    if (!signaturesMatch) {
      logger.warn('[WEBHOOK] Invalid signature — possible spoofed webhook', {
        request_id: req.requestId,
        signature_header: options.signatureHeader,
        // SECURITY: Never log the actual signatures in detail
      });
      res.status(401).json({
        success: false,
        error: {
          code: ERROR_CODES.WEBHOOK_SIGNATURE_INVALID,
          message: 'Webhook signature verification failed.',
        },
      });
      return;
    }

    logger.info('[WEBHOOK] Signature verified', { request_id: req.requestId });

    // Parse the raw body as JSON now that signature is verified
    try {
      req.body = JSON.parse(bodyBuffer.toString('utf8')) as unknown;
    } catch {
      res.status(400).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Webhook body is not valid JSON.' },
      });
      return;
    }

    next();
  };
}

// ─── Example Webhook Route ────────────────────────────────────────────────────
import { Router } from 'express';
import express from 'express';
import { webhookEventSchema } from '../schemas/index';
import { writeAuditLog } from '../services/auditLog';

export const webhookRouter = Router();

// Logistics provider webhook — receives raw body for signature verification
webhookRouter.post(
  '/logistics',
  // Raw body parser MUST come before signature verification
  express.raw({ type: 'application/json', limit: '1mb' }),
  createWebhookVerifier({
    secretEnvKey: 'WEBHOOK_SECRET_LOGISTICS_PROVIDER',
    signatureHeader: 'X-Logistics-Signature',
    signaturePrefix: 'sha256=',
    timestampHeader: 'X-Logistics-Timestamp',
    maxAgeSeconds: 300, // Reject events older than 5 minutes
  }),
  async (req: Request, res: Response): Promise<void> => {
    const log = logger.child({ request_id: req.requestId });

    // Validate event structure after signature verification
    const parsed = webhookEventSchema.safeParse(req.body);
    if (!parsed.success) {
      log.warn('[WEBHOOK] Invalid event schema', { errors: parsed.error.issues });
      res.status(400).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Invalid webhook event format.' },
      });
      return;
    }

    const event = parsed.data;
    log.info('[WEBHOOK] Processing logistics event', { event_type: event.event_type });

    // HUMAN DECISION: Implement event handlers per event_type
    // Route to appropriate handler based on event_type
    // Do NOT trust event_type for authorization — it's just a routing hint
    switch (event.event_type) {
      case 'shipment.status_updated':
        // TODO: Call order status update handler
        break;
      case 'shipment.delivered':
        // TODO: Trigger delivery confirmation workflow
        break;
      default:
        log.info('[WEBHOOK] Unhandled event type', { event_type: event.event_type });
    }

    // Always acknowledge receipt promptly to prevent provider retries
    // Process asynchronously in production (queue the event)
    await writeAuditLog({
      event_type: 'webhook.received',
      actor_id: 'system',
      tenant_id: 'system',
      outcome: 'success',
      details: {
        event_type: event.event_type,
        event_id: event.event_id,
      },
      request_id: req.requestId,
    });

    res.status(200).json({ success: true, message: 'Webhook received.' });
  },
);
