/**
 * Tenant Override — Super Admin Cross-Tenant Access Governance
 *
 * SECURITY DESIGN:
 * Allows super_admin users to inspect or operate within any tenant's data by
 * providing an X-Tenant-Override request header. This is the ONLY supported
 * mechanism for cross-tenant access by privileged operators.
 *
 * CONTROLS ENFORCED:
 * 1. ONLY super_admin may use this header — all other roles get 403
 * 2. The override value must be a valid UUID
 * 3. The target tenant must exist in the tenants table
 * 4. Every use is audit-logged with the original and overridden tenant IDs,
 *    the HTTP method, and the request path — creating a complete operator trail
 * 5. A no-op if the override value equals the super_admin's own tenant ID
 *
 * USAGE:
 * Call processTenantOverride() at the end of requireAuth, after req.user is set.
 * It returns:
 *   - A string (the validated override tenant ID) if override was applied
 *   - null if no X-Tenant-Override header was present
 *   - false if the override was rejected (response has already been sent)
 *
 * ASSUMPTION: req.user is populated by requireAuth before this is called.
 */

import { Request, Response } from 'express';
import { z } from 'zod';
import { getAdminClient } from '../lib/supabaseAdmin';
import { writeAuditLog } from '../services/auditLog';
import { createChildLogger } from '../lib/logger';
import { ERROR_CODES } from '@sbdmm/shared';

const overrideTenantIdSchema = z.string().uuid('X-Tenant-Override must be a valid UUID');

/**
 * processTenantOverride — Validates and applies the X-Tenant-Override header.
 *
 * Returns:
 *   string  — validated override tenant ID; caller should set req.user.tenant_id
 *   null    — no header present; no action needed
 *   false   — header present but rejected; response was already sent
 */
export async function processTenantOverride(
  req: Request,
  res: Response,
): Promise<string | null | false> {
  const overrideHeader = req.headers['x-tenant-override'];

  // No header — nothing to do
  if (!overrideHeader) return null;

  const log = createChildLogger({ request_id: req.requestId });
  const user = req.user!;

  // SECURITY: Only super_admin may use tenant override
  if (user.role !== 'super_admin') {
    log.warn('[TENANT OVERRIDE] Non-super_admin attempted tenant override', {
      user_id: user.id,
      role: user.role,
      attempted_tenant: overrideHeader,
      path: req.path,
    });
    res.status(403).json({
      success: false,
      error: {
        code: ERROR_CODES.FORBIDDEN,
        message: 'Tenant override requires super_admin role.',
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
    return false;
  }

  // Validate the header value is a well-formed UUID
  const parseResult = overrideTenantIdSchema.safeParse(overrideHeader);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'X-Tenant-Override must be a valid tenant UUID.',
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
    return false;
  }

  const overrideTenantId = parseResult.data;
  const originalTenantId = user.tenant_id;

  // No-op if overriding to own tenant (not an error; just unnecessary)
  if (overrideTenantId === originalTenantId) return null;

  const supabase = getAdminClient();

  // Verify the target tenant exists
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name, status')
    .eq('id', overrideTenantId)
    .single();

  if (tenantError || !tenant) {
    log.warn('[TENANT OVERRIDE] Target tenant not found', {
      admin_id: user.id,
      override_tenant_id: overrideTenantId,
    });
    res.status(404).json({
      success: false,
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: 'Target tenant not found.',
      },
      meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
    });
    return false;
  }

  // AUDIT: Every super_admin tenant override is logged — this is a privileged action
  // that must be reviewable by security and compliance teams
  await writeAuditLog({
    event_type: 'admin.tenant_override',
    actor_id: user.id,
    tenant_id: originalTenantId,
    target_type: 'tenant',
    target_id: overrideTenantId,
    outcome: 'success',
    details: {
      original_tenant_id: originalTenantId,
      override_tenant_id: overrideTenantId,
      override_tenant_name: (tenant as { id: string; name: string; status: string }).name,
      method: req.method,
      path: req.path,
    },
    ip_address: req.ip,
    request_id: req.requestId,
  });

  log.warn('[TENANT OVERRIDE] super_admin overriding tenant context', {
    admin_id: user.id,
    original_tenant_id: originalTenantId,
    override_tenant_id: overrideTenantId,
    method: req.method,
    path: req.path,
  });

  return overrideTenantId;
}
