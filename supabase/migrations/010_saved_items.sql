-- ============================================================
-- Migration: 010_saved_items.sql
-- SBDMM Platform — User Saved Items / Collections (Archive)
-- ============================================================
--
-- PURPOSE:
--   Allows any authenticated user to bookmark catalogue items from the
--   Home feed into personal named collections (boards), similar to
--   Pinterest boards. Each collection is private to its owner.
--
-- SECURITY DESIGN:
--   1. RLS enforces strict per-user ownership — no row is visible to
--      anyone except the creating user and the service role.
--   2. tenant_id is stored on both tables for future cross-tenant isolation
--      but ownership is enforced via user_id (auth.uid()).
--   3. No foreign-key to vendor_catalogue on saved_items intentionally —
--      catalogue items can be deleted by vendors; saved items become
--      "orphaned" gracefully (we keep the snapshot data).
--   4. collection_id carries ON DELETE CASCADE so removing a collection
--      removes all its saved items atomically.
-- ============================================================

-- ─── saved_collections — user's named boards ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.saved_collections (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   uuid          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text          NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description text                   CHECK (char_length(description) <= 500),
  cover_gradient text,               -- cached gradient string from the latest saved item
  item_count  integer       NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

-- ─── saved_items — items saved into a collection ─────────────────────────────
-- Stores a snapshot of the item at save-time so cards still render
-- even if the vendor removes the listing.

CREATE TABLE IF NOT EXISTS public.saved_items (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id         uuid          NOT NULL REFERENCES public.saved_collections(id) ON DELETE CASCADE,
  user_id               uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id             uuid          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Snapshot fields from vendor_catalogue (denormalised for resilience)
  catalogue_item_id     uuid,         -- nullable — NULL if item was deleted
  vendor_id             uuid,
  vendor_name           text          NOT NULL,
  title                 text          NOT NULL,
  description           text,
  service_mode          text          NOT NULL,
  origin_region         text          NOT NULL,
  destination_region    text          NOT NULL,
  transit_days_min      integer,
  transit_days_max      integer,
  base_price_amount     numeric(12,2),
  base_price_currency   char(3)       NOT NULL DEFAULT 'USD',
  price_unit            text,
  tags                  text[]        NOT NULL DEFAULT '{}',

  note                  text          CHECK (char_length(note) <= 500), -- user's personal note

  created_at            timestamptz   NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_saved_collections_user_id
  ON public.saved_collections(user_id);

CREATE INDEX IF NOT EXISTS idx_saved_collections_tenant_id
  ON public.saved_collections(tenant_id);

CREATE INDEX IF NOT EXISTS idx_saved_items_collection_id
  ON public.saved_items(collection_id);

CREATE INDEX IF NOT EXISTS idx_saved_items_user_id
  ON public.saved_items(user_id);

CREATE INDEX IF NOT EXISTS idx_saved_items_catalogue_item_id
  ON public.saved_items(catalogue_item_id) WHERE catalogue_item_id IS NOT NULL;

-- Composite: fast lookup "is this item saved in any collection by this user?"
CREATE INDEX IF NOT EXISTS idx_saved_items_user_catalogue
  ON public.saved_items(user_id, catalogue_item_id) WHERE catalogue_item_id IS NOT NULL;

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE TRIGGER trg_saved_collections_updated_at
  BEFORE UPDATE ON public.saved_collections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.saved_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_items        ENABLE ROW LEVEL SECURITY;

-- saved_collections: users can only see and manage their OWN collections
CREATE POLICY "saved_collections_owner"
  ON public.saved_collections
  FOR ALL
  USING   (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- saved_items: users can only see and manage items in their OWN collections
CREATE POLICY "saved_items_owner"
  ON public.saved_items
  FOR ALL
  USING   (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─── item_count maintenance function ─────────────────────────────────────────
-- Keeps saved_collections.item_count in sync via triggers

CREATE OR REPLACE FUNCTION public.sync_collection_item_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.saved_collections
       SET item_count = item_count + 1,
           cover_gradient = NEW.service_mode, -- placeholder; frontend derives actual gradient
           updated_at = now()
     WHERE id = NEW.collection_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.saved_collections
       SET item_count = GREATEST(item_count - 1, 0),
           updated_at = now()
     WHERE id = OLD.collection_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_saved_items_count_insert
  AFTER INSERT ON public.saved_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_collection_item_count();

CREATE TRIGGER trg_saved_items_count_delete
  AFTER DELETE ON public.saved_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_collection_item_count();
