-- ============================================================
-- Migration: 009_audit_intelligence.sql
-- SBDMM Platform — Comprehensive Audit Intelligence Layer
-- ============================================================
--
-- SECURITY DESIGN NOTES:
-- 1. ip_blocklist is append-soft-delete — never hard-deleted for audit trail
-- 2. page_navigation_logs is high-volume; partitioning recommended in prod
-- 3. Geolocation data is stored as enriched fields, NOT looked up at insert time
--    (geo-enrichment happens asynchronously at the API layer)
-- 4. All tables have RLS enabled; only service role (admin API) can insert
-- 5. session_id in navigation logs links to auth sessions — not stored raw,
--    hashed with SHA-256 for privacy (GDPR/POPIA compliance)
-- 6. ip_address stored as text (not inet) in blocklist to allow CIDR ranges
-- ============================================================

-- ─── Extend audit_logs with additional columns ────────────────────────────────
-- Add session tracking and page context to existing audit log entries
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS session_id   text,            -- Hashed session reference
  ADD COLUMN IF NOT EXISTS page_path    text,            -- Page URL where event occurred
  ADD COLUMN IF NOT EXISTS geo_country  text,            -- ISO-3166-1 alpha-2 (enriched async)
  ADD COLUMN IF NOT EXISTS geo_city     text,            -- City name (enriched async)
  ADD COLUMN IF NOT EXISTS geo_isp      text;            -- ISP / org name (enriched async)

-- Index new columns for filter performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id   ON public.audit_logs(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_page_path    ON public.audit_logs(page_path)  WHERE page_path  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_geo_country  ON public.audit_logs(geo_country) WHERE geo_country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address   ON public.audit_logs(ip_address);

-- ─── IP Blocklist ─────────────────────────────────────────────────────────────
-- Stores blocked IP addresses and CIDR ranges.
-- SECURITY: The API middleware checks this table before forwarding any request.
-- Soft-delete pattern keeps blocked history for security forensics.
CREATE TABLE IF NOT EXISTS public.ip_blocklist (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address   text        NOT NULL,                    -- IPv4/IPv6 or CIDR (e.g., 192.168.1.0/24)
  reason       text        NOT NULL,                    -- Human-readable reason for blocking
  blocked_by   text        NOT NULL,                    -- super_admin user ID
  tenant_id    text        NOT NULL,                    -- tenant context of the blocking admin
  is_active    boolean     NOT NULL DEFAULT true,       -- false = unblocked (never hard-deleted)
  unblocked_by text,                                    -- user ID that unblocked
  unblocked_at timestamptz,
  expires_at   timestamptz,                             -- NULL = permanent block
  geo_country  text,                                    -- Country of origin (enriched)
  geo_city     text,
  geo_isp      text,
  hit_count    integer     NOT NULL DEFAULT 0,          -- Times this IP attempted access after blocking
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ip_blocklist ENABLE ROW LEVEL SECURITY;

-- Only service role (admin API) can read/write; no user-level access
CREATE POLICY "service_role_only_ip_blocklist"
  ON public.ip_blocklist
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_ip_blocklist_ip        ON public.ip_blocklist(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_blocklist_active    ON public.ip_blocklist(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ip_blocklist_created   ON public.ip_blocklist(created_at DESC);

-- Prevent duplicate active blocks for the same IP
CREATE UNIQUE INDEX IF NOT EXISTS uq_ip_blocklist_active_ip
  ON public.ip_blocklist(ip_address)
  WHERE is_active = true;

-- ─── Page Navigation Logs ─────────────────────────────────────────────────────
-- Lightweight browser-side navigation telemetry — sent from frontend on each route change.
-- PRIVACY: No content is captured — only page path, duration, and session context.
-- GDPR/POPIA: user_id is the UUID reference, not PII. ip_address is processed as described above.
CREATE TABLE IF NOT EXISTS public.page_navigation_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text        NOT NULL,                  -- user_profiles.id
  tenant_id       text        NOT NULL,
  session_id      text,                                  -- Hashed browser session ID
  page_path       text        NOT NULL,                  -- e.g., '/dashboard', '/orders/abc'
  referrer_path   text,                                  -- Previous page (SPA navigation)
  duration_ms     integer,                               -- Time spent on previous page (ms)
  ip_address      text,
  user_agent      text,                                  -- Truncated to 500 chars
  geo_country     text,
  geo_city        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.page_navigation_logs ENABLE ROW LEVEL SECURITY;

-- Users can INSERT their own navigation events (frontend SDK sends these)
CREATE POLICY "users_insert_own_navigation"
  ON public.page_navigation_logs
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id);

-- Service role can read all (for admin dashboard)
CREATE POLICY "service_role_read_navigation"
  ON public.page_navigation_logs
  FOR SELECT
  USING (false); -- blocked for regular users; service role bypasses RLS

CREATE INDEX IF NOT EXISTS idx_page_nav_user_id   ON public.page_navigation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_page_nav_tenant_id ON public.page_navigation_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_page_nav_created   ON public.page_navigation_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_nav_page_path ON public.page_navigation_logs(page_path);

-- ─── AI Usage Tracking ────────────────────────────────────────────────────────
-- Dedicated table for AI request tracking with token and cost accounting.
-- Linked to audit_logs via request_id for full correlation.
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           text        NOT NULL,
  tenant_id         text        NOT NULL,
  request_id        text,                                -- Correlates to audit_logs.request_id
  model             text        NOT NULL,               -- e.g., 'gpt-4o', 'gpt-4o-mini'
  prompt_tokens     integer     NOT NULL DEFAULT 0,
  completion_tokens integer     NOT NULL DEFAULT 0,
  total_tokens      integer     NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10,6),                     -- Based on OpenAI pricing at time of request
  feature           text,                               -- e.g., 'route_optimization', 'compliance_check'
  outcome           text        NOT NULL DEFAULT 'success', -- 'success' | 'error' | 'blocked'
  latency_ms        integer,
  ip_address        text,
  page_path         text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_ai_usage"
  ON public.ai_usage_logs
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id   ON public.ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_id ON public.ai_usage_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created   ON public.ai_usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model     ON public.ai_usage_logs(model);

-- ─── updated_at triggers ──────────────────────────────────────────────────────
-- Re-use the existing set_updated_at() function from migration 001

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_ip_blocklist_updated_at'
      AND tgrelid = 'public.ip_blocklist'::regclass
  ) THEN
    CREATE TRIGGER trg_ip_blocklist_updated_at
      BEFORE UPDATE ON public.ip_blocklist
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
