-- ============================================================
-- Migration 011 — Platform Improvements
-- ============================================================
-- 1. save_count column on vendor_catalogue + auto-increment trigger
-- 2. media_urls column on vendor_catalogue (product images)
-- 3. vendor_ratings table (post-delivery 1–5 star ratings)
-- 4. messages table (per-order buyer↔vendor thread)
-- 5. collection share token on saved_collections
-- ============================================================

-- ── 1. save_count ─────────────────────────────────────────────────────────────

ALTER TABLE vendor_catalogue
  ADD COLUMN IF NOT EXISTS save_count integer NOT NULL DEFAULT 0;

-- Sync existing counts on migration run
UPDATE vendor_catalogue vc
SET save_count = (
  SELECT count(*)
  FROM saved_items si
  WHERE si.catalogue_item_id = vc.id
)
WHERE true;

-- Trigger function: increment / decrement save_count
CREATE OR REPLACE FUNCTION fn_sync_save_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.catalogue_item_id IS NOT NULL THEN
    UPDATE vendor_catalogue
    SET    save_count = save_count + 1
    WHERE  id = NEW.catalogue_item_id;

  ELSIF TG_OP = 'DELETE' AND OLD.catalogue_item_id IS NOT NULL THEN
    UPDATE vendor_catalogue
    SET    save_count = GREATEST(0, save_count - 1)
    WHERE  id = OLD.catalogue_item_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_save_count ON saved_items;
CREATE TRIGGER trg_sync_save_count
AFTER INSERT OR DELETE ON saved_items
FOR EACH ROW EXECUTE FUNCTION fn_sync_save_count();

-- ── 2. media_urls ─────────────────────────────────────────────────────────────

ALTER TABLE vendor_catalogue
  ADD COLUMN IF NOT EXISTS media_urls text[] NOT NULL DEFAULT '{}';

-- ── 3. vendor_ratings ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vendor_ratings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid        NOT NULL REFERENCES vendors(id)   ON DELETE CASCADE,
  order_id    uuid        NOT NULL REFERENCES orders(id)    ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  rated_by    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating      integer     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- One rating per order (buyer can only rate once per completed order)
  UNIQUE (order_id, rated_by)
);

CREATE INDEX IF NOT EXISTS idx_vendor_ratings_vendor_id ON vendor_ratings (vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ratings_tenant_id ON vendor_ratings (tenant_id);

-- RLS
ALTER TABLE vendor_ratings ENABLE ROW LEVEL SECURITY;

-- Buyers can read ratings for their tenant's vendors
CREATE POLICY vendor_ratings_read ON vendor_ratings
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Buyers can insert their own rating
CREATE POLICY vendor_ratings_insert ON vendor_ratings
  FOR INSERT
  WITH CHECK (
    rated_by = auth.uid()
    AND tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- ── 4. messages ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid        NOT NULL REFERENCES orders(id)     ON DELETE CASCADE,
  tenant_id  uuid        NOT NULL REFERENCES tenants(id)    ON DELETE CASCADE,
  sender_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_order_id  ON messages (order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON messages (tenant_id);

-- RLS: tenant-scoped, participants only
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_read ON messages
  FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY messages_insert ON messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );

-- ── 5. collection share token ─────────────────────────────────────────────────

ALTER TABLE saved_collections
  ADD COLUMN IF NOT EXISTS share_token uuid    UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS is_shared   boolean NOT NULL DEFAULT false;

-- Backfill share_token for existing rows that somehow got NULL
UPDATE saved_collections
SET share_token = gen_random_uuid()
WHERE share_token IS NULL;

-- Public read policy for shared collections (no auth required)
CREATE POLICY saved_collections_public_share ON saved_collections
  FOR SELECT
  USING (is_shared = true);
