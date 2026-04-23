-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012 — E-Commerce Shopping Cart & Checkout
--
-- Adds three tables to support the /home feed e-commerce flow:
--   cart_items       — per-user shopping cart (persisted, DB-backed)
--   coupon_codes     — platform-wide discount codes (FULL100 seeded at 100%)
--   checkout_orders  — completed order records (payment gateway slot ready)
--
-- Security:
--   cart_items and checkout_orders use RLS so users see ONLY their own rows.
--   coupon_codes are read-only for all authenticated users (service_role mutates).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── cart_items ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cart_items (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id            uuid          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  catalogue_item_id    uuid          NOT NULL REFERENCES public.vendor_catalogue(id) ON DELETE CASCADE,
  vendor_id            uuid          NOT NULL,
  vendor_name          text          NOT NULL CHECK (char_length(vendor_name) <= 200),
  title                text          NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  base_price_amount    numeric(12,2),               -- NULL = quote on request
  base_price_currency  char(3)       NOT NULL DEFAULT 'USD',
  price_unit           text          CHECK (char_length(price_unit) <= 50),
  service_mode         text          NOT NULL DEFAULT 'OTHER',
  origin_region        text          NOT NULL DEFAULT '',
  destination_region   text          NOT NULL DEFAULT '',
  quantity             integer       NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100),
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now(),
  -- One cart slot per catalogue item per user (upsert pattern)
  UNIQUE (user_id, catalogue_item_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_user_id
  ON public.cart_items (user_id);

CREATE INDEX IF NOT EXISTS idx_cart_items_tenant_id
  ON public.cart_items (tenant_id);

CREATE TRIGGER trg_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: users only see and mutate their own cart
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY cart_items_select ON public.cart_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY cart_items_insert ON public.cart_items
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND tenant_id = (
      SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY cart_items_update ON public.cart_items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY cart_items_delete ON public.cart_items
  FOR DELETE USING (auth.uid() = user_id);

-- ─── coupon_codes ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coupon_codes (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text          NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 1 AND 50),
  discount_pct  numeric(5,2)  NOT NULL CHECK (discount_pct > 0 AND discount_pct <= 100),
  is_active     boolean       NOT NULL DEFAULT true,
  max_uses      integer,        -- NULL = unlimited
  use_count     integer       NOT NULL DEFAULT 0,
  expires_at    timestamptz,    -- NULL = never expires
  created_at    timestamptz   NOT NULL DEFAULT now()
);

-- Seed: FULL100 gives 100% off — unlimited uses, never expires
-- Users can apply this during checkout while the payment gateway is pending
INSERT INTO public.coupon_codes (code, discount_pct, is_active)
VALUES ('FULL100', 100.00, true)
ON CONFLICT (code) DO NOTHING;

-- RLS: any authenticated user can read (needed for validation); mutations via service_role only
ALTER TABLE public.coupon_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY coupon_codes_select ON public.coupon_codes
  FOR SELECT USING (true);

-- ─── checkout_orders ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.checkout_orders (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid          NOT NULL REFERENCES auth.users(id),
  tenant_id        uuid          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Snapshot of cart items at time of order (denormalised for immutability)
  items            jsonb         NOT NULL DEFAULT '[]',
  subtotal         numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_pct     numeric(5,2)  NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  discount_amount  numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total            numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  coupon_code      text,
  -- pending = awaiting payment; paid = payment received or 100% discount; cancelled
  status           text          NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'paid', 'cancelled')),
  payment_ref      text,          -- future: Stripe/Paystack/etc payment intent ID
  currency         char(3)       NOT NULL DEFAULT 'USD',
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkout_orders_user_id
  ON public.checkout_orders (user_id);

CREATE INDEX IF NOT EXISTS idx_checkout_orders_tenant_id
  ON public.checkout_orders (tenant_id);

CREATE TRIGGER trg_checkout_orders_updated_at
  BEFORE UPDATE ON public.checkout_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.checkout_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY checkout_orders_select ON public.checkout_orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY checkout_orders_insert ON public.checkout_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
