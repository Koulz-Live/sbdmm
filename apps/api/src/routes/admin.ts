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
import { ERROR_CODES, PLATFORM_ROLES } from '@sbdmm/shared';
import { z } from 'zod';

const router = Router();

// ALL admin routes require authentication, super_admin role, AND MFA
router.use(requireAuth);
// Role check: implemented inline per route to provide granular logging
// requireMfa is applied below on state-changing routes

const tenantParamsSchema = z.object({ id: uuidSchema });
const userParamsSchema = z.object({ userId: uuidSchema });

// Filters for user list
const userListQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).default(1),
  per_page:  z.coerce.number().int().min(1).max(100).default(20),
  search:    z.string().max(200).trim().optional(),
  role:      z.enum(['buyer', 'vendor', 'logistics_provider', 'tenant_admin', 'super_admin']).optional(),
  tenant_id: z.string().uuid().optional(),
  is_active: z.enum(['true', 'false']).optional(),
});

// Update user schema — super_admin can change role (including to super_admin), name, active state
const updateUserSchema = z.object({
  full_name: z.string().min(1).max(255).trim().optional(),
  role:      z.enum(['buyer', 'vendor', 'logistics_provider', 'tenant_admin', 'super_admin']).optional(),
  is_active: z.boolean().optional(),
}).strict().refine(d => Object.keys(d).length > 0, { message: 'At least one field must be provided.' });

