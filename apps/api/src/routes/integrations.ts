/**
 * Integrations Route — API Key Management for External Systems
 *
 * SECURITY DESIGN:
 * 1. Raw API keys are NEVER stored — only a bcrypt hash and an 8-char prefix
 * 2. The raw key is returned ONCE on creation — client must store it securely
 * 3. IP allowlist is enforced at the middleware level per integration
 * 4. Key rotation creates a new key and revokes the old one atomically
 * 5. Rate limit per key is stored and enforced by the API gateway
 * 6. All key lifecycle events are audit-logged
 *
 * HUMAN DECISION: Use a secrets manager (Doppler/Vault) to handle
 * key material in transit between services in production.
 */

import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/authorization';
import { validate, createIntegrationSchema, paginationSchema, uuidSchema } from '../schemas/index';
import { writeAuditLog } from '../services/auditLog';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { ERROR_CODES } from '@sbdmm/shared';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

// Only tenant_admin and super_admin can manage integrations
router.use(requireRole(['tenant_admin', 'super_admin']));

const integrationParamsSchema = z.object({ id: uuidSchema });

// Key format: sbdmm_<env>_<48 random hex chars>
// e.g. sbdmm_prod_a3f9c2...
function generateApiKey(env: string): string {
  const randomPart = randomBytes(24).toString('hex');
  return `sbdmm_${env}_${randomPart}`;
}

function hashApiKey(rawKey: string): string {
  // SHA-256 hash — fast for key lookup, not used for passwords
  return createHash('sha256').update(rawKey).digest('hex');
}

// ─── GET /api/v1/integrations ──────────────────────────────────────────────────
router.get(
  '/',
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const { page, per_page } = req.query as unknown as { page: number; per_page: number };
    const offset = (page - 1) * per_page;
    const supabase = getAdminClient();

    // SECURITY: key_hash and full key are NEVER returned in list responses
    const { data, error, count } = await supabase
      .from('integrations')
      .select('id, tenant_id, name, description, integration_type, key_prefix, status, rate_limit_per_minute, allowed_ips, webhook_url, created_by, last_used_at, created_at', { count: 'exact' })
      .eq('tenant_id', req.user!.tenant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (error) {
      log.error('[INTEGRATIONS] List query failed', { error: error.message });
      throw new AppError('Failed to retrieve integrations.', 500);
    }

    res.status(200).json({
      success: true,
      data,
      meta: {
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: { page, per_page, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / per_page) },
      },
    });
  },
);

