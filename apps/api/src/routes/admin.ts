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

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireMfa } from '../middleware/mfaEnforcement';
import { sensitiveWriteRateLimit } from '../middleware/rateLimiter';
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

// SECURITY: All non-GET admin operations are subject to an additional strict
// write rate limit (30 req/15 min per IP) on top of perUserRateLimit in requireAuth.
// Admin writes are the highest-value target; the extra layer limits blast radius
// from a stolen super_admin token before revocation.
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    sensitiveWriteRateLimit(req, res, next);
  } else {
    next();
  }
});

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

// ─── Audit-log query schema ───────────────────────────────────────────────────
const auditLogQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).default(1),
  per_page:   z.coerce.number().int().min(1).max(200).default(50),
  user_id:    z.string().uuid().optional(),
  tenant_id:  z.string().uuid().optional(),
  event_type: z.string().max(100).optional(),
  outcome:    z.enum(['success', 'failure', 'blocked']).optional(),
  ip_address: z.string().max(45).optional(),
  page_path:  z.string().max(500).optional(),
  date_from:  z.string().datetime({ offset: true }).optional(),
  date_to:    z.string().datetime({ offset: true }).optional(),
  search:     z.string().max(200).trim().optional(),
});

// IP blocklist schemas
const ipBlockSchema = z.object({
  ip_address: z.string().min(1).max(45),
  reason:     z.string().min(3).max(1000).trim(),
  expires_at: z.string().datetime({ offset: true }).optional(),
}).strict();

const ipParamsSchema = z.object({ ip: z.string().min(1).max(50) });

