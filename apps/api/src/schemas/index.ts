/**
 * Zod Validation Middleware + Core Schemas
 *
 * SECURITY: Schema validation is a critical input sanitization layer.
 * It prevents:
 * - Mass assignment attacks (unknown fields are stripped by default)
 * - Type confusion attacks
 * - Unexpected data shapes reaching business logic
 * - Injection via malformed inputs
 *
 * DESIGN: Using Zod's .strict() or .strip() modes deliberately to reject
 * or strip unknown fields. This prevents attackers from injecting
 * extra fields like tenant_id, role, or is_admin.
 *
 * HUMAN DECISION: Choose between .strict() (reject unknown) and .strip() (ignore unknown).
 * For write operations (POST/PUT/PATCH), prefer .strict() to catch client bugs early.
 * For read/filter operations, .strip() is more flexible.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { ERROR_CODES } from '@sbdmm/shared';

// ─── Validation Middleware Factory ────────────────────────────────────────────
type ValidationTarget = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      res.status(400).json({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Request validation failed.',
          // SECURITY: We return field-level errors to help clients — but we do NOT
          // return internal schema structure or server paths
          fields: errors,
        },
        meta: { request_id: req.requestId, timestamp: new Date().toISOString() },
      });
      return;
    }

    // Replace the target with the parsed (sanitized/coerced) value
    // This strips unknown fields and coerces types
    req[target] = result.data as typeof req[typeof target];
    next();
  };
}

function formatZodErrors(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    result[path] = issue.message;
  }
  return result;
}

// ─── Common Field Schemas ─────────────────────────────────────────────────────
const uuidSchema = z.string().uuid('Must be a valid UUID');
const tenantIdSchema = uuidSchema;
const emailSchema = z.string().email().max(255).toLowerCase().trim();
const nameSchema = z.string().min(1).max(255).trim();
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Auth Schemas ─────────────────────────────────────────────────────────────
export const loginSchema = z
  .object({
    email: emailSchema,
    // SECURITY: Password validation is minimal here — Supabase handles auth.
    // We just ensure it's a non-empty string and not excessively long (DoS).
    password: z.string().min(1).max(256),
  })
  .strict(); // Reject any unknown fields

export const inviteUserSchema = z
  .object({
    email: emailSchema,
    full_name: nameSchema,
    role: z.enum(['buyer', 'vendor', 'logistics_provider', 'tenant_admin']),
    // SECURITY: role 'super_admin' is intentionally excluded — super admins are
    // provisioned through a separate, tightly controlled process
  })
  .strict();

// ─── Vendor Onboarding Schemas ────────────────────────────────────────────────
export const vendorOnboardingSchema = z
  .object({
    company_name: nameSchema,
    company_registration_number: z.string().min(1).max(100).trim(),
    country_of_registration: z.string().length(2).toUpperCase(), // ISO 3166-1 alpha-2
    contact_email: emailSchema,
    contact_phone: z.string().max(30).regex(/^\+?[0-9\s\-().]+$/).optional(),
    business_category: z.enum(['freight', 'warehousing', 'customs', 'last_mile', 'freight_forwarding', 'other']),
    website_url: z.string().url().max(500).optional(),
    // SECURITY: We do NOT accept arbitrary file metadata from the client here.
    // Document uploads are handled through a separate secure upload endpoint.
  })
  .strict();

// ─── Logistics Order Schemas ──────────────────────────────────────────────────
export const createOrderSchema = z
  .object({
    title: z.string().min(1).max(500).trim(),
    origin_address: z.string().min(1).max(1000).trim(),
    destination_address: z.string().min(1).max(1000).trim(),
    origin_country: z.string().length(2).toUpperCase(),
    destination_country: z.string().length(2).toUpperCase(),
    cargo_description: z.string().min(1).max(2000).trim(),
    cargo_weight_kg: z.number().positive().max(1_000_000),
    cargo_volume_m3: z.number().positive().max(100_000).optional(),
    required_delivery_date: z.string().datetime({ offset: true }).optional(),
    special_instructions: z.string().max(5000).trim().optional(),
    // SECURITY: Reject any attempt to set tenant_id, status, or pricing from client
  })
  .strict();

export const updateOrderStatusSchema = z
  .object({
    status: z.enum([
      'confirmed', 'in_transit', 'customs_hold', 'delivered', 'disputed', 'cancelled',
    ]),
    notes: z.string().max(2000).trim().optional(),
  })
  .strict();

// ─── Quote Schemas ────────────────────────────────────────────────────────────
export const createQuoteSchema = z
  .object({
    order_id: uuidSchema,
    price_amount: z.number().positive().max(10_000_000),
    price_currency: z.string().length(3).toUpperCase(), // ISO 4217
    transit_days_estimated: z.number().int().positive().max(365),
    valid_until: z.string().datetime({ offset: true }),
    notes: z.string().max(2000).trim().optional(),
    route_details: z.record(z.unknown()).optional(), // Flexible JSON for route metadata
  })
  .strict();

// ─── AI Proxy Request Schema ──────────────────────────────────────────────────
export const aiProxyRequestSchema = z
  .object({
    task: z.enum([
      'route_optimization',
      'risk_assessment',
      'document_summary',
      'compliance_query',
      'esg_analysis',
    ]),
    // SECURITY: We do NOT accept arbitrary messages to send to OpenAI.
    // The backend controls the system prompt. The client only provides structured input.
    input: z.record(z.unknown()).refine(
      (data) => JSON.stringify(data).length <= 10_000,
      { message: 'Input payload too large' },
    ),
    model_preference: z.enum(['gpt-4o', 'gpt-4o-mini']).optional(),
    idempotency_key: z.string().uuid().optional(),
  })
  .strict();

// ─── Compliance Rule Schema ───────────────────────────────────────────────────
export const complianceRuleSchema = z
  .object({
    rule_type: z.enum([
      'kyc', 'sanctions_check', 'customs_classification',
      'trade_restriction', 'esg_threshold', 'document_required', 'regional_restriction',
    ]),
    name: nameSchema,
    description: z.string().max(2000).trim(),
    config: z.record(z.unknown()),
    is_active: z.boolean().default(true),
    applies_to_countries: z.array(z.string().length(2).toUpperCase()).optional(),
  })
  .strict();

// ─── API Key / Integration Schema ─────────────────────────────────────────────
export const createIntegrationSchema = z
  .object({
    name: nameSchema,
    description: z.string().max(1000).trim().optional(),
    integration_type: z.enum(['logistics_api', 'customs_api', 'payment_gateway', 'esg_data', 'internal']),
    allowed_ips: z.array(
      z.string().ip({ version: 'v4' }).or(z.string().ip({ version: 'v6' })),
    ).max(20).optional(),
    webhook_url: z.string().url().max(500).optional(),
    rate_limit_per_minute: z.number().int().min(1).max(10_000).default(60),
  })
  .strict();

// ─── Webhook Verification ─────────────────────────────────────────────────────
export const webhookEventSchema = z.object({
  event_type: z.string().min(1).max(100),
  event_id: z.string().min(1).max(100),
  payload: z.record(z.unknown()),
  timestamp: z.string().datetime({ offset: true }),
});

// ─── Pagination + Filter Schemas ──────────────────────────────────────────────
export { paginationSchema, uuidSchema, emailSchema, nameSchema, tenantIdSchema };
