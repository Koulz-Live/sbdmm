-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005 — Vendor Service Catalogue
--
-- Adds the vendor_catalogue table which stores the logistics services/lanes
-- that each vendor publishes. Buyers browse these to request quotes.
--
-- Security model:
--   • RLS tenant_isolation: users only see rows for their own tenant
--   • vendors/logistics_providers can INSERT/UPDATE their own rows
--   • buyers can SELECT (read-only)
--   • super_admin bypasses all policies (existing bypass_rls role)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendor_catalogue (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id            uuid          NOT NULL REFERENCES public.vendors(id)  ON DELETE CASCADE,
  tenant_id            uuid          NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
  title                text          NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description          text,
  service_mode         text          NOT NULL CHECK (service_mode IN ('FCL','LCL','AIR','ROAD','RAIL','COURIER','OTHER')),
  origin_region        text          NOT NULL CHECK (char_length(origin_region) BETWEEN 2 AND 100),
  destination_region   text          NOT NULL CHECK (char_length(destination_region) BETWEEN 2 AND 100),
  transit_days_min     integer       NOT NULL CHECK (transit_days_min >= 1),
  transit_days_max     integer       NOT NULL CHECK (transit_days_max >= transit_days_min),
  base_price_amount    numeric(12,2),                         -- NULL = quote on request
  base_price_currency  char(3)       NOT NULL DEFAULT 'USD',
  price_unit           text          NOT NULL DEFAULT 'per shipment' CHECK (char_length(price_unit) BETWEEN 1 AND 50),
  status               text          NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','draft')),
  tags                 text[]        NOT NULL DEFAULT '{}',
  created_by           uuid          NOT NULL REFERENCES auth.users(id),
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Fast lookup by vendor (primary query pattern: GET /vendors/:id/catalogue)
CREATE INDEX IF NOT EXISTS idx_vendor_catalogue_vendor_id
  ON public.vendor_catalogue (vendor_id);

-- Fast tenant isolation scans
CREATE INDEX IF NOT EXISTS idx_vendor_catalogue_tenant_id
  ON public.vendor_catalogue (tenant_id);

-- Filter by status (most queries filter to 'active')
CREATE INDEX IF NOT EXISTS idx_vendor_catalogue_status
  ON public.vendor_catalogue (status);

-- Composite for the standard list query: vendor + tenant + active
CREATE INDEX IF NOT EXISTS idx_vendor_catalogue_vendor_tenant_status
  ON public.vendor_catalogue (vendor_id, tenant_id, status);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

-- Reuse the existing set_updated_at function (created in migration 001)
CREATE TRIGGER trg_vendor_catalogue_updated_at
  BEFORE UPDATE ON public.vendor_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.vendor_catalogue ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user in the same tenant can read active catalogue items
CREATE POLICY "vendor_catalogue_select"
  ON public.vendor_catalogue
  FOR SELECT
  USING (
    tenant_id = public.get_my_tenant_id()
  );

-- INSERT: only vendors / logistics_providers / tenant_admin / super_admin can add items
CREATE POLICY "vendor_catalogue_insert"
  ON public.vendor_catalogue
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND public.get_my_role() IN ('vendor', 'logistics_provider', 'tenant_admin', 'super_admin')
  );

-- UPDATE: same roles as insert, and only within same tenant
CREATE POLICY "vendor_catalogue_update"
  ON public.vendor_catalogue
  FOR UPDATE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.get_my_role() IN ('vendor', 'logistics_provider', 'tenant_admin', 'super_admin')
  )
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
  );

-- DELETE: tenant_admin / super_admin only (hard deletes; API does soft-delete via status)
CREATE POLICY "vendor_catalogue_delete"
  ON public.vendor_catalogue
  FOR DELETE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.get_my_role() IN ('tenant_admin', 'super_admin')
  );

-- ─── Grant to authenticated role ─────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_catalogue TO authenticated;

-- ─── Comment ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.vendor_catalogue IS
  'Service catalogue entries published by logistics vendors. '
  'Each row represents a lane or service offering (FCL, LCL, AIR, etc.) '
  'that buyers can browse and request a quote for.';

-- ─── End of migration 005 ────────────────────────────────────────────────────
