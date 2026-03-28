/**
 * routes/auth.ts — Authentication and Profile Routes
 *
 * ENDPOINTS:
 *   GET  /api/v1/auth/profile    — Return the authenticated user's profile
 *   POST /api/v1/auth/logout     — Server-side session cleanup + audit log
 *   POST /api/v1/auth/invite     — Invite a new user to the tenant (tenant_admin only)
 *
 * SECURITY DESIGN:
 * - Profile is loaded from DB (authoritative), not from JWT claims
 * - Role assignment on invite is restricted by Zod schema (cannot assign super_admin)
 * - The actual invite email is sent by Supabase Auth (not this server) — prevents
 *   using this endpoint as an email relay or enumeration oracle
 * - All actions are audit logged
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/authorization';
import { validate } from '../schemas/index';
import { inviteUserSchema } from '../schemas/index';
import { getAdminClient } from '../lib/supabaseAdmin';
import { writeAuditLog } from '../services/auditLog';
import { AppError } from '../middleware/errorHandler';
import { createChildLogger } from '../lib/logger';
import type { UserProfile } from '@sbdmm/shared';

const router = Router();
const log = createChildLogger({ module: 'auth-route' });

/**
 * GET /api/v1/auth/profile
 *
 * Returns the authenticated user's full profile from the DB.
 * This is the authoritative source of role and tenant membership.
 */
router.get('/profile', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const supabase = getAdminClient();

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, tenant_id, email, full_name, role, is_active, created_at')
    .eq('id', user.id)
    .single();

  if (error || !data) {
    log.warn('[AUTH] Profile lookup failed', { userId: user.id, error: error?.message });
    throw new AppError('Profile not found', 404, 'NOT_FOUND');
  }

  const profile: UserProfile = data as UserProfile;

  res.json({
    success: true,
    data: profile,
    meta: {
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * POST /api/v1/auth/logout
 *
 * Optional server-side logout. The primary session invalidation
 * is handled by the Supabase client calling supabase.auth.signOut().
 * This endpoint writes an audit log entry and can be extended to
 * revoke refresh tokens server-side if needed.
 */
router.post('/logout', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;

  await writeAuditLog({
    event_type: 'user.logout',
    actor_id: user.id,
    tenant_id: user.tenant_id,
    outcome: 'success',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    request_id: req.requestId,
  });

  res.json({
    success: true,
    data: { message: 'Logged out successfully.' },
    meta: {
      request_id: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * POST /api/v1/auth/invite
 *
 * Invites a new user to the current tenant.
 * Only tenant_admin and super_admin may send invites.
 *
 * SECURITY:
 * - Role restricted (cannot invite super_admin — enforced by Zod schema too)
 * - Invited user's tenant_id is set server-side to the inviting admin's tenant
 * - Uses Supabase Admin inviteUserByEmail — Supabase handles the actual email
 */
router.post(
  '/invite',
  requireAuth,
  requireRole(['tenant_admin', 'super_admin']),
  validate(inviteUserSchema),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.user!;
    const { email, role, full_name } = req.body as { email: string; role: string; full_name: string };
    const supabase = getAdminClient();

    log.info('[AUTH] User invite initiated', { actor: actor.id, tenant: actor.tenant_id, role });

    // Supabase handles sending the invite email and creating the Auth user
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          tenant_id: actor.tenant_id,
          role,
          full_name: full_name ?? '',
          invited_by: actor.id,
        },
      },
    );

    if (inviteError || !inviteData?.user) {
      log.error('[AUTH] User invite failed', { error: inviteError?.message, actor: actor.id });
      throw new AppError('Failed to send invitation. Please try again.', 500, 'INTERNAL_ERROR');
    }

    // Create the user_profiles row so our auth middleware can look it up
    const { error: profileError } = await supabase.from('user_profiles').insert({
      id: inviteData.user.id,
      tenant_id: actor.tenant_id,
      email: email,
      full_name: full_name ?? '',
      role,
      is_active: false, // Activated on first login after invite acceptance
      created_by: actor.id,
    });

    if (profileError) {
      log.error('[AUTH] Profile insert after invite failed', { error: profileError.message, userId: inviteData.user.id });
      // Non-fatal — Supabase trigger can also handle this, but log for ops visibility
    }

    await writeAuditLog({
      event_type: 'admin.role_assigned',
      actor_id: actor.id,
      tenant_id: actor.tenant_id,
      target_type: 'user',
      target_id: inviteData.user.id,
      outcome: 'success',
      details: { invited_role: role },
      ip_address: req.ip,
      request_id: req.requestId,
    });

    res.status(201).json({
      success: true,
      data: {
        message: 'Invitation sent successfully.',
        user_id: inviteData.user.id,
      },
      meta: {
        request_id: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  },
);

// ─── GET /api/v1/auth/mfa-status ─────────────────────────────────────────────
// Returns the current user's MFA enrollment status
router.get(
  '/mfa-status',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const supabase = getAdminClient();
    const actor = req.user!;

    const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId: actor.id });

    if (error) {
      log.error('[AUTH] MFA factor lookup failed', { error: error.message, user_id: actor.id });
      throw new AppError('Failed to retrieve MFA status.', 500);
    }

    const factors = (data?.factors ?? []).map((f) => ({
      id: f.id,
      factor_type: f.factor_type,
      status: f.status,
      created_at: f.created_at,
    }));

    const enrolled = factors.some((f) => f.factor_type === 'totp' && f.status === 'verified');
    const { PRIVILEGED_ROLES } = await import('@sbdmm/shared');
    const required = PRIVILEGED_ROLES.includes(actor.role);

    res.status(200).json({
      success: true,
      data: { enrolled, required, factors },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  },
);

export { router as authRouter };
