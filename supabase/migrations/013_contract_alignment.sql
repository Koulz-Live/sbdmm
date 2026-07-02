-- ============================================================
-- Migration: 013_contract_alignment.sql
-- SBDMM Platform — Align trade_documents Schema with Application Layer
-- ============================================================
--
-- REASON: The application routes reference the following column names
-- in trade_documents which differ from the original schema in 001:
--
--   original_filename  → file_name      (documents route INSERT + SELECT)
--   created_by         → uploaded_by    (documents route INSERT + SELECT)
--   status             → review_status  (documents route INSERT; avoids
--                                        collision with generic 'status' usage)
--
-- NOTE: compliance_evaluations → compliance_results and
--       api_credentials → integrations were already handled in
--       migration 003_rename_and_align.sql.
--
-- This migration is idempotent-safe: column renames use DO $$ blocks
-- with information_schema existence checks.
-- ============================================================

-- ─── 1. Rename original_filename → file_name ─────────────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'trade_documents'
      AND column_name  = 'original_filename'
  ) THEN
    ALTER TABLE public.trade_documents RENAME COLUMN original_filename TO file_name;
  END IF;
END $$;

-- ─── 2. Rename created_by → uploaded_by ──────────────────────────────────────
--
-- 'uploaded_by' is semantically accurate for documents and avoids confusion
-- with generic audit columns. The FK constraint survives a column rename.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'trade_documents'
      AND column_name  = 'created_by'
  ) THEN
    ALTER TABLE public.trade_documents RENAME COLUMN created_by TO uploaded_by;
  END IF;
END $$;

-- ─── 3. Rename status → review_status ────────────────────────────────────────
--
-- 'review_status' clarifies that this tracks the document review workflow
-- state (pending_review, approved, rejected) rather than a generic entity
-- lifecycle status, which is the pattern used on other tables.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'trade_documents'
      AND column_name  = 'status'
  ) THEN
    ALTER TABLE public.trade_documents RENAME COLUMN status TO review_status;
  END IF;
END $$;

-- ─── 4. Update column index names to reflect new names ───────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_trade_documents_status') THEN
    ALTER INDEX idx_trade_documents_status RENAME TO idx_trade_documents_review_status;
  END IF;
END $$;

-- ─── 5. Update RLS policy comment block (non-breaking) ───────────────────────
--
-- RLS policies reference column names only in their USING / WITH CHECK
-- expressions. The trade_documents policies in 002 and 007 do not filter
-- on status/created_by directly, so no policy bodies need changing.
-- Confirm RLS is still enabled after rename (rename preserves RLS state,
-- but we re-assert for safety).

ALTER TABLE public.trade_documents ENABLE ROW LEVEL SECURITY;

-- ─── End of migration 013 ────────────────────────────────────────────────────
