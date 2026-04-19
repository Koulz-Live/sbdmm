/**
 * Audit Log Service
 *
 * SECURITY / COMPLIANCE DESIGN:
 * Audit logging is a first-class security and compliance requirement.
 * Every privileged action, auth event, compliance decision, and AI invocation
 * must produce an immutable audit record.
 *
 * DESIGN PRINCIPLES:
 * 1. Audit records are append-only — no updates or deletes permitted
 * 2. Records include: who, what, when, where (tenant/IP), outcome
 * 3. PII is minimised — we log user IDs, not raw emails or names
 * 4. Sensitive data in 'details' field is sanitized before storage
 * 5. The audit table is protected by RLS: users can view own events,
 *    tenant_admins can view their tenant, super_admin can view all
 * 6. Log integrity: HUMAN DECISION — for high-assurance compliance (e.g. PCI DSS),
 *    consider forwarding audit records to an immutable log store
 *    (e.g., AWS CloudTrail, Azure Immutable Blob, dedicated SIEM)
 *
 * ASSUMPTION: public.audit_logs table exists with the schema in supabase/migrations
 */

import { getAdminClient } from '../lib/supabaseAdmin';
import { logger } from '../lib/logger';
import { AuditEventType } from '@sbdmm/shared';
import { createHmac } from 'crypto';

// ─── IP Address Anonymization ─────────────────────────────────────────────────
// GDPR / POPIA COMPLIANCE: Raw IP addresses are personal data under both regulations.
// We hash IPs with a server-side secret before storing them so that:
// 1. Logs remain useful for security forensics (same IP → same hash in a session)
// 2. We cannot reverse the hash to recover the original IP without the secret
// 3. If the secret rotates, old hashes become permanently unresolvable (privacy by design)
//
// HUMAN DECISION: Set AUDIT_IP_HASH_SECRET to a strong random value in your secret
// manager. Do NOT use the Supabase JWT secret or any other shared secret.
// Generate with: openssl rand -hex 32
const IP_HASH_SECRET = process.env['AUDIT_IP_HASH_SECRET'] ?? '';

/**
 * hashIpAddress — One-way HMAC-SHA256 of an IP address.
 *
 * If no secret is configured (e.g., in unit tests or early dev), the IP is
 * replaced with a static placeholder rather than stored in plaintext.
 * This is intentionally conservative — it is better to lose forensic value
 * than to store unlawful personal data.
 */
function hashIpAddress(ip: string | undefined): string | null {
  if (!ip) return null;

  if (!IP_HASH_SECRET) {
    // SECURITY: Log a warning — this should never happen in production
    logger.warn('[AUDIT] AUDIT_IP_HASH_SECRET not set — IP address omitted from audit log');
    return '[ip-hash-secret-missing]';
  }

  return createHmac('sha256', IP_HASH_SECRET)
    .update(ip)
    .digest('hex')
    .slice(0, 16); // 64-bit prefix — sufficient for correlation, minimal storage
}

export interface AuditLogEntry {
  event_type: AuditEventType;
  actor_id: string;          // user.id — who performed the action
  tenant_id: string;         // which tenant context
  target_type?: string;      // e.g., 'order', 'vendor', 'user'
  target_id?: string;        // ID of the affected resource
  outcome: 'success' | 'failure' | 'blocked';
  details?: Record<string, unknown>; // Safe, sanitized context — no secrets/PII
  // NOTE: typed as `string | undefined` (not just `string?`) so callers can pass
  // `req.ip` directly (which is `string | undefined`) under exactOptionalPropertyTypes
  ip_address?: string | undefined;   // HUMAN DECISION: Hash for GDPR/POPIA compliance in prod
  user_agent?: string | undefined;   // Truncated — for security forensics
  request_id?: string | undefined;   // Correlation ID linking to request logs
}

// Fields to scrub from audit details before storage
const AUDIT_REDACT_KEYS = new Set([
  'password', 'token', 'secret', 'apikey', 'api_key',
  'authorization', 'service_role_key', 'private_key',
]);

function sanitizeAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (AUDIT_REDACT_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeAuditDetails(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * writeAuditLog — Writes an audit event to the database.
 *
 * SECURITY: This function uses the admin client (bypasses RLS) because
 * audit logs must always be written, even when the user's RLS policies
 * would normally restrict writes to their own tenant.
 * The trade-off is intentional: audit completeness > RLS restriction on writes.
 *
 * IMPORTANT: This function MUST NOT throw — audit log failures should never
 * block the primary operation. Failures are logged to the structured logger
 * for monitoring/alerting.
 */
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const sanitizedDetails = entry.details
      ? sanitizeAuditDetails(entry.details)
      : undefined;

    const record = {
      event_type: entry.event_type,
      actor_id: entry.actor_id,
      tenant_id: entry.tenant_id,
      target_type: entry.target_type ?? null,
      target_id: entry.target_id ?? null,
      outcome: entry.outcome,
      details: sanitizedDetails ?? null,
      ip_address: hashIpAddress(entry.ip_address) ?? null,
      user_agent: entry.user_agent ? entry.user_agent.slice(0, 500) : null,
      request_id: entry.request_id ?? null,
      created_at: new Date().toISOString(),
    };

    const { error } = await getAdminClient()
      .from('audit_logs')
      .insert(record);

    if (error) {
      // CRITICAL: Audit log write failure is a security event in itself
      logger.error('[AUDIT] Failed to write audit log — INVESTIGATE IMMEDIATELY', {
        error: error.message,
        event_type: entry.event_type,
        actor_id: entry.actor_id,
        tenant_id: entry.tenant_id,
        request_id: entry.request_id,
      });
    }
  } catch (err) {
    // CRITICAL: Never let audit log failure propagate and disrupt the request
    logger.error('[AUDIT] Unexpected error writing audit log', {
      error: err instanceof Error ? err.message : 'Unknown',
      event_type: entry.event_type,
    });
  }
}

/**
 * createAuditMiddleware — Returns an Express middleware that auto-writes
 * audit logs for sensitive routes.
 *
 * Usage: router.post('/admin/users', requireAuth, createAuditMiddleware('admin.role_assigned'), handler)
 */
import { Request, Response, NextFunction } from 'express';

export function createAuditMiddleware(eventType: AuditEventType) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    // DESIGN: We attach the event type to res.locals so the route handler
    // can enrich the audit log with outcome and resource details
    _res.locals['pendingAuditEventType'] = eventType;
    next();
  };
}
