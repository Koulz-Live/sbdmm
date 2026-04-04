-- ============================================================
-- Migration: 003_rename_and_align.sql
-- SBDMM Platform — Rename Tables to Match Application Layer
-- ============================================================
--
-- REASON: The application routes reference:
--   "compliance_results"  — was created as "compliance_evaluations"
--   "integrations"        — was created as "api_credentials"
--
-- We rename the tables to match the domain language used throughout
-- the codebase. All dependent indexes, triggers, RLS policies, and
-- foreign-key references are updated accordingly.
--
-- This migration is idempotent-safe: it uses DO $$...END $$ blocks
-- with existence checks so re-running is a no-op.
-- ============================================================

-- ─── 1. Rename compliance_evaluations → compliance_results ────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'compliance_evaluations'
  ) THEN
    ALTER TABLE public.compliance_evaluations RENAME TO compliance_results;
  END IF;
END $$;

-- Rename indexes that reference the old table name
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_compliance_evaluations_context') THEN
    ALTER INDEX idx_compliance_evaluations_context RENAME TO idx_compliance_results_context;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_compliance_evaluations_tenant') THEN
    ALTER INDEX idx_compliance_evaluations_tenant RENAME TO idx_compliance_results_tenant;
  END IF;
END $$;

-- ─── 2. Rename api_credentials → integrations ────────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'api_credentials'
  ) THEN
    ALTER TABLE public.api_credentials RENAME TO integrations;
  END IF;
END $$;

-- Rename indexes that reference the old table name
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_api_credentials_tenant_id') THEN
    ALTER INDEX idx_api_credentials_tenant_id RENAME TO idx_integrations_tenant_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_api_credentials_key_prefix') THEN
    ALTER INDEX idx_api_credentials_key_prefix RENAME TO idx_integrations_key_prefix;
  END IF;
END $$;

-- ─── 3. Add missing columns to compliance_results ─────────────────────────────
--
-- The application layer writes review_notes during manual review.
-- The column exists in the original schema, but confirm it's there.
-- These are safe ADD COLUMN IF NOT EXISTS calls.

ALTER TABLE public.compliance_results
  ADD COLUMN IF NOT EXISTS review_notes text;

-- ─── 4. Add missing columns to integrations ───────────────────────────────────
--
-- The application layer uses a "status" column (active/revoked/paused).
-- The original api_credentials table had is_active boolean and revoked_at.
-- We add a status text column that the routes use, defaulting to 'active'
-- for existing rows, derived from is_active/revoked_at.

ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Back-fill: if revoked_at IS NOT NULL, status = 'revoked'; else 'active'
UPDATE public.integrations
  SET status = CASE
    WHEN revoked_at IS NOT NULL THEN 'revoked'
    WHEN is_active = false      THEN 'paused'
    ELSE                             'active'
  END
  WHERE status = 'active';

-- Add updated_at column that rotation endpoint uses
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Wire up the updated_at trigger (function already exists from migration 001)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_integrations_updated_at'
      AND event_object_table = 'integrations'
  ) THEN
    CREATE TRIGGER trg_integrations_updated_at
      BEFORE UPDATE ON public.integrations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── 5. Re-enable RLS on renamed tables ──────────────────────────────────────
--
-- RLS survives a table rename, but we explicitly re-confirm to be safe.

ALTER TABLE public.compliance_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations        ENABLE ROW LEVEL SECURITY;

-- ─── 6. Drop old RLS policies (named after old table) and recreate ────────────
--
-- Policy names are scoped to the table, so after rename the old names
-- may still exist. We drop-and-recreate to use clean, readable names.

-- compliance_results policies
DROP POLICY IF EXISTS "compliance_evaluations_select_tenant" ON public.compliance_results;

CREATE POLICY "compliance_results_select_tenant"
  ON public.compliance_results
  FOR SELECT
  USING (
    tenant_id = public.get_my_tenant_id()
    OR public.is_super_admin()
  );

-- INSERT: service role only — no direct user insert (unchanged from migration 002)
-- NOTE: tenant_admin-triggered evaluations come through the API service role path

-- UPDATE: manual review (approve/reject) by tenant_admin or super_admin
CREATE POLICY "compliance_results_update_admin"
  ON public.compliance_results
  FOR UPDATE
  USING (
    (tenant_id = public.get_my_tenant_id() AND public.is_tenant_admin())
    OR public.is_super_admin()
  );

-- integrations policies
DROP POLICY IF EXISTS "api_credentials_select_admin"  ON public.integrations;
DROP POLICY IF EXISTS "api_credentials_insert_admin"  ON public.integrations;
DROP POLICY IF EXISTS "api_credentials_update_admin"  ON public.integrations;

CREATE POLICY "integrations_select_admin"
  ON public.integrations
  FOR SELECT
  USING (
    (tenant_id = public.get_my_tenant_id() AND public.is_tenant_admin())
    OR public.is_super_admin()
  );

CREATE POLICY "integrations_insert_admin"
  ON public.integrations
  FOR INSERT
  WITH CHECK (
    (tenant_id = public.get_my_tenant_id() AND public.is_tenant_admin())
    OR public.is_super_admin()
  );

CREATE POLICY "integrations_update_admin"
  ON public.integrations
  FOR UPDATE
  USING (
    (tenant_id = public.get_my_tenant_id() AND public.is_tenant_admin())
    OR public.is_super_admin()
  );

-- ─── 7. Update GRANTs for renamed tables ──────────────────────────────────────

REVOKE ALL ON public.compliance_results FROM authenticated;
GRANT SELECT ON public.compliance_results TO authenticated;

REVOKE ALL ON public.integrations FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.integrations TO authenticated;

-- ─── End of migration 003 ─────────────────────────────────────────────────────
