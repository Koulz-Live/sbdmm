/**
 * Authentication Middleware
 *
 * SECURITY DESIGN:
 * This middleware is the FIRST authorization gate on every protected route.
 * It verifies the Supabase JWT, extracts the user's identity, and attaches
 * the verified user context to the request object.
 *
 * ZERO TRUST PRINCIPLES ENFORCED HERE:
 * 1. Every request to a protected route is verified — no implicit trust
 * 2. The JWT is verified against Supabase — we do not trust the payload alone
 * 3. User is re-fetched from Supabase to ensure the account is still active
 * 4. Tenant ID is extracted from the verified token, not from request headers
 *    (headers can be spoofed; JWT claims cannot if the signature is valid)
 * 5. Role is loaded from the database, not trusted from the JWT claim alone
 *
 * ASSUMPTION: Users have a corresponding row in public.user_profiles with
 * tenant_id and role set. This is created during user onboarding.
 */

import { Request, Response, NextFunction } from 'express';
import { getAdminClient } from '../lib/supabaseAdmin';
import { logger, createChildLogger } from '../lib/logger';
import { PlatformRole, PLATFORM_ROLES, ERROR_CODES } from '@sbdmm/shared';

// Extend Express Request with our authenticated user context
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export interface AuthenticatedUser {
  id: string;           // Supabase auth user ID
  email: string;        // From Supabase auth
  tenant_id: string;    // From user_profiles table — authoritative
  role: PlatformRole;   // From user_profiles table — authoritative
  is_active: boolean;
}

/**
 * requireAuth — Verifies the JWT from Authorization header.
 * Attaches verified user context to req.user.
 * Rejects with 401 if token is missing, invalid, or expired.
 * Rejects with 403 if user account is suspended.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const log = createChildLogger({ request_id: req.requestId });

  // Extract bearer token from Authorization header
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: ERROR_CODES.UNAUTHORIZED, message: 'Authentication required.' },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
    return;
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  try {
    const supabase = getAdminClient();

    // Verify JWT with Supabase — this validates signature, expiry, and issuer
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      log.warn('[AUTH] Token verification failed', { error: authError?.message });
      res.status(401).json({
        success: false,
        error: { code: ERROR_CODES.UNAUTHORIZED, message: 'Invalid or expired token.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Load the authoritative user profile from the database
    // SECURITY: We do NOT trust role/tenant from the JWT claim. We read from DB.
    // This means role changes and account suspensions take effect immediately.
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, tenant_id, role, is_active')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      log.warn('[AUTH] User profile not found', { user_id: user.id });
      res.status(401).json({
        success: false,
        error: { code: ERROR_CODES.UNAUTHORIZED, message: 'User account not configured.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // SECURITY: Reject suspended accounts immediately
    if (!profile.is_active) {
      log.warn('[AUTH] Suspended account attempted access', { user_id: user.id });
      res.status(403).json({
        success: false,
        error: { code: ERROR_CODES.FORBIDDEN, message: 'Account is suspended.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // SECURITY: Validate the role value from DB against known roles (defence in depth)
    if (!PLATFORM_ROLES.includes(profile.role as PlatformRole)) {
      log.error('[AUTH] Unknown role found in user profile', {
        user_id: user.id,
        role: profile.role,
      });
      res.status(403).json({
        success: false,
        error: { code: ERROR_CODES.FORBIDDEN, message: 'Invalid role configuration.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Attach verified context to request — downstream middleware/handlers use this
    req.user = {
      id: user.id,
      email: user.email ?? '',
      tenant_id: profile.tenant_id as string,
      role: profile.role as PlatformRole,
      is_active: profile.is_active as boolean,
    };

    next();
  } catch (err) {
    // SECURITY: Log internal error details server-side, never expose to client
    log.error('[AUTH] Unexpected error during authentication', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    res.status(500).json({
      success: false,
      error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'Authentication service error.' },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  }
}

/**
 * requireSuperAdmin — Ensures the authenticated user is a super_admin.
 * MUST be chained AFTER requireAuth.
 * SECURITY: Super admin routes are the highest privilege — treat with extreme care.
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'super_admin') {
    logger.warn('[AUTH] Non-super_admin attempted super_admin route', {
      user_id: req.user?.id,
      role: req.user?.role,
      path: req.path,
    });
    res.status(403).json({
      success: false,
      error: { code: ERROR_CODES.FORBIDDEN, message: 'Super admin access required.' },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
    return;
  }
  next();
}