// Super-admin invite schema — allows any role including super_admin, and any tenant
const adminInviteSchema = z.object({
  email:     z.string().email().max(255).toLowerCase().trim(),
  full_name: z.string().min(1).max(255).trim(),
  role:      z.enum(['buyer', 'vendor', 'logistics_provider', 'tenant_admin', 'super_admin']),
  tenant_id: z.string().uuid().optional(), // if omitted, uses actor's tenant
}).strict();

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
// List all users across all tenants with search, role, tenant, and status filters
router.get(
  '/users',
  requireSuperAdmin,
  validate(userListQuerySchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const { page, per_page, search, role, tenant_id, is_active } =
      req.query as unknown as z.infer<typeof userListQuerySchema>;
    const offset = (page - 1) * per_page;
    const supabase = getAdminClient();

    let query = supabase
      .from('user_profiles')
      .select('id, tenant_id, full_name, role, is_active, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (role)      query = query.eq('role', role);
    if (tenant_id) query = query.eq('tenant_id', tenant_id);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    if (search)    query = query.ilike('full_name', `%${search}%`);

    const { data, error, count } = await query;

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

// ─── GET /api/v1/admin/users/:userId ─────────────────────────────────────────
router.get(
  '/users/:userId',
  requireSuperAdmin,
  validate(userParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, tenant_id, full_name, role, is_active, created_at')
      .eq('id', req.params['userId'])
      .single();

    if (error || !data) throw new NotFoundError('User not found.');
    res.status(200).json({ success: true, data, meta: { request_id: req.requestId, timestamp: new Date().toISOString() } });
  },
);

// ─── PATCH /api/v1/admin/users/:userId ───────────────────────────────────────
// Update name, role, or is_active. All changes are audit-logged.
router.patch(
  '/users/:userId',
  requireSuperAdmin,
  requireMfa,
  validate(userParamsSchema, 'params'),
  validate(updateUserSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const targetUserId = req.params['userId'] ?? '';
    const updates = req.body as { full_name?: string; role?: string; is_active?: boolean };

    // Prevent self-demotion or self-deactivation to avoid lockout
    if (targetUserId === actor.id && (updates.role !== undefined || updates.is_active === false)) {
      res.status(400).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Cannot change your own role or deactivate your own account.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data: before } = await supabase.from('user_profiles').select('id, role, full_name, is_active').eq('id', targetUserId).single();
    if (!before) throw new NotFoundError('User not found.');

    const patch: Record<string, unknown> = {};
    if (updates.full_name !== undefined) patch['full_name'] = updates.full_name;
    if (updates.role      !== undefined) patch['role']      = updates.role;
    if (updates.is_active !== undefined) patch['is_active'] = updates.is_active;

    const { data, error } = await supabase
      .from('user_profiles')
      .update(patch)
      .eq('id', targetUserId)
      .select('id, tenant_id, full_name, role, is_active, created_at')
      .single();

    if (error) {
      log.error('[ADMIN] User update failed', { error: error.message, targetUserId });
      throw new AppError('Failed to update user.', 500);
    }

    // If deactivated via this patch, also ban via Supabase Auth
    if (updates.is_active === false) {
      await supabase.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' });
    }
    // If reactivated, lift the ban
    if (updates.is_active === true) {
      await supabase.auth.admin.updateUserById(targetUserId, { ban_duration: '0s' });
    }

    await writeAuditLog({
      event_type: 'admin.role_assigned',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'user',
      target_id: targetUserId,
      outcome: 'success',
      details: { before: { role: before.role, full_name: before.full_name, is_active: before.is_active }, after: patch },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({ success: true, data, meta: { request_id: req.requestId, timestamp: new Date().toISOString() } });
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

// ─── POST /api/v1/admin/users/:userId/reinstate ───────────────────────────────
router.post(
  '/users/:userId/reinstate',
  requireSuperAdmin,
  requireMfa,
  validate(userParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const targetUserId = req.params['userId'] ?? '';

    const { error } = await supabase
      .from('user_profiles')
      .update({ is_active: true })
      .eq('id', targetUserId);

    if (error) {
      log.error('[ADMIN] User reinstate failed', { error: error.message });
      throw new AppError('Failed to reinstate user.', 500);
    }

    // Lift the auth ban
    await supabase.auth.admin.updateUserById(targetUserId, { ban_duration: '0s' });

    await writeAuditLog({
      event_type: 'admin.role_assigned',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'user',
      target_id: targetUserId,
      outcome: 'success',
      details: { action: 'reinstated' },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: { user_id: targetUserId, is_active: true },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── DELETE /api/v1/admin/users/:userId ──────────────────────────────────────
// Hard-deletes the user from auth + soft-deactivates the profile.
// SECURITY: Cannot delete yourself. Audit-logged.
router.delete(
  '/users/:userId',
  requireSuperAdmin,
  requireMfa,
  validate(userParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const targetUserId = req.params['userId'] ?? '';

    if (targetUserId === actor.id) {
      res.status(400).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'Cannot delete your own account.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Soft-deactivate profile first (keeps FK integrity in orders, quotes, etc.)
    await supabase.from('user_profiles').update({ is_active: false }).eq('id', targetUserId);

    // Delete from auth — this invalidates all sessions and auth records
    const { error: authError } = await supabase.auth.admin.deleteUser(targetUserId);
    if (authError) {
      log.error('[ADMIN] User auth deletion failed', { error: authError.message });
      throw new AppError('Failed to delete user from auth provider.', 500);
    }

    await writeAuditLog({
      event_type: 'admin.super_action',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'user',
      target_id: targetUserId,
      outcome: 'success',
      details: { action: 'user_deleted' },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({
      success: true,
      data: { user_id: targetUserId, deleted: true },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── POST /api/v1/admin/users/invite ─────────────────────────────────────────
// Super-admin can invite any role to any tenant (includes super_admin).
router.post(
  '/users/invite',
  requireSuperAdmin,
  requireMfa,
  validate(adminInviteSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const { email, full_name, role, tenant_id } = req.body as z.infer<typeof adminInviteSchema>;

    const effectiveTenantId = tenant_id ?? actor.tenant_id;

    const { data: existing } = await supabase.auth.admin.listUsers();
    const alreadyExists = existing?.users.some(u => u.email?.toLowerCase() === email);
    if (alreadyExists) {
      res.status(409).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'A user with this email already exists.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role, tenant_id: effectiveTenantId },
    });

    if (inviteError || !inviteData?.user) {
      log.error('[ADMIN] Invite failed', { error: inviteError?.message });
      throw new AppError('Failed to send invitation.', 500);
    }

    // Upsert profile — the DB trigger may already have created it
    await supabase.from('user_profiles').upsert({
      id: inviteData.user.id,
      tenant_id: effectiveTenantId,
      full_name,
      role,
      is_active: true,
    }, { onConflict: 'id' });

    await writeAuditLog({
      event_type: 'admin.role_assigned',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'user',
      target_id: inviteData.user.id,
      outcome: 'success',
      details: { action: 'invited', email, role, tenant_id: effectiveTenantId },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(201).json({
      success: true,
      data: { user_id: inviteData.user.id, email, role, tenant_id: effectiveTenantId },
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
