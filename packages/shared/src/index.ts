/**
 * @sbdmm/shared — Platform-wide shared types and constants
 *
 * These types are shared between frontend and backend.
 * SECURITY: Never put secrets, server-only logic, or privileged data here.
 * This package is consumed by both browser and Node.js code.
 */

// ─── Platform Roles ─────────────────────────────────────────────────────────
// POLICY DECISION: Role hierarchy matters. Do NOT change order without
// reviewing all role-based permission checks in the API.
export type PlatformRole =
  | 'buyer'
  | 'vendor'
  | 'logistics_provider'
  | 'tenant_admin'
  | 'super_admin';

export const PLATFORM_ROLES: PlatformRole[] = [
  'buyer',
  'vendor',
  'logistics_provider',
  'tenant_admin',
  'super_admin',
];

// Roles that require elevated security controls (MFA, stricter rate limits, full audit trail)
export const PRIVILEGED_ROLES: PlatformRole[] = ['tenant_admin', 'super_admin'];

// ─── Tenant ──────────────────────────────────────────────────────────────────
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'pending_verification';
  plan: 'starter' | 'professional' | 'enterprise';
  region: string; // ISO 3166-1 alpha-2 country code — used for data sovereignty routing
  created_at: string;
}

// ─── User Profile ────────────────────────────────────────────────────────────
// SECURITY: This is the safe public-facing profile shape.
// Never include password hashes, internal flags, or auth tokens here.
export interface UserProfile {
  id: string;
  tenant_id: string;
  email: string; // Minimise exposure — mask in logs
  full_name: string;
  role: PlatformRole;
  is_active: boolean;
  created_at: string;
}

// ─── API Response Envelope ───────────────────────────────────────────────────
// Consistent API response shape for all endpoints.
// SECURITY: error field MUST never contain stack traces or internal paths.
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string; // Human-readable, safe for client
    // 'details' intentionally omitted from public type — only in server logs
  };
  meta?: {
    request_id: string;
    timestamp: string;
    pagination?: PaginationMeta;
  };
}

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

// ─── Audit Event Types ───────────────────────────────────────────────────────
export type AuditEventType =
  | 'user.login'
  | 'user.logout'
  | 'user.mfa_challenge'
  | 'user.password_reset'
  | 'tenant.created'
  | 'tenant.suspended'
  | 'tenant.settings_updated'
  | 'vendor.onboarding_started'
  | 'vendor.onboarding_approved'
  | 'vendor.onboarding_rejected'
  | 'order.created'
  | 'order.status_changed'
  | 'order.cancelled'
  | 'quote.created'
  | 'quote.accepted'
  | 'quote.rejected'
  | 'compliance.check_passed'
  | 'compliance.check_failed'
  | 'compliance.rule_updated'
  | 'document.uploaded'
  | 'document.deleted'
  | 'api_key.created'
  | 'api_key.revoked'
  | 'ai.request_made'
  | 'ai.high_risk_action_requested'
  | 'ai.human_approval_required'
  | 'webhook.received'
  | 'webhook.processed'
  | 'admin.role_assigned'
  | 'admin.user_suspended'
  | 'admin.super_action';

// ─── Logistics Order ─────────────────────────────────────────────────────────
export type OrderStatus =
  | 'draft'
  | 'pending_quote'
  | 'quoted'
  | 'confirmed'
  | 'in_transit'
  | 'customs_hold'
  | 'delivered'
  | 'disputed'
  | 'cancelled';

