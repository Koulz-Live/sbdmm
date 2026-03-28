/**
 * Vendors Route — Onboarding and Management
 *
 * SECURITY PATTERNS:
 * 1. Only tenant_admin can onboard/manage vendors within their tenant
 * 2. Compliance evaluation is triggered automatically on submission
 * 3. Vendor tenant_id is always injected server-side
 * 4. Status transitions are controlled — vendors cannot self-approve
 * 5. IDOR: all fetches filter by tenant_id from req.user
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole, assertTenantOwnership } from '../middleware/authorization';
import { validate, vendorOnboardingSchema, paginationSchema, uuidSchema } from '../schemas/index';
import { writeAuditLog } from '../services/auditLog';
import { evaluateCompliance } from '../compliance/complianceEngine';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { ERROR_CODES } from '@sbdmm/shared';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

const vendorParamsSchema = z.object({ id: uuidSchema });

const updateVendorStatusSchema = z
  .object({
    status: z.enum(['approved', 'rejected', 'suspended']),
    reason: z.string().max(1000).trim().optional(),
  })
  .strict();

// ─── GET /api/v1/vendors ──────────────────────────────────────────────────────
router.get(
  '/',
  requireRole(['tenant_admin', 'super_admin', 'buyer', 'logistics_provider']),
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const { page, per_page } = req.query as unknown as { page: number; per_page: number };
    const offset = (page - 1) * per_page;
    const supabase = getAdminClient();

    const { data, error, count } = await supabase
      .from('vendors')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.user!.tenant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (error) {
      log.error('[VENDORS] List query failed', { error: error.message });
      throw new AppError('Failed to retrieve vendors.', 500);
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

// ─── GET /api/v1/vendors/:id ──────────────────────────────────────────────────
router.get(
  '/:id',
  requireRole(['tenant_admin', 'super_admin', 'buyer', 'logistics_provider']),
  validate(vendorParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', req.params['id'])
      .eq('tenant_id', req.user!.tenant_id) // IDOR prevention
      .single();

    if (error || !data) {
      log.warn('[VENDORS] Not found or tenant mismatch', { vendor_id: req.params['id'] });
      throw new NotFoundError('Vendor not found.');
    }

    res.status(200).json({
      success: true,
      data,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/vendors/onboard ─────────────────────────────────────────────
router.post(
  '/onboard',
  requireRole(['tenant_admin']),
  validate(vendorOnboardingSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    // SECURITY: tenant_id and onboarded_by are always set server-side
    const vendorPayload = {
      ...req.body as Record<string, unknown>,
      tenant_id: actor.tenant_id,
      onboarded_by: actor.id,
      status: 'pending_review',
      compliance_status: 'pending',
    };

    const { data: vendor, error: insertError } = await supabase
      .from('vendors')
      .insert(vendorPayload)
      .select()
      .single();

    if (insertError || !vendor) {
      log.error('[VENDORS] Insert failed', { error: insertError?.message });
      throw new AppError('Failed to submit vendor onboarding.', 500);
    }

    await writeAuditLog({
      event_type: 'vendor.onboarding_started',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'vendor',
      target_id: vendor.id as string,
      outcome: 'success',
      details: { company_name: vendor.company_name, country: vendor.country_of_registration },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    // Trigger compliance evaluation asynchronously (non-blocking)
    evaluateCompliance({
      tenant_id: actor.tenant_id,
      actor_id: actor.id,
      context_type: 'vendor_onboarding',
      context_id: vendor.id as string,
      data: { vendor },
      request_id: req.requestId,
    }).catch((err: unknown) => {
      log.error('[VENDORS] Compliance evaluation failed', {
        vendor_id: vendor.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    res.status(201).json({
      success: true,
      data: vendor,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── PATCH /api/v1/vendors/:id/status ─────────────────────────────────────────
// Only tenant_admin can approve/reject/suspend vendors
router.patch(
  '/:id/status',
  requireRole(['tenant_admin', 'super_admin']),
  validate(vendorParamsSchema, 'params'),
  validate(updateVendorStatusSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const { status, reason } = req.body as { status: string; reason?: string };

    // Verify vendor belongs to actor's tenant (IDOR check)
    const { data: existing, error: fetchError } = await supabase
      .from('vendors')
      .select('id, tenant_id, company_name')
      .eq('id', req.params['id'])
      .single();

    if (fetchError || !existing) throw new NotFoundError('Vendor not found.');
    assertTenantOwnership(req, existing.tenant_id as string, res);

    const { data: updated, error: updateError } = await supabase
      .from('vendors')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params['id'])
      .select()
      .single();

    if (updateError || !updated) {
      log.error('[VENDORS] Status update failed', { error: updateError?.message });
      throw new AppError('Failed to update vendor status.', 500);
    }

    const eventType = status === 'approved'
      ? 'vendor.onboarding_approved'
      : 'vendor.onboarding_rejected' as const;

    await writeAuditLog({
      event_type: eventType,
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'vendor',
      target_id: updated.id as string,
      outcome: 'success',
      details: { new_status: status, ...(reason ? { reason } : {}) },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: updated,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── DELETE /api/v1/vendors/:id ───────────────────────────────────────────────
// Soft-delete only — never hard delete (audit trail must be preserved)
router.delete(
  '/:id',
  requireRole(['tenant_admin', 'super_admin']),
  validate(vendorParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    const { data: existing, error: fetchError } = await supabase
      .from('vendors')
      .select('id, tenant_id')
      .eq('id', req.params['id'])
      .single();

    if (fetchError || !existing) throw new NotFoundError('Vendor not found.');
    assertTenantOwnership(req, existing.tenant_id as string, res);

    // Soft-delete: set status to suspended and add deleted_at
    const { error: deleteError } = await supabase
      .from('vendors')
      .update({ status: 'suspended', deleted_at: new Date().toISOString() })
      .eq('id', req.params['id']);

    if (deleteError) {
      log.error('[VENDORS] Soft-delete failed', { error: deleteError.message });
      throw new AppError('Failed to remove vendor.', 500);
    }

    await writeAuditLog({
      event_type: 'vendor.onboarding_rejected',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'vendor',
      target_id: req.params['id'] ?? '',
      outcome: 'success',
      details: { action: 'soft_deleted' },
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

export { router as vendorsRouter };
