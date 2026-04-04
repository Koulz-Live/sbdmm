-- ============================================================
-- Migration: 001_initial_schema.sql
-- SBDMM Platform — Core Domain Schema
-- ============================================================
--
-- SECURITY DESIGN NOTES:
-- 1. Every tenant-owned table has a tenant_id column.
--    RLS policies enforce tenant isolation at the database level.
-- 2. Row Level Security (RLS) is ENABLED on every table.
--    No table is accessible without an explicit RLS policy.
-- 3. The public schema is used per Supabase convention.
--    Super admin access goes through the service role (bypasses RLS).
--    All service role usage must be audit-logged at the application layer.
-- 4. Timestamps are UTC (timestamptz).
-- 5. Soft delete patterns (deleted_at) are used for audit trail integrity.
-- 6. PII fields are minimised — see comments for GDPR/POPIA notes.
--
-- HUMAN DECISION: Review indexes before production deployment.
-- Add or remove based on your actual query patterns.
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE platform_role AS ENUM (
  'buyer',
  'vendor',
  'logistics_provider',
  'tenant_admin',
  'super_admin'
);

CREATE TYPE tenant_status AS ENUM (
  'pending_verification',
  'active',
  'suspended',
  'terminated'
);

CREATE TYPE tenant_plan AS ENUM (
  'starter',
  'professional',
  'enterprise'
);

CREATE TYPE order_status AS ENUM (
  'draft',
  'pending_quote',
  'quoted',
  'confirmed',
  'in_transit',
  'customs_hold',
  'delivered',
  'disputed',
  'cancelled'
);

CREATE TYPE compliance_status AS ENUM (
  'pending',
  'passed',
  'failed',
  'manual_review'
);

CREATE TYPE compliance_rule_type AS ENUM (
  'kyc',
  'sanctions_check',
  'customs_classification',
  'trade_restriction',
  'esg_threshold',
  'document_required',
  'regional_restriction'
);

CREATE TYPE audit_outcome AS ENUM (
  'success',
  'failure',
  'blocked'
);

-- ─── Tenants ─────────────────────────────────────────────────────────────────
-- The root multi-tenancy table.
-- SECURITY: tenant_id is the partition key for all tenant data.
-- Super admin can see all tenants. Other roles see only their own tenant.
CREATE TABLE IF NOT EXISTS public.tenants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  status          tenant_status NOT NULL DEFAULT 'pending_verification',
  plan            tenant_plan NOT NULL DEFAULT 'starter',
  -- Data sovereignty: region used to enforce data residency rules
  -- HUMAN DECISION: Implement data residency routing based on this field
  region          char(2) NOT NULL,              -- ISO 3166-1 alpha-2
  settings        jsonb NOT NULL DEFAULT '{}',   -- Tenant-level feature flags
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,                   -- Soft delete for compliance
  created_by      uuid,                          -- super_admin user who created this tenant
  CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9-]{3,63}$')
);

-- ─── User Profiles ────────────────────────────────────────────────────────────
-- Extends Supabase auth.users with platform-specific fields.
-- SECURITY: This table holds the authoritative role and tenant assignment.
-- The application ALWAYS reads role from here, not from JWT claims.
--
-- PII NOTE: email is stored in auth.users (Supabase-managed).
-- We only store a display name here. Minimise PII per GDPR/POPIA.
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  full_name       text NOT NULL,
  role            platform_role NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  -- MFA: Supabase handles MFA in auth.users; we track if MFA is required at app level
  mfa_required    boolean NOT NULL DEFAULT false,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  invited_by      uuid REFERENCES public.user_profiles(id)
);