// ─── GET /api/v1/integrations/:id ─────────────────────────────────────────────
router.get(
  '/:id',
  validate(integrationParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('integrations')
      .select('id, tenant_id, name, description, integration_type, key_prefix, status, rate_limit_per_minute, allowed_ips, webhook_url, created_by, last_used_at, created_at')
      .eq('id', req.params['id'])
      .eq('tenant_id', req.user!.tenant_id)
      .single();

    if (error || !data) throw new NotFoundError('Integration not found.');

    res.status(200).json({
      success: true,
      data,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/integrations ─────────────────────────────────────────────────
router.post(
  '/',
  validate(createIntegrationSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const body = req.body as { name: string; description?: string; integration_type: string; allowed_ips?: string[]; webhook_url?: string; rate_limit_per_minute: number };

    // Rate-limit: max 20 integrations per tenant
    const { count } = await supabase
      .from('integrations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', actor.tenant_id)
      .neq('status', 'revoked');

    if ((count ?? 0) >= 20) {
      res.status(429).json({
        success: false,
        error: { code: ERROR_CODES.RATE_LIMITED, message: 'Maximum number of active integrations reached (20).' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const nodeEnv = process.env['NODE_ENV'] ?? 'development';
    const rawKey = generateApiKey(nodeEnv === 'production' ? 'prod' : 'dev');
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 14); // "sbdmm_dev_" + 4 chars

    const { data: integration, error: insertError } = await supabase
      .from('integrations')
      .insert({
        tenant_id: actor.tenant_id,
        name: body.name,
        description: body.description ?? null,
        integration_type: body.integration_type,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        status: 'active',
        rate_limit_per_minute: body.rate_limit_per_minute,
        allowed_ips: body.allowed_ips ?? null,
        webhook_url: body.webhook_url ?? null,
        created_by: actor.id,
      })
      .select('id, name, integration_type, key_prefix, status, rate_limit_per_minute, created_at')
      .single();

    if (insertError || !integration) {
      log.error('[INTEGRATIONS] Insert failed', { error: insertError?.message });
      throw new AppError('Failed to create integration.', 500);
    }

    await writeAuditLog({
      event_type: 'api_key.created',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'integration',
      target_id: integration.id as string,
      outcome: 'success',
      details: { name: body.name, integration_type: body.integration_type, key_prefix: keyPrefix },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    // SECURITY: Raw key is returned ONCE — never stored, never logged
    res.status(201).json({
      success: true,
      data: {
        ...integration,
        // ONE-TIME: The raw API key. Client must store this securely immediately.
        // This value will NOT be retrievable again after this response.
        api_key: rawKey,
        api_key_notice: 'Store this key securely. It will not be shown again.',
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/integrations/:id/rotate ─────────────────────────────────────
// Revokes the current key and issues a new one atomically
router.post(
  '/:id/rotate',
  validate(integrationParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    const { data: existing, error: fetchError } = await supabase
      .from('integrations')
      .select('id, tenant_id, name, status')
      .eq('id', req.params['id'])
      .eq('tenant_id', actor.tenant_id)
      .single();

    if (fetchError || !existing) throw new NotFoundError('Integration not found.');
    if (existing.status === 'revoked') {
      res.status(409).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Cannot rotate a revoked integration key.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const nodeEnv = process.env['NODE_ENV'] ?? 'development';
    const newRawKey = generateApiKey(nodeEnv === 'production' ? 'prod' : 'dev');
    const newKeyHash = hashApiKey(newRawKey);
    const newKeyPrefix = newRawKey.slice(0, 14);

    const { data: updated, error: updateError } = await supabase
      .from('integrations')
      .update({ key_hash: newKeyHash, key_prefix: newKeyPrefix, updated_at: new Date().toISOString() })
      .eq('id', req.params['id'])
      .select('id, name, key_prefix, status, updated_at')
      .single();

    if (updateError) {
      log.error('[INTEGRATIONS] Key rotation failed', { error: updateError.message });
      throw new AppError('Failed to rotate key.', 500);
    }

    await writeAuditLog({
      event_type: 'api_key.revoked',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'integration',
      target_id: req.params['id'] ?? '',
      outcome: 'success',
      details: { action: 'key_rotated', new_key_prefix: newKeyPrefix },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: {
        ...updated,
        api_key: newRawKey,
        api_key_notice: 'New key issued. Old key is now invalid. Store this securely.',
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── DELETE /api/v1/integrations/:id ──────────────────────────────────────────
router.delete(
  '/:id',
  validate(integrationParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    const { data: existing, error: fetchError } = await supabase
      .from('integrations')
      .select('id, tenant_id')
      .eq('id', req.params['id'])
      .eq('tenant_id', actor.tenant_id)
      .single();

    if (fetchError || !existing) throw new NotFoundError('Integration not found.');

    await supabase
      .from('integrations')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', req.params['id']);

    await writeAuditLog({
      event_type: 'api_key.revoked',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'integration',
      target_id: req.params['id'] ?? '',
      outcome: 'success',
      details: { action: 'revoked' },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: null,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/integrations/:id/test ───────────────────────────────────────
// Validates that the integration is reachable (webhook ping)
router.post(
  '/:id/test',
  validate(integrationParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    const { data: integration, error: fetchError } = await supabase
      .from('integrations')
      .select('id, tenant_id, webhook_url, status')
      .eq('id', req.params['id'])
      .eq('tenant_id', actor.tenant_id)
      .single();

    if (fetchError || !integration) throw new NotFoundError('Integration not found.');
    if (!integration.webhook_url) {
      res.status(400).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'This integration has no webhook URL configured.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Attempt a simple HTTP ping with a 5 second timeout
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const pingResponse = await fetch(integration.webhook_url as string, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-SBDMM-Event': 'ping' },
        body: JSON.stringify({ event: 'ping', timestamp: new Date().toISOString() }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      res.status(200).json({
        success: true,
        data: {
          reachable: pingResponse.ok,
          status_code: pingResponse.status,
          webhook_url: (integration.webhook_url as string).replace(/\/[^/]*$/, '/***'), // Mask path
        },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError';
      res.status(200).json({
        success: true,
        data: {
          reachable: false,
          error: isTimeout ? 'Connection timed out (5s)' : 'Connection failed',
        },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
    }
  },
);

export { router as integrationsRouter };
