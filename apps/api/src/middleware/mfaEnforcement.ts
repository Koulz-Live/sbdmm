/**
 * MFA Enforcement Middleware
 *
 * SECURITY POLICY:
 * Users with privileged roles (tenant_admin, super_admin) MUST have MFA enrolled
 * and verified before accessing protected routes.
 *
 * This middleware:
 * 1. Checks if the user's role is in PRIVILEGED_ROLES
 * 2. Queries Supabase Auth Factors API for enrolled, verified factors
 * 3. Blocks with 403 if no verified factor exists
 * 4. Is idempotent — can be stacked with other middleware safely
 *
 * USAGE:
 *   router.post('/admin/action', requireAuth, requireMfa, handler)
 *
 * HUMAN DECISION: Apply requireMfa to ALL privileged role routes in production.
 * During development, set MFA_ENFORCEMENT_ENABLED=false to bypass.
 */

import { Request, Response, NextFunction } from 'express';
import { getAdminClient } from '../lib/supabaseAdmin';
import { PRIVILEGED_ROLES } from '@sbdmm/shared';
import { logger } from '../lib/logger';

const MFA_ENFORCEMENT_ENABLED = process.env['MFA_ENFORCEMENT_ENABLED'] !== 'false';

export async function requireMfa(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.user;

  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
    return;
  }

  // Only enforce for privileged roles
  if (!PRIVILEGED_ROLES.includes(user.role)) {
    next();
    return;
  }

  // Allow bypass in non-production for developer convenience
  if (!MFA_ENFORCEMENT_ENABLED) {
    logger.warn('[MFA] MFA enforcement bypassed — NOT FOR PRODUCTION', {
      request_id: req.requestId,
      user_id: user.id,
      role: user.role,
    });
    next();
    return;
  }

  try {
    const supabase = getAdminClient();
    // Use the Admin MFA API to list factors for a specific user (service role required)
    const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId: user.id });

    if (error) {
      logger.error('[MFA] Factor lookup failed', { error: error.message, user_id: user.id });
      // Fail closed: if we can't verify MFA, deny access
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'MFA verification required for this operation. Please enroll MFA and try again.',
        },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Check for at least one verified TOTP factor
    const hasVerifiedFactor = data?.factors?.some(
      (factor) => factor.factor_type === 'totp' && factor.status === 'verified',
    );

    if (!hasVerifiedFactor) {
      logger.warn('[MFA] Access denied — no verified MFA factor', {
        request_id: req.requestId,
        user_id: user.id,
        role: user.role,
      });
      res.status(403).json({
        success: false,
        error: {
          code: 'MFA_REQUIRED',
          message: 'Multi-factor authentication is required for your role. Please enroll MFA to continue.',
          mfa_enroll_url: '/settings/security/mfa',
        },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    next();
  } catch (err) {
    logger.error('[MFA] Unexpected error during MFA check', {
      error: err instanceof Error ? err.message : String(err),
      user_id: user.id,
    });
    // Fail closed
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'MFA verification could not be completed.' },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  }
}
