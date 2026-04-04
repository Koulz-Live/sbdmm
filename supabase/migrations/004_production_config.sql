-- ============================================================
-- Migration: 004_production_config.sql
-- SBDMM Platform — Production Environment Configuration
-- ============================================================
--
-- This migration configures:
--   1. Supabase Realtime publication — which tables stream to clients
--   2. Supabase Storage buckets with security policies
--   3. pg_cron job to expire old notifications (optional — requires pg_cron)
--   4. Indexes needed for Realtime performance
--
-- HUMAN DECISION:
-- - pg_cron setup requires the extension to be enabled in your Supabase project
--   settings (Dashboard → Database → Extensions → pg_cron)
-- - Storage bucket names must be unique within your Supabase project
-- - Adjust bucket MIME type allowlist and size limits to your requirements
-- ============================================================

-- ─── 1. Supabase Realtime Publication ────────────────────────────────────────
--
-- Only publish tables that the UI needs to react to in real-time.
-- Avoid publishing audit_logs or api_credentials/integrations (high-volume / sensitive).
--
-- SECURITY: Row-level Realtime filtering is handled by RLS policies.
-- A connected client only receives rows they are permitted to SELECT.

-- Drop and recreate the Supabase realtime publication to control which tables
-- are included. The default `supabase_realtime` publication includes all tables.

DO $$
BEGIN
  -- Only create/modify the publication if we have superuser access (production via migration)
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    -- Remove all tables, then add only the ones we want
    ALTER PUBLICATION supabase_realtime SET TABLE
      public.orders,
      public.notifications,
      public.quotes;
  END IF;
END $$;

-- ─── 2. Supabase Storage — Trade Documents Bucket ────────────────────────────
--
-- HUMAN ACTION REQUIRED — cannot be configured via SQL migration because
-- the migration role does not own storage.objects or storage.buckets.
--
-- Complete these steps in the Supabase Dashboard:
--
-- (a) Create the bucket:
--     Storage → New bucket
--     Name: trade-documents
--     Public: OFF  (private — all access goes through signed URLs)
--     File size limit: 26214400 (25 MB)
--     Allowed MIME types: application/pdf, image/jpeg, image/png, image/tiff
--
-- (b) Add the following RLS policies on storage.objects
--     (Storage → Policies → storage.objects → New policy):
--
--     Policy 1 — SELECT (read):
--       Name: trade_docs_select_own_tenant
--       Expression: bucket_id = 'trade-documents'
--         AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
--
--     Policy 2 — INSERT (upload):
--       Name: trade_docs_insert_own_tenant
--       Expression: bucket_id = 'trade-documents'
--         AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
--         AND auth.uid() IS NOT NULL
--
--     Policy 3 — DELETE:
--       Name: trade_docs_delete_admin
--       Expression: bucket_id = 'trade-documents'
--         AND (storage.foldername(name))[1] = public.get_my_tenant_id()::text
--         AND (public.is_tenant_admin() OR public.is_super_admin())
--
-- The API route (apps/api/src/routes/documents.ts) enforces additional
-- server-side checks (IDOR, file type validation, magic byte check)
-- before calling supabase.storage.from('trade-documents').upload()

-- ─── 3. Notification Cleanup (pg_cron) ───────────────────────────────────────
--
-- HUMAN DECISION: Enable this if pg_cron extension is available.
-- Purge read notifications older than 90 days to keep the table lean.
-- Unread notifications are retained indefinitely (user action required).

/*
SELECT cron.schedule(
  'purge-old-notifications',
  '0 3 * * *',   -- Daily at 03:00 UTC
  $$
    DELETE FROM public.notifications
    WHERE is_read = true
      AND created_at < now() - interval '90 days';
  $$
);
*/

-- ─── 4. Additional Performance Indexes ───────────────────────────────────────
--
-- These supplement the indexes in 001 and support Realtime + common query patterns.

-- Support querying compliance_results by context across all types efficiently
CREATE INDEX IF NOT EXISTS idx_compliance_results_status
  ON public.compliance_results(overall_status)
  WHERE overall_status IN ('pending', 'manual_review');

-- Unread notification count (very common dashboard query)
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_unread
  ON public.notifications(tenant_id, is_read)
  WHERE is_read = false;

-- Quotes pending action (buyer dashboard)
CREATE INDEX IF NOT EXISTS idx_quotes_status_tenant
  ON public.quotes(tenant_id, status)
  WHERE status = 'pending';

-- Orders by compliance status (compliance dashboard)
CREATE INDEX IF NOT EXISTS idx_orders_compliance_status
  ON public.orders(tenant_id, compliance_status)
  WHERE compliance_status IN ('pending', 'manual_review');

-- ─── 5. Function: get_dashboard_stats ────────────────────────────────────────
--
-- Aggregate function used by the /api/v1/dashboard endpoint.
-- Runs as SECURITY DEFINER so it can read across RLS-protected tables
-- using the caller's tenant_id. Returns the DashboardStats shape.

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_tenant_id uuid)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- SECURITY: Validate that the caller belongs to this tenant
  IF public.get_my_tenant_id() != p_tenant_id AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'total_orders',        (SELECT count(*) FROM public.orders WHERE tenant_id = p_tenant_id),
    'pending_orders',      (SELECT count(*) FROM public.orders WHERE tenant_id = p_tenant_id AND status = 'pending_quote'),
    'active_vendors',      (SELECT count(*) FROM public.vendors WHERE tenant_id = p_tenant_id AND onboarding_status = 'approved'),
    'compliance_alerts',   (SELECT count(*) FROM public.compliance_results WHERE tenant_id = p_tenant_id AND overall_status IN ('failed', 'manual_review')),
    'open_quotes',         (SELECT count(*) FROM public.quotes WHERE tenant_id = p_tenant_id AND status = 'pending'),
    'documents_pending',   (SELECT count(*) FROM public.trade_documents WHERE tenant_id = p_tenant_id AND status = 'pending_review')
  ) INTO result;

  RETURN result;
END;
$$;

-- ─── End of migration 004 ─────────────────────────────────────────────────────