-- ─── Vendor Profiles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendors (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES public.tenants(id),
  user_id                     uuid REFERENCES public.user_profiles(id),
  company_name                text NOT NULL,
  company_registration_number text NOT NULL,
  country_of_registration     char(2) NOT NULL,
  contact_email               text NOT NULL,  -- GDPR/POPIA: ensure data subject rights
  contact_phone               text,
  business_category           text NOT NULL,
  website_url                 text,
  onboarding_status           text NOT NULL DEFAULT 'draft',
  compliance_status           compliance_status NOT NULL DEFAULT 'pending',
  esg_score                   numeric(5, 2),  -- 0.00 to 100.00
  approved_at                 timestamptz,
  approved_by                 uuid REFERENCES public.user_profiles(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid NOT NULL REFERENCES public.user_profiles(id)
);

-- ─── Orders ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES public.tenants(id),
  title                   text NOT NULL,
  status                  order_status NOT NULL DEFAULT 'draft',
  origin_address          text NOT NULL,
  destination_address     text NOT NULL,
  origin_country          char(2) NOT NULL,
  destination_country     char(2) NOT NULL,
  cargo_description       text NOT NULL,
  cargo_weight_kg         numeric(12, 3) NOT NULL,
  cargo_volume_m3         numeric(12, 3),
  required_delivery_date  timestamptz,
  special_instructions    text,
  assigned_provider_id    uuid REFERENCES public.user_profiles(id),
  compliance_status       compliance_status NOT NULL DEFAULT 'pending',
  notes                   text,
  idempotency_key         text UNIQUE,  -- For idempotent creates
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid NOT NULL REFERENCES public.user_profiles(id),
  updated_by              uuid REFERENCES public.user_profiles(id)
);

-- ─── Quotes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES public.tenants(id),
  order_id                uuid NOT NULL REFERENCES public.orders(id),
  provider_id             uuid NOT NULL REFERENCES public.user_profiles(id),
  price_amount            numeric(15, 2) NOT NULL,
  price_currency          char(3) NOT NULL,   -- ISO 4217
  transit_days_estimated  integer NOT NULL,
  valid_until             timestamptz NOT NULL,
  status                  text NOT NULL DEFAULT 'pending', -- pending/accepted/rejected/expired
  route_details           jsonb,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid NOT NULL REFERENCES public.user_profiles(id)
);

-- ─── Route Optimization Requests ─────────────────────────────────────────────
-- Records AI-assisted route optimization requests and their outputs
CREATE TABLE IF NOT EXISTS public.route_optimization_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  order_id        uuid REFERENCES public.orders(id),
  input_data      jsonb NOT NULL,           -- Sanitized input sent to AI
  ai_output       jsonb,                    -- AI response (never executed directly)
  status          text NOT NULL DEFAULT 'pending',
  approved_by     uuid REFERENCES public.user_profiles(id),
  approved_at     timestamptz,
  model_used      text,
  tokens_used     integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL REFERENCES public.user_profiles(id)
);

-- ─── Trade Documents (Metadata Only) ──────────────────────────────────────────
-- SECURITY: We store METADATA only, not document content.
-- Actual files are stored in Supabase Storage with tenant-scoped bucket policies.
-- HUMAN DECISION: Implement virus scanning on all uploaded documents.
CREATE TABLE IF NOT EXISTS public.trade_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id),
  order_id            uuid REFERENCES public.orders(id),
  vendor_id           uuid REFERENCES public.vendors(id),
  document_type       text NOT NULL,     -- e.g., 'bill_of_lading', 'commercial_invoice'
  storage_path        text NOT NULL,     -- Path in Supabase Storage (not a URL)
  original_filename   text NOT NULL,
  file_size_bytes     bigint NOT NULL,
  mime_type           text NOT NULL,
  checksum_sha256     text,              -- For integrity verification
  status              text NOT NULL DEFAULT 'pending_review',
  reviewed_by         uuid REFERENCES public.user_profiles(id),
  reviewed_at         timestamptz,
  expires_at          timestamptz,       -- Document expiry for retention policy
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid NOT NULL REFERENCES public.user_profiles(id)
);

-- ─── Compliance Rules ─────────────────────────────────────────────────────────
-- Platform-level and tenant-level compliance rules.
-- NULL tenant_id = global rule applies to all tenants.
CREATE TABLE IF NOT EXISTS public.compliance_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid REFERENCES public.tenants(id),  -- NULL = global rule
  rule_type             compliance_rule_type NOT NULL,
  name                  text NOT NULL,
  description           text NOT NULL,
  config                jsonb NOT NULL DEFAULT '{}',
  is_active             boolean NOT NULL DEFAULT true,
  applies_to_countries  char(2)[] DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL REFERENCES public.user_profiles(id)
);

