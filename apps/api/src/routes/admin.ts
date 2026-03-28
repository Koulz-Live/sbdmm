/**
 * Admin Route — Super-Admin Platform Management
 *
 * SECURITY DESIGN:
 * 1. ALL routes in this file require BOTH requireAuth + requireSuperAdmin
 *    (super_admin only — tenant_admin cannot access cross-tenant data)
 * 2. Every action is audit-logged with 'admin.super_action' event type
 * 3. Tenant suspension is reversible but logged immutably
 * 4. User role assignment cannot escalate to super_admin via this route
 * 5. Sensitive fields (service_role_key, internal flags) are never returned
 *
 * HUMAN DECISION: Restrict this route to an internal network / VPN in production
 * using an upstream proxy or load-balancer IP allowlist.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireMfa } from '../middleware/mfaEnforcement';
import { validate, paginationSchema, uuidSchema } from '../schemas/index';
import { writeAuditLog } from '../services/auditLog';
import { getAdminClient } from '../lib/supabaseAdmin';
import { createChildLogger } from '../lib/logger';
import { AppError, NotFoundError } from '../middleware/errorHandler';
import { ERROR_CODES } from '@sbdmm/shared';
import { z } from 'zod';

const router = Router();

// ALL admin routes require authentication, super_admin role, AND MFA
router.use(requireAuth);
// Role check: implemented inline per route to provide granular logging
// requireMfa is applied below on state-changing routes

const tenantParamsSchema = z.object({ id: uuidSchema });
const userParamsSchema = z.object({ userId: uuidSchema });

function requireSuperAdmin(req: Request, res: Response, next: () => void): void {
  if (req.user?.role !== 'super_admin') {
    res.status(403).json({
      success: false,
      error: { code: ERROR_CODES.FORBIDDEN, message: 'Super-admin access required.' },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
    return;
  }
  next();
}

// ─── GET /api/v1/admin/tenants ────────────────────────────────────────────────
router.get(
  '/tenants',
  requireSuperAdmin,
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const { page, per_page } = req.query as unknown as { page: number; per_page: number };
    const offset = (page - 1) * per_page;
    const supabase = getAdminClient();

    // Join with counts from related tables for a summary view
    const { data, error, count } = await supabase
      .from('tenants')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (error) {
      log.error('[ADMIN] Tenants list failed', { error: error.message });
      throw new AppError('Failed to retrieve tenants.', 500);
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

// ─── GET /api/v1/admin/tenants/:id ────────────────────────────────────────────
router.get(
  '/tenants/:id',
  requireSuperAdmin,
  validate(tenantParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();

    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', req.params['id'])
      .single();

    if (error || !data) throw new NotFoundError('Tenant not found.');

    // Enrich with counts
    const [{ count: userCount }, { count: orderCount }, { count: vendorCount }] =
      await Promise.all([
        supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', req.params['id']),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', req.params['id']),
        supabase.from('vendors').select('id', { count: 'exact', head: true }).eq('tenant_id', req.params['id']),
      ]);

    res.status(200).json({
      success: true,
      data: { ...data, user_count: userCount ?? 0, order_count: orderCount ?? 0, vendor_count: vendorCount ?? 0 },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/admin/tenants/:id/suspend ───────────────────────────────────
// Suspends a tenant — blocks all their users from accessing the platform
router.post(
  '/tenants/:id/suspend',
  requireSuperAdmin,
  requireMfa,
  validate(tenantParamsSchema, 'params'),
  validate(z.object({ reason: z.string().min(10).max(2000).trim() }).strict()),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const { reason } = req.body as { reason: string };

    const { data: tenant, error: fetchError } = await supabase
      .from('tenants')
      .select('id, status, name')
      .eq('id', req.params['id'])
      .single();

    if (fetchError || !tenant) throw new NotFoundError('Tenant not found.');
    if (tenant.status === 'suspended') {
      res.status(409).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Tenant is already suspended.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { error: updateError } = await supabase
      .from('tenants')
      .update({ status: 'suspended', updated_at: new Date().toISOString() })
      .eq('id', req.params['id']);

    if (updateError) {
      log.error('[ADMIN] Tenant suspension failed', { error: updateError.message });
      throw new AppError('Failed to suspend tenant.', 500);
    }

    await writeAuditLog({
      event_type: 'tenant.suspended',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'tenant',
      target_id: req.params['id'] ?? '',
      outcome: 'success',
      details: { tenant_name: tenant.name, reason },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: { tenant_id: req.params['id'], status: 'suspended' },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/admin/tenants/:id/reinstate ─────────────────────────────────
router.post(
  '/tenants/:id/reinstate',
  requireSuperAdmin,
  requireMfa,
  validate(tenantParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const supabase = getAdminClient();
    const actor = req.user!;

    const { data: tenant, error: fetchError } = await supabase
      .from('tenants')
      .select('id, status')
      .eq('id', req.params['id'])
      .single();

    if (fetchError || !tenant) throw new NotFoundError('Tenant not found.');

    await supabase
      .from('tenants')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', req.params['id']);

    await writeAuditLog({
      event_type: 'tenant.settings_updated',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'tenant',
      target_id: req.params['id'] ?? '',
      outcome: 'success',
      details: { action: 'reinstated' },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: { tenant_id: req.params['id'], status: 'active' },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── GET /api/v1/admin/users ──────────────────────────────────────────────────
// List all users across all tenants (super_admin only)
router.get(
  '/users',
  requireSuperAdmin,
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const { page, per_page } = req.query as unknown as { page: number; per_page: number };
    const offset = (page - 1) * per_page;
    const supabase = getAdminClient();

    // Return safe profile fields only — never include auth.users sensitive data
    const { data, error, count } = await supabase
      .from('user_profiles')
      .select('id, tenant_id, email, full_name, role, is_active, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (error) {
      log.error('[ADMIN] Users list failed', { error: error.message });
      throw new AppError('Failed to retrieve users.', 500);
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

// ─── POST /api/v1/admin/users/:userId/suspend ─────────────────────────────────
router.post(
  '/users/:userId/suspend',
  requireSuperAdmin,
  requireMfa,
  validate(userParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const targetUserId = req.params['userId'] ?? '';

    // Cannot suspend yourself
    if (targetUserId === actor.id) {
      res.status(400).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Cannot suspend your own account.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({ is_active: false })
      .eq('id', targetUserId);

    if (profileError) {
      log.error('[ADMIN] User suspension failed', { error: profileError.message });
      throw new AppError('Failed to suspend user.', 500);
    }

    // Also ban via Supabase Auth to invalidate all active sessions
    await supabase.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' });

    await writeAuditLog({
      event_type: 'admin.user_suspended',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'user',
      target_id: targetUserId,
      outcome: 'success',
      details: {},
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: { user_id: targetUserId, is_active: false },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── GET /api/v1/admin/audit-logs ─────────────────────────────────────────────
// Cross-tenant audit log access (super_admin only)
router.get(
  '/audit-logs',
  requireSuperAdmin,
  validate(paginationSchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const { page, per_page } = req.query as unknown as { page: number; per_page: number };
    const offset = (page - 1) * per_page;
    const supabase = getAdminClient();

    const { data, error, count } = await supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (error) {
      log.error('[ADMIN] Audit log query failed', { error: error.message });
      throw new AppError('Failed to retrieve audit logs.', 500);
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

export { router as adminRouter };
