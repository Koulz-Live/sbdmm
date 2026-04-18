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

// ─── GET /api/v1/vendors/me ───────────────────────────────────────────────────
// Returns the vendor record that belongs to the authenticated vendor/provider.
// This must be declared BEFORE /:id so Express doesn't treat "me" as a UUID.
router.get(
  '/me',
  requireRole(['vendor', 'logistics_provider']),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    // Find the vendor record onboarded by this user within their tenant
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('tenant_id', actor.tenant_id)
      .eq('onboarded_by', actor.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      log.info('[VENDORS] /me — no vendor record found for user', { user_id: actor.id });
      // Return 404 so the frontend can redirect to onboarding
      res.status(404).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'No vendor profile found for your account.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── GET /api/v1/vendors/:id ──────────────────────────────────────────────────
router.get(
  '/:id',
  requireRole(['tenant_admin', 'super_admin', 'buyer', 'logistics_provider', 'vendor']),
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
      .update({ onboarding_status: status, updated_at: new Date().toISOString() })
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

    // Soft-delete: set onboarding_status to suspended and add deleted_at
    const { error: deleteError } = await supabase
      .from('vendors')
      .update({ onboarding_status: 'suspended', deleted_at: new Date().toISOString() })
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


// ─── GET /api/v1/vendors/:id/catalogue ────────────────────────────────────────
// Public within tenant — any authenticated user can browse a vendor's catalogue.
router.get(
  '/:id/catalogue',
  requireRole(['tenant_admin', 'super_admin', 'buyer', 'vendor', 'logistics_provider']),
  validate(vendorParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();

    // Verify vendor belongs to this tenant (IDOR guard)
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, tenant_id, company_name, onboarding_status')
      .eq('id', req.params['id'])
      .eq('tenant_id', req.user!.tenant_id)
      .single();

    if (vendorError || !vendor) {
      throw new NotFoundError('Vendor not found.');
    }

    const { data, error, count } = await supabase
      .from('vendor_catalogue')
      .select('*', { count: 'exact' })
      .eq('vendor_id', req.params['id'])
      .eq('tenant_id', req.user!.tenant_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      log.error('[CATALOGUE] List query failed', { error: error.message });
      throw new AppError('Failed to retrieve catalogue.', 500);
    }

    res.status(200).json({
      success: true,
      data: data ?? [],
      meta: {
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: { page: 1, per_page: count ?? 0, total: count ?? 0, total_pages: 1 },
      },
    });
  },
);

// ─── POST /api/v1/vendors/:id/catalogue ───────────────────────────────────────
// Only vendors (self) or tenant_admin can add catalogue items.
const catalogueItemSchema = z.object({
  title: z.string().min(3).max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  service_mode: z.enum(['FCL', 'LCL', 'AIR', 'ROAD', 'RAIL', 'COURIER', 'OTHER']),
  origin_region: z.string().min(2).max(100).trim(),
  destination_region: z.string().min(2).max(100).trim(),
  transit_days_min: z.number().int().min(1),
  transit_days_max: z.number().int().min(1),
  base_price_amount: z.number().positive().optional().nullable(),
  base_price_currency: z.string().length(3).toUpperCase().default('USD'),
  price_unit: z.string().min(1).max(50).trim().default('per shipment'),
  tags: z.array(z.string().max(50)).max(10).default([]),
}).strict();

router.post(
  '/:id/catalogue',
  requireRole(['vendor', 'logistics_provider', 'tenant_admin', 'super_admin']),
  validate(vendorParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    // Verify vendor belongs to this tenant
    const { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, tenant_id')
      .eq('id', req.params['id'])
      .eq('tenant_id', actor.tenant_id)
      .single();

    if (vendorError || !vendor) throw new NotFoundError('Vendor not found.');

    const parsed = catalogueItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message ?? 'Invalid input.' } });
      return;
    }

    const { data: item, error: insertError } = await supabase
      .from('vendor_catalogue')
      .insert({
        ...parsed.data,
        vendor_id: req.params['id'],
        tenant_id: actor.tenant_id,
        created_by: actor.id,
        status: 'active',
      })
      .select()
      .single();

    if (insertError || !item) {
      log.error('[CATALOGUE] Insert failed', { error: insertError?.message });
      throw new AppError('Failed to create catalogue item.', 500);
    }

    res.status(201).json({
      success: true,
      data: item,
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── PATCH /api/v1/vendors/:id/catalogue/:itemId ──────────────────────────────
router.patch(
  '/:id/catalogue/:itemId',
  requireRole(['vendor', 'logistics_provider', 'tenant_admin', 'super_admin']),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    const { data: existing, error: fetchError } = await supabase
      .from('vendor_catalogue')
      .select('id, tenant_id, vendor_id')
      .eq('id', req.params['itemId'] ?? '')
      .eq('vendor_id', req.params['id'] ?? '')
      .eq('tenant_id', actor.tenant_id)
      .single();

    if (fetchError || !existing) throw new NotFoundError('Catalogue item not found.');

    const { data: updated, error: updateError } = await supabase
      .from('vendor_catalogue')
      .update({ ...req.body as Record<string, unknown>, updated_at: new Date().toISOString() })
      .eq('id', req.params['itemId'] ?? '')
      .select()
      .single();

    if (updateError || !updated) {
      log.error('[CATALOGUE] Update failed', { error: updateError?.message });
      throw new AppError('Failed to update catalogue item.', 500);
    }

    res.status(200).json({ success: true, data: updated, meta: { request_id: req.requestId, timestamp: new Date().toISOString() } });
  },
);

// ─── DELETE /api/v1/vendors/:id/catalogue/:itemId ─────────────────────────────
router.delete(
  '/:id/catalogue/:itemId',
  requireRole(['vendor', 'logistics_provider', 'tenant_admin', 'super_admin']),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;

    const { data: existing, error: fetchError } = await supabase
      .from('vendor_catalogue')
      .select('id, tenant_id')
      .eq('id', req.params['itemId'] ?? '')
      .eq('vendor_id', req.params['id'] ?? '')
      .eq('tenant_id', actor.tenant_id)
      .single();

    if (fetchError || !existing) throw new NotFoundError('Catalogue item not found.');

    const { error: deleteError } = await supabase
      .from('vendor_catalogue')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', req.params['itemId'] ?? '');

    if (deleteError) {
      log.error('[CATALOGUE] Soft-delete failed', { error: deleteError.message });
      throw new AppError('Failed to remove catalogue item.', 500);
    }

    res.status(200).json({ success: true, data: null, meta: { request_id: req.requestId, timestamp: new Date().toISOString() } });
  },
);


export { router as vendorsRouter };