-- ─── Compliance Evaluations ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_evaluations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  context_type    text NOT NULL,     -- 'order', 'vendor_onboarding', etc.
  context_id      uuid NOT NULL,
  overall_status  compliance_status NOT NULL,
  check_results   jsonb NOT NULL,
  evaluated_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_by     uuid REFERENCES public.user_profiles(id),
  reviewed_at     timestamptz,
  review_notes    text
);

-- ─── ESG Metadata ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.esg_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  vendor_id       uuid NOT NULL REFERENCES public.vendors(id),
  score           numeric(5, 2) NOT NULL,
  category_scores jsonb NOT NULL DEFAULT '{}',  -- env, social, governance sub-scores
  assessment_date date NOT NULL,
  assessed_by     text,            -- External ESG provider name
  evidence_refs   jsonb DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid NOT NULL REFERENCES public.user_profiles(id)
);

-- ─── API Keys / Integration Registry ─────────────────────────────────────────
-- B2B API access registry. API keys are HASHED before storage.
-- SECURITY: Never store raw API keys. Store only HMAC-SHA256 or bcrypt hash.
CREATE TABLE IF NOT EXISTS public.api_credentials (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id),
  name                  text NOT NULL,
  description           text,
  integration_type      text NOT NULL,
  key_prefix            text NOT NULL,         -- First 8 chars of key for identification
  key_hash              text NOT NULL,         -- HMAC-SHA256 hash of the full key
  allowed_ips           inet[] DEFAULT '{}',
  webhook_url           text,
  rate_limit_per_minute integer NOT NULL DEFAULT 60,
  is_active             boolean NOT NULL DEFAULT true,
  last_used_at          timestamptz,
  expires_at            timestamptz,           -- NULL = never expires
  created_at            timestamptz NOT NULL DEFAULT now(),
  revoked_at            timestamptz,
  created_by            uuid NOT NULL REFERENCES public.user_profiles(id)
);

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  user_id         uuid NOT NULL REFERENCES public.user_profiles(id),
  type            text NOT NULL,
  title           text NOT NULL,
  message         text NOT NULL,
  is_read         boolean NOT NULL DEFAULT false,
  context_type    text,
  context_id      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── Audit Logs ───────────────────────────────────────────────────────────────
-- SECURITY / COMPLIANCE: Append-only audit trail.
-- No UPDATE or DELETE policies should exist on this table.
-- For high-assurance environments, consider WAL archiving or streaming to immutable storage.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,
  actor_id        text NOT NULL,       -- user ID or 'system'
  tenant_id       text NOT NULL,       -- 'system' for platform-level events
  target_type     text,
  target_id       text,
  outcome         audit_outcome NOT NULL DEFAULT 'success',
  details         jsonb,               -- Sanitized — no secrets/PII
  ip_address      inet,
  user_agent      text,
  request_id      text,
  created_at      timestamptz NOT NULL DEFAULT now()
  -- DESIGN: No updated_at — audit records are immutable
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
-- PERFORMANCE + SECURITY: Indexes on tenant_id and status columns
-- support both performant queries and efficient RLS enforcement.

CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_id ON public.user_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);

CREATE INDEX IF NOT EXISTS idx_vendors_tenant_id ON public.vendors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vendors_compliance_status ON public.vendors(compliance_status);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_id ON public.orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON public.orders(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON public.orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_tenant_id ON public.quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_quotes_order_id ON public.quotes(order_id);

CREATE INDEX IF NOT EXISTS idx_compliance_rules_tenant_id ON public.compliance_rules(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_rules_active ON public.compliance_rules(is_active);

CREATE INDEX IF NOT EXISTS idx_compliance_evaluations_context ON public.compliance_evaluations(context_type, context_id);
CREATE INDEX IF NOT EXISTS idx_compliance_evaluations_tenant ON public.compliance_evaluations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_trade_documents_tenant_id ON public.trade_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_trade_documents_order_id ON public.trade_documents(order_id);

CREATE INDEX IF NOT EXISTS idx_api_credentials_tenant_id ON public.api_credentials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_credentials_key_prefix ON public.api_credentials(key_prefix);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON public.audit_logs(request_id) WHERE request_id IS NOT NULL;

-- ─── updated_at Auto-Update Trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_vendors_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_compliance_rules_updated_at
  BEFORE UPDATE ON public.compliance_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
