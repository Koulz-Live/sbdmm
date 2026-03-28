/**
 * Role and Tenant Authorization Middleware
 *
 * SECURITY DESIGN:
 * This is the SECOND gate, applied after authentication.
 * It enforces:
 * 1. Role-based access control (RBAC) — which roles can access which endpoints
 * 2. Tenant isolation — users can only act within their own tenant
 * 3. Resource ownership checks — users can only modify their own resources
 *
 * ZERO TRUST PRINCIPLES:
 * - Authorization is ALWAYS enforced server-side
 * - Never rely on frontend to hide routes — the backend rejects unauthorized requests
 * - Tenant ID is always taken from req.user (verified), never from req.body/params
 *   unless explicitly validated against req.user.tenant_id (IDOR prevention)
 */

import { Request, Response, NextFunction } from 'express';
import { PlatformRole, ERROR_CODES } from '@sbdmm/shared';
import { logger } from '../lib/logger';

/**
 * requireRole — Ensures the authenticated user has one of the permitted roles.
 * Usage: router.get('/admin', requireAuth, requireRole(['tenant_admin', 'super_admin']), handler)
 *
 * SECURITY: super_admin implicitly passes all role checks — they have platform-wide access.
 * If you need to EXCLUDE super_admin from a route, do so explicitly.
 */
export function requireRole(allowedRoles: PlatformRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: ERROR_CODES.UNAUTHORIZED, message: 'Authentication required.' },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // super_admin passes all role checks (they have cross-tenant visibility)
    // SECURITY: This is intentional. Document it. Audit super_admin actions separately.
    if (user.role === 'super_admin' || allowedRoles.includes(user.role)) {
      next();
      return;
    }

    logger.warn('[AUTHZ] Role check failed', {
      request_id: req.requestId,
      user_id: user.id,
      user_role: user.role,
      required_roles: allowedRoles,
      path: req.path,
    });

    res.status(403).json({
      success: false,
      error: {
        code: ERROR_CODES.FORBIDDEN,
        message: 'You do not have permission to perform this action.',
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
  };
}

/**
 * requireTenantMatch — Validates that a resource's tenant_id matches the authenticated user's tenant.
 * Prevents IDOR (Insecure Direct Object Reference) / BOLA attacks.
 *
 * Usage: Call this helper inside route handlers when loading resources by ID.
 * Returns true if access is permitted, false if denied (caller must send 403).
 *
 * Example:
 *   const order = await db.getOrder(orderId);
 *   if (!assertTenantOwnership(req, order.tenant_id, res)) return;
 */
export function assertTenantOwnership(
  req: Request,
  resourceTenantId: string,
  res: Response,
): boolean {
  const user = req.user!;

  // super_admin can access any tenant's resources
  if (user.role === 'super_admin') return true;

  if (user.tenant_id !== resourceTenantId) {
    logger.warn('[AUTHZ] Tenant ownership check failed — possible IDOR attempt', {
      request_id: req.requestId,
      user_id: user.id,
      user_tenant_id: user.tenant_id,
      resource_tenant_id: resourceTenantId,
      path: req.path,
    });
    res.status(403).json({
      success: false,
      error: {
        code: ERROR_CODES.TENANT_MISMATCH,
        message: 'You do not have access to this resource.',
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
    return false;
  }

  return true;
}

/**
 * withTenantContext — Injects the user's tenant_id, userId, and role into res.locals.
 * Use this for list endpoints to ensure tenant scoping on every query.
 *
 * SECURITY: This MUST be called before any database query on tenant-owned resources.
 * Even with RLS enabled, defence-in-depth requires server-side enforcement too.
 */
export function withTenantContext(req: Request, res: Response, next: NextFunction): void {
  if (req.user) {
    res.locals['tenantId'] = req.user.tenant_id;
    res.locals['userId'] = req.user.id;
    res.locals['userRole'] = req.user.role;
  }
  next();
}