// ─── Order Domain Object ─────────────────────────────────────────────────────
// Lightweight read model — safe to pass to the frontend.
export interface Order {
  id: string;
  tenant_id: string;
  reference_number: string;
  status: OrderStatus;
  origin_location: string;
  destination_location: string;
  cargo_type: string;
  estimated_weight_kg: number;
  estimated_volume_cbm: number | null;
  special_requirements: string | null;
  requested_delivery_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Vendor ──────────────────────────────────────────────────────────────────
export type VendorStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type BusinessCategory =
  | 'freight'
  | 'warehousing'
  | 'customs'
  | 'last_mile'
  | 'freight_forwarding'
  | 'other';

export interface Vendor {
  id: string;
  tenant_id: string;
  company_name: string;
  company_registration_number: string;
  country_of_registration: string;
  contact_email: string;
  contact_phone: string | null;
  business_category: BusinessCategory;
  website_url: string | null;
  status: VendorStatus;
  compliance_status: ComplianceStatus;
  onboarded_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Quote ────────────────────────────────────────────────────────────────────
export type QuoteStatus = 'pending' | 'accepted' | 'rejected' | 'expired' | 'withdrawn';

export interface Quote {
  id: string;
  tenant_id: string;
  order_id: string;
  vendor_id: string;
  price_amount: number;
  price_currency: string;
  transit_days_estimated: number;
  valid_until: string;
  notes: string | null;
  route_details: Record<string, unknown> | null;
  status: QuoteStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Document ─────────────────────────────────────────────────────────────────
export type DocumentType =
  | 'bill_of_lading'
  | 'commercial_invoice'
  | 'packing_list'
  | 'certificate_of_origin'
  | 'customs_declaration'
  | 'insurance_certificate'
  | 'dangerous_goods_declaration'
  | 'phytosanitary_certificate'
  | 'other';

export interface TradeDocument {
  id: string;
  tenant_id: string;
  order_id: string | null;
  vendor_id: string | null;
  document_type: DocumentType;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  storage_path: string;       // Supabase storage path — NEVER a public URL
  uploaded_by: string;
  created_at: string;
}

// ─── Integration / API Key ────────────────────────────────────────────────────
export type IntegrationStatus = 'active' | 'disabled' | 'revoked';
export type IntegrationType =
  | 'logistics_api'
  | 'customs_api'
  | 'payment_gateway'
  | 'esg_data'
  | 'internal';

export interface Integration {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  integration_type: IntegrationType;
  key_prefix: string;         // First 8 chars of key for identification — never the full key
  status: IntegrationStatus;
  rate_limit_per_minute: number;
  allowed_ips: string[] | null;
  webhook_url: string | null;
  created_by: string;
  last_used_at: string | null;
  created_at: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────
export type NotificationType =
  | 'order_status_changed'
  | 'quote_received'
  | 'quote_accepted'
  | 'compliance_alert'
  | 'document_required'
  | 'mfa_required'
  | 'system_alert';

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  is_read: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export interface DashboardStats {
  total_orders: number;
  pending_orders: number;
  active_vendors: number;
  compliance_alerts: number;
  open_quotes: number;
  documents_pending: number;
}

// ─── MFA Status ───────────────────────────────────────────────────────────────
export interface MfaStatus {
  enrolled: boolean;
  required: boolean;          // true if user's role mandates MFA
  factors: MfaFactor[];
}

export interface MfaFactor {
  id: string;
  factor_type: 'totp' | 'phone';
  status: 'verified' | 'unverified';
  created_at: string;
}

// ─── Compliance ──────────────────────────────────────────────────────────────
export type ComplianceStatus = 'pending' | 'passed' | 'failed' | 'manual_review';

export type ComplianceRuleType =
  | 'kyc'
  | 'sanctions_check'
  | 'customs_classification'
  | 'trade_restriction'
  | 'esg_threshold'
  | 'document_required'
  | 'regional_restriction';

export interface ComplianceResult {
  id: string;
  tenant_id: string;
  context_type: 'order' | 'vendor_onboarding' | 'document_upload' | 'quote';
  context_id: string;
  overall_status: ComplianceStatus;
  blocked: boolean;
  requires_manual_review: boolean;
  checks: ComplianceCheckDetail[];
  evaluated_at: string;
}

export interface ComplianceCheckDetail {
  rule_id: string;
  rule_type: ComplianceRuleType;
  rule_name: string;
  status: ComplianceStatus;
  reason: string | null;
  requires_manual_review: boolean;
}

// ─── Admin ────────────────────────────────────────────────────────────────────
export interface TenantSummary extends Tenant {
  user_count: number;
  order_count: number;
  vendor_count: number;
  last_activity_at: string | null;
}

// ─── Error Codes ─────────────────────────────────────────────────────────────
// Standardised error codes — never expose internal codes to clients without review
export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  COMPLIANCE_BLOCK: 'COMPLIANCE_BLOCK',
  AI_POLICY_BLOCK: 'AI_POLICY_BLOCK',
  INTERNAL_ERROR: 'INTERNAL_ERROR', // Generic — real error logged server-side only
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