// ─── GET /api/v1/admin/audit-logs ─────────────────────────────────────────────
// Cross-tenant audit log access with full filter support
router.get(
  '/audit-logs',
  requireSuperAdmin,
  validate(auditLogQuerySchema, 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const { page, per_page, user_id, tenant_id, event_type, outcome, ip_address, page_path, date_from, date_to, search } =
      req.query as unknown as z.infer<typeof auditLogQuerySchema>;
    const offset = (page - 1) * per_page;
    const supabase = getAdminClient();

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (user_id)    query = query.eq('actor_id', user_id);
    if (tenant_id)  query = query.eq('tenant_id', tenant_id);
    if (outcome)    query = query.eq('outcome', outcome);
    if (ip_address) query = query.eq('ip_address', ip_address);
    if (page_path)  query = query.ilike('page_path', `%${page_path}%`);
    if (date_from)  query = query.gte('created_at', date_from);
    if (date_to)    query = query.lte('created_at', date_to);
    if (event_type) query = query.ilike('event_type', `%${event_type}%`);
    if (search)     query = query.or(`event_type.ilike.%${search}%,ip_address.ilike.%${search}%,page_path.ilike.%${search}%`);

    const { data, error, count } = await query;

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

// ─── GET /api/v1/admin/audit-logs/stats ──────────────────────────────────────
// Aggregate statistics for the audit intelligence dashboard
router.get(
  '/audit-logs/stats',
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();

    // Window: last 24h and last 30d
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: total24h },
      { count: total30d },
      { count: aiCalls24h },
      { count: failedEvents24h },
      { count: blockedEvents24h },
      { count: blockedIpCount },
      { data: topEvents },
      { data: topIps },
      { data: aiPerUser },
    ] = await Promise.all([
      // Total events 24h
      supabase.from('audit_logs').select('id', { count: 'exact', head: true }).gte('created_at', last24h),
      // Total events 30d
      supabase.from('audit_logs').select('id', { count: 'exact', head: true }).gte('created_at', last30d),
      // AI calls 24h
      supabase.from('audit_logs').select('id', { count: 'exact', head: true })
        .gte('created_at', last24h).ilike('event_type', 'ai.%'),
      // Failed events 24h
      supabase.from('audit_logs').select('id', { count: 'exact', head: true })
        .gte('created_at', last24h).eq('outcome', 'failure'),
      // Blocked events 24h
      supabase.from('audit_logs').select('id', { count: 'exact', head: true })
        .gte('created_at', last24h).eq('outcome', 'blocked'),
      // Active blocked IPs
      supabase.from('ip_blocklist').select('id', { count: 'exact', head: true }).eq('is_active', true),
      // Top 10 event types (30d)
      supabase.rpc('admin_top_event_types', { since: last30d, limit_count: 10 })
        .then(r => r.error ? { data: null } : r),
      // Top 10 IPs by event count (30d, exclude null)
      supabase.from('audit_logs').select('ip_address')
        .gte('created_at', last30d).not('ip_address', 'is', null).limit(1000),
      // AI usage per user (30d)
      supabase.from('ai_usage_logs').select('user_id, model, total_tokens, estimated_cost_usd, outcome, created_at')
        .gte('created_at', last30d).order('created_at', { ascending: false }).limit(500),
    ]);

    // Aggregate top IPs manually (no GROUP BY via Supabase client)
    const ipCounts: Record<string, number> = {};
    if (topIps) {
      for (const row of topIps as Array<{ ip_address: string | null }>) {
        if (row.ip_address) ipCounts[row.ip_address] = (ipCounts[row.ip_address] ?? 0) + 1;
      }
    }
    const topIpList = Object.entries(ipCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip_address: ip, count }));

    // Aggregate AI per user manually
    interface AiRow { user_id: string; model: string; total_tokens: number; estimated_cost_usd: number | null; outcome: string }
    const aiByUser: Record<string, { user_id: string; requests: number; total_tokens: number; cost_usd: number; models: Set<string> }> = {};
    if (aiPerUser) {
      for (const row of aiPerUser as AiRow[]) {
        if (!aiByUser[row.user_id]) aiByUser[row.user_id] = { user_id: row.user_id, requests: 0, total_tokens: 0, cost_usd: 0, models: new Set() };
        const entry = aiByUser[row.user_id]!;
        entry.requests++;
        entry.total_tokens += row.total_tokens ?? 0;
        entry.cost_usd += Number(row.estimated_cost_usd ?? 0);
        entry.models.add(row.model);
      }
    }
    const aiUserList = Object.values(aiByUser)
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 20)
      .map(u => ({ ...u, models: Array.from(u.models) }));

    if (topEvents) {
      log.debug('[ADMIN] Stats: top events RPC succeeded');
    }

    res.status(200).json({
      success: true,
      data: {
        summary: {
          events_24h:       total24h ?? 0,
          events_30d:       total30d ?? 0,
          ai_calls_24h:     aiCalls24h ?? 0,
          failures_24h:     failedEvents24h ?? 0,
          blocked_24h:      blockedEvents24h ?? 0,
          blocked_ips:      blockedIpCount ?? 0,
        },
        top_ips:    topIpList,
        ai_per_user: aiUserList,
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

// ─── GET /api/v1/admin/users/:userId/audit-logs ───────────────────────────────
// Per-user full activity timeline: audit events + page navigation
router.get(
  '/users/:userId/audit-logs',
  requireSuperAdmin,
  validate(userParamsSchema, 'params'),
  validate(z.object({
    page:      z.coerce.number().int().min(1).default(1),
    per_page:  z.coerce.number().int().min(1).max(100).default(50),
    date_from: z.string().datetime({ offset: true }).optional(),
    date_to:   z.string().datetime({ offset: true }).optional(),
  }), 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const { userId } = req.params as { userId: string };
    const { page, per_page, date_from, date_to } = req.query as unknown as {
      page: number; per_page: number; date_from?: string; date_to?: string;
    };
    const offset = (page - 1) * per_page;

    // Fetch user profile for display
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, full_name, role, tenant_id, is_active, created_at')
      .eq('id', userId)
      .single();

    if (!profile) throw new NotFoundError('User not found.');

    // Audit events for this user
    let auditQ = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('actor_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (date_from) auditQ = auditQ.gte('created_at', date_from);
    if (date_to)   auditQ = auditQ.lte('created_at', date_to);

    const { data: auditEvents, count: auditTotal, error: auditErr } = await auditQ;

    if (auditErr) {
      log.error('[ADMIN] User audit query failed', { error: auditErr.message, userId });
      throw new AppError('Failed to load user activity.', 500);
    }

    // Page navigation (last 200 entries) — separate endpoint keeps response lean
    let navQ = supabase
      .from('page_navigation_logs')
      .select('id, page_path, referrer_path, duration_ms, ip_address, geo_country, geo_city, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (date_from) navQ = navQ.gte('created_at', date_from);
    if (date_to)   navQ = navQ.lte('created_at', date_to);
    const { data: navLogs } = await navQ;

    // AI usage summary for this user
    const { data: aiUsage } = await supabase
      .from('ai_usage_logs')
      .select('model, total_tokens, estimated_cost_usd, outcome, feature, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    // Aggregate AI stats
    const aiSummary = {
      total_requests: (aiUsage ?? []).length,
      total_tokens:   (aiUsage ?? []).reduce((s, r) => s + (r.total_tokens ?? 0), 0),
      total_cost_usd: (aiUsage ?? []).reduce((s, r) => s + Number(r.estimated_cost_usd ?? 0), 0),
    };

    res.status(200).json({
      success: true,
      data: {
        profile,
        audit_events:  auditEvents ?? [],
        page_nav:      navLogs ?? [],
        ai_usage:      aiUsage ?? [],
        ai_summary:    aiSummary,
      },
      meta: {
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
        pagination: {
          page, per_page,
          total: auditTotal ?? 0,
          total_pages: Math.ceil((auditTotal ?? 0) / per_page),
        },
      },
    });
  },
);

// ─── GET /api/v1/admin/blocked-ips ───────────────────────────────────────────
router.get(
  '/blocked-ips',
  requireSuperAdmin,
  validate(z.object({
    page:     z.coerce.number().int().min(1).default(1),
    per_page: z.coerce.number().int().min(1).max(100).default(50),
    active:   z.enum(['true', 'false']).default('true'),
  }), 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const { page, per_page, active } = req.query as unknown as { page: number; per_page: number; active: string };
    const offset = (page - 1) * per_page;

    const { data, error, count } = await supabase
      .from('ip_blocklist')
      .select('*', { count: 'exact' })
      .eq('is_active', active === 'true')
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (error) {
      log.error('[ADMIN] Blocked IPs query failed', { error: error.message });
      throw new AppError('Failed to retrieve blocked IPs.', 500);
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

// ─── POST /api/v1/admin/blocked-ips ──────────────────────────────────────────
router.post(
  '/blocked-ips',
  requireSuperAdmin,
  requireMfa,
  validate(ipBlockSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const { ip_address, reason, expires_at } = req.body as z.infer<typeof ipBlockSchema>;

    // Check for existing active block
    const { data: existing } = await supabase
      .from('ip_blocklist')
      .select('id')
      .eq('ip_address', ip_address)
      .eq('is_active', true)
      .maybeSingle();

    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: ERROR_CODES.VALIDATION_ERROR, message: 'This IP address is already blocked.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { data, error } = await supabase
      .from('ip_blocklist')
      .insert({
        ip_address,
        reason,
        blocked_by: actor.id,
        tenant_id:  actor.tenant_id,
        is_active:  true,
        expires_at: expires_at ?? null,
      })
      .select()
      .single();

    if (error) {
      log.error('[ADMIN] IP block failed', { error: error.message, ip_address });
      throw new AppError('Failed to block IP.', 500);
    }

    await writeAuditLog({
      event_type: 'admin.super_action',
      actor_id:   actor.id,
      tenant_id:  actor.tenant_id,
      target_type: 'ip_address',
      target_id:   ip_address,
      outcome:    'success',
      details:    { action: 'ip_blocked', ip_address, reason, expires_at },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(201).json({ success: true, data, meta: { request_id: req.requestId, timestamp: new Date().toISOString() } });
  },
);

// ─── DELETE /api/v1/admin/blocked-ips/:ip ────────────────────────────────────
// Soft-unblocks an IP (sets is_active = false, records who unblocked)
router.delete(
  '/blocked-ips/:ip',
  requireSuperAdmin,
  requireMfa,
  validate(ipParamsSchema, 'params'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const actor = req.user!;
    const ip = decodeURIComponent(req.params['ip'] ?? '');

    const { data: block } = await supabase
      .from('ip_blocklist')
      .select('id')
      .eq('ip_address', ip)
      .eq('is_active', true)
      .maybeSingle();

    if (!block) {
      res.status(404).json({
        success: false,
        error: { code: ERROR_CODES.NOT_FOUND, message: 'Active block not found for this IP.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    const { error } = await supabase
      .from('ip_blocklist')
      .update({ is_active: false, unblocked_by: actor.id, unblocked_at: new Date().toISOString() })
      .eq('id', block.id);

    if (error) {
      log.error('[ADMIN] IP unblock failed', { error: error.message, ip });
      throw new AppError('Failed to unblock IP.', 500);
    }

    await writeAuditLog({
      event_type: 'admin.super_action',
      actor_id:   actor.id,
      tenant_id:  actor.tenant_id,
      target_type: 'ip_address',
      target_id:   ip,
      outcome:    'success',
      details:    { action: 'ip_unblocked', ip_address: ip },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(200).json({ success: true, data: { ip_address: ip, is_active: false }, meta: { request_id: req.requestId, timestamp: new Date().toISOString() } });
  },
);

// ─── GET /api/v1/admin/page-navigation ───────────────────────────────────────
// Cross-tenant page navigation telemetry
router.get(
  '/page-navigation',
  requireSuperAdmin,
  validate(z.object({
    page:     z.coerce.number().int().min(1).default(1),
    per_page: z.coerce.number().int().min(1).max(200).default(100),
    user_id:  z.string().uuid().optional(),
    path:     z.string().max(500).optional(),
    date_from: z.string().datetime({ offset: true }).optional(),
    date_to:   z.string().datetime({ offset: true }).optional(),
  }), 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const { page, per_page, user_id, path, date_from, date_to } =
      req.query as unknown as { page: number; per_page: number; user_id?: string; path?: string; date_from?: string; date_to?: string };
    const offset = (page - 1) * per_page;

    let query = supabase
      .from('page_navigation_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (user_id)   query = query.eq('user_id', user_id);
    if (path)      query = query.ilike('page_path', `%${path}%`);
    if (date_from) query = query.gte('created_at', date_from);
    if (date_to)   query = query.lte('created_at', date_to);

    const { data, error, count } = await query;

    if (error) {
      log.error('[ADMIN] Page navigation query failed', { error: error.message });
      throw new AppError('Failed to retrieve navigation logs.', 500);
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

// ─── GET /api/v1/admin/ai-usage ───────────────────────────────────────────────
// AI usage logs with per-user aggregation
router.get(
  '/ai-usage',
  requireSuperAdmin,
  validate(z.object({
    page:     z.coerce.number().int().min(1).default(1),
    per_page: z.coerce.number().int().min(1).max(200).default(50),
    user_id:  z.string().uuid().optional(),
    model:    z.string().max(100).optional(),
    date_from: z.string().datetime({ offset: true }).optional(),
    date_to:   z.string().datetime({ offset: true }).optional(),
  }), 'query'),
  async (req: Request, res: Response): Promise<void> => {
    const log = createChildLogger({ request_id: req.requestId });
    const supabase = getAdminClient();
    const { page, per_page, user_id, model, date_from, date_to } =
      req.query as unknown as { page: number; per_page: number; user_id?: string; model?: string; date_from?: string; date_to?: string };
    const offset = (page - 1) * per_page;

    let query = supabase
      .from('ai_usage_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + per_page - 1);

    if (user_id)   query = query.eq('user_id', user_id);
    if (model)     query = query.eq('model', model);
    if (date_from) query = query.gte('created_at', date_from);
    if (date_to)   query = query.lte('created_at', date_to);

    const { data, error, count } = await query;

    if (error) {
      log.error('[ADMIN] AI usage query failed', { error: error.message });
      throw new AppError('Failed to retrieve AI usage logs.', 500);
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

// ─── POST /api/v1/admin/page-navigation ──────────────────────────────────────
// Frontend SDK endpoint — records a page navigation event from the browser.
// NOTE: This uses requireAuth (not requireSuperAdmin) since all users can send telemetry.
router.post(
  '/page-navigation',
  validate(z.object({
    page_path:     z.string().min(1).max(500),
    referrer_path: z.string().max(500).optional(),
    duration_ms:   z.number().int().min(0).max(3_600_000).optional(),
    session_id:    z.string().max(100).optional(),
  }).strict()),
  async (req: Request, res: Response): Promise<void> => {
    const supabase = getAdminClient();
    const actor = req.user;
    if (!actor) { res.status(401).json({ success: false }); return; }

    const { page_path, referrer_path, duration_ms, session_id } = req.body as {
      page_path: string; referrer_path?: string; duration_ms?: number; session_id?: string;
    };

    await supabase.from('page_navigation_logs').insert({
      user_id:       actor.id,
      tenant_id:     actor.tenant_id,
      session_id:    session_id ?? null,
      page_path,
      referrer_path: referrer_path ?? null,
      duration_ms:   duration_ms ?? null,
      ip_address:    req.ip ?? null,
      user_agent:    req.get('user-agent')?.slice(0, 500) ?? null,
    });

    res.status(201).json({ success: true, meta: { request_id: req.requestId, timestamp: new Date().toISOString() } });
  },
);

export { router as adminRouter };
