-- Production jobs, timed artisan matching, AI BOM versioning, procurement and
-- IFRS-aligned job subledger. Supabase owns state and concurrency guarantees.

CREATE TABLE public.artisan_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  service_radius_km numeric(8,2) NOT NULL DEFAULT 50 CHECK (service_radius_km > 0),
  latitude numeric(9,6),
  longitude numeric(9,6),
  specialties text[] NOT NULL DEFAULT '{}',
  materials text[] NOT NULL DEFAULT '{}',
  rating numeric(3,2) NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  reliability_score numeric(5,2) NOT NULL DEFAULT 50 CHECK (reliability_score BETWEEN 0 AND 100),
  capacity_available boolean NOT NULL DEFAULT true,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.production_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
  design_session_id uuid REFERENCES public.design_sessions(id),
  buyer_id uuid NOT NULL REFERENCES public.user_profiles(id),
  artisan_id uuid REFERENCES public.user_profiles(id),
  status text NOT NULL DEFAULT 'matching' CHECK (status IN (
    'matching','matching_failed','artisan_reserved','design_review','bom_review',
    'job_confirmation_pending','confirmed','materials_sourcing','production_ready',
    'in_production','quality_review','ready_for_delivery','delivered','completed','cancelled'
  )),
  approved_design jsonb NOT NULL DEFAULT '{}',
  currency char(3) NOT NULL DEFAULT 'ZAR',
  final_job_price numeric(15,2),
  estimated_completion_date date,
  delivery_latitude numeric(9,6),
  delivery_longitude numeric(9,6),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.job_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.production_jobs(id) ON DELETE CASCADE,
  artisan_id uuid NOT NULL REFERENCES public.user_profiles(id),
  ranking_position integer NOT NULL CHECK (ranking_position > 0),
  ranking_score numeric(8,4) NOT NULL,
  ranking_factors jsonb NOT NULL DEFAULT '{}',
  ranking_version text NOT NULL DEFAULT 'v1',
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','offered','viewed','accepted','declined','expired','withdrawn','superseded')),
  offered_at timestamptz,
  expires_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  decline_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, artisan_id),
  UNIQUE(job_id, ranking_position)
);
CREATE UNIQUE INDEX job_offers_one_live_offer ON public.job_offers(job_id)
  WHERE status IN ('offered','viewed','accepted');

CREATE TABLE public.bom_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.production_jobs(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('ai_draft','draft','confirmed','superseded')),
  source text NOT NULL CHECK (source IN ('openai','artisan')),
  model_used text,
  prompt_version text,
  confidence numeric(5,4),
  assumptions jsonb NOT NULL DEFAULT '[]',
  unresolved_questions jsonb NOT NULL DEFAULT '[]',
  estimated_labour_hours numeric(10,2),
  estimated_machine_hours numeric(10,2),
  estimated_production_days integer,
  subtotal_materials numeric(15,2) NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'ZAR',
  created_by uuid REFERENCES public.user_profiles(id),
  confirmed_by uuid REFERENCES public.user_profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, version)
);

CREATE TABLE public.bom_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_version_id uuid NOT NULL REFERENCES public.bom_versions(id) ON DELETE CASCADE,
  assembly_name text NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  category text NOT NULL,
  description text NOT NULL,
  specification text NOT NULL DEFAULT '',
  dimensions text,
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  waste_percentage numeric(6,3) NOT NULL DEFAULT 0 CHECK (waste_percentage BETWEEN 0 AND 100),
  suggested_material text,
  acceptable_substitutes text[] NOT NULL DEFAULT '{}',
  estimated_unit_cost numeric(15,2),
  estimated_total_cost numeric(15,2),
  confidence numeric(5,4),
  assumptions text[] NOT NULL DEFAULT '{}',
  procurement_class text NOT NULL DEFAULT 'vendor_eligible' CHECK (procurement_class IN ('artisan_stock','buyer_supplied','vendor_eligible')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sourcing_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.production_jobs(id) ON DELETE CASCADE,
  bom_version_id uuid NOT NULL REFERENCES public.bom_versions(id),
  method text NOT NULL CHECK (method IN ('artisan_self_procure','vendor_procurement')),
  material_budget numeric(15,2) NOT NULL CHECK (material_budget >= 0),
  funding_method text CHECK (funding_method IN ('artisan_funded','buyer_advance','platform_advance','included_in_job_price')),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','quotation_pending','approved','cancelled')),
  decided_by uuid NOT NULL REFERENCES public.user_profiles(id),
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.supply_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  job_id uuid NOT NULL REFERENCES public.production_jobs(id),
  bom_version_id uuid NOT NULL REFERENCES public.bom_versions(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','quoted','awarded','cancelled')),
  response_deadline timestamptz NOT NULL DEFAULT (now() + interval '3 days'),
  required_by date,
  delivery_region text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, bom_version_id)
);

CREATE TABLE public.vendor_supply_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_request_id uuid NOT NULL REFERENCES public.supply_requests(id) ON DELETE CASCADE,
  vendor_user_id uuid NOT NULL REFERENCES public.user_profiles(id),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','accepted','declined','withdrawn','expired')),
  currency char(3) NOT NULL DEFAULT 'ZAR',
  subtotal numeric(15,2) NOT NULL CHECK (subtotal >= 0),
  tax numeric(15,2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  delivery_fee numeric(15,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total numeric(15,2) NOT NULL CHECK (total >= 0),
  lead_time_days integer NOT NULL CHECK (lead_time_days > 0),
  valid_until timestamptz NOT NULL,
  payment_terms text NOT NULL DEFAULT '',
  line_items jsonb NOT NULL DEFAULT '[]',
  notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(supply_request_id, vendor_user_id)
);

CREATE TABLE public.payment_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.production_jobs(id),
  status text NOT NULL DEFAULT 'blocked' CHECK (status IN ('blocked','authorized','scheduled','paid','refunded','disputed')),
  amount numeric(15,2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'ZAR',
  requirements jsonb NOT NULL DEFAULT '{}',
  authorized_at timestamptz,
  authorized_by uuid REFERENCES public.user_profiles(id),
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.user_profiles(id),
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  UNIQUE(artisan_id, code)
);

CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.user_profiles(id),
  job_id uuid REFERENCES public.production_jobs(id),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  source_event text NOT NULL,
  source_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','reversed')),
  reversal_of uuid REFERENCES public.journal_entries(id),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_event, source_id)
);

CREATE TABLE public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.financial_accounts(id),
  debit numeric(15,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(15,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  currency char(3) NOT NULL DEFAULT 'ZAR',
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE TABLE public.job_financial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES public.user_profiles(id),
  job_id uuid NOT NULL REFERENCES public.production_jobs(id),
  event_type text NOT NULL CHECK (event_type IN ('material_purchase','materials_issued','direct_labour','production_completed','control_transferred','customer_payment','vendor_payable')),
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'ZAR',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL,
  evidence_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX production_jobs_artisan_status ON public.production_jobs(artisan_id, status);
CREATE INDEX job_offers_artisan_status ON public.job_offers(artisan_id, status, expires_at);
CREATE INDEX bom_versions_job ON public.bom_versions(job_id, version DESC);
CREATE INDEX journal_entries_artisan_date ON public.journal_entries(artisan_id, entry_date);

CREATE OR REPLACE FUNCTION public.accept_job_offer(p_offer_id uuid)
RETURNS public.job_offers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_offer public.job_offers; v_job public.production_jobs;
BEGIN
  SELECT * INTO v_offer FROM public.job_offers WHERE id = p_offer_id FOR UPDATE;
  IF v_offer.id IS NULL OR v_offer.artisan_id <> auth.uid() THEN RAISE EXCEPTION 'offer not found'; END IF;
  IF v_offer.status NOT IN ('offered','viewed') OR v_offer.expires_at <= now() THEN RAISE EXCEPTION 'offer expired'; END IF;
  SELECT * INTO v_job FROM public.production_jobs WHERE id = v_offer.job_id FOR UPDATE;
  IF v_job.artisan_id IS NOT NULL OR v_job.status <> 'matching' THEN RAISE EXCEPTION 'job unavailable'; END IF;
  UPDATE public.job_offers SET status='accepted', accepted_at=now() WHERE id=p_offer_id RETURNING * INTO v_offer;
  UPDATE public.job_offers SET status='superseded' WHERE job_id=v_offer.job_id AND id<>p_offer_id AND status='scheduled';
  UPDATE public.production_jobs SET artisan_id=auth.uid(), status='artisan_reserved', updated_at=now() WHERE id=v_offer.job_id;
  RETURN v_offer;
END $$;
REVOKE ALL ON FUNCTION public.accept_job_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_job_offer(uuid) TO authenticated;

-- Call once per minute from Supabase Cron or the platform scheduler. Row locks
-- and the partial unique index guarantee one active offer per job.
CREATE OR REPLACE FUNCTION public.advance_expired_job_offers()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE v_job uuid; v_next uuid; v_count integer := 0;
BEGIN
  FOR v_job IN SELECT DISTINCT job_id FROM public.job_offers WHERE status IN ('offered','viewed') AND expires_at <= now()
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(v_job::text));
    UPDATE public.job_offers SET status='expired' WHERE job_id=v_job AND status IN ('offered','viewed') AND expires_at <= now();
    SELECT id INTO v_next FROM public.job_offers WHERE job_id=v_job AND status='scheduled' ORDER BY ranking_position LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF v_next IS NULL THEN
      UPDATE public.production_jobs SET status='matching_failed',updated_at=now() WHERE id=v_job AND status='matching';
    ELSE
      UPDATE public.job_offers SET status='offered',offered_at=now(),expires_at=now()+interval '15 minutes' WHERE id=v_next;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.advance_expired_job_offers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_expired_job_offers() TO service_role;

ALTER TABLE public.artisan_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sourcing_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supply_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_supply_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_financial_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY artisan_profiles_read ON public.artisan_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY artisan_profiles_self_update ON public.artisan_profiles FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY production_jobs_participant_read ON public.production_jobs FOR SELECT TO authenticated USING (buyer_id=auth.uid() OR artisan_id=auth.uid() OR public.is_admin());
CREATE POLICY job_offers_artisan_read ON public.job_offers FOR SELECT TO authenticated USING (artisan_id=auth.uid() OR public.is_admin());
CREATE POLICY bom_versions_participant_read ON public.bom_versions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.production_jobs j WHERE j.id=job_id AND (j.buyer_id=auth.uid() OR j.artisan_id=auth.uid() OR public.is_admin())));
CREATE POLICY bom_items_participant_read ON public.bom_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.bom_versions b JOIN public.production_jobs j ON j.id=b.job_id WHERE b.id=bom_version_id AND (j.buyer_id=auth.uid() OR j.artisan_id=auth.uid() OR public.is_admin())));
CREATE POLICY sourcing_participant_read ON public.sourcing_decisions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.production_jobs j WHERE j.id=job_id AND (j.buyer_id=auth.uid() OR j.artisan_id=auth.uid() OR public.is_admin())));
CREATE POLICY supply_requests_vendor_read ON public.supply_requests FOR SELECT TO authenticated USING (public.get_my_role()='vendor' OR public.is_admin() OR EXISTS (SELECT 1 FROM public.production_jobs j WHERE j.id=job_id AND j.artisan_id=auth.uid()));
CREATE POLICY vendor_quotes_owner_read ON public.vendor_supply_quotes FOR SELECT TO authenticated USING (vendor_user_id=auth.uid() OR public.is_admin() OR EXISTS (SELECT 1 FROM public.supply_requests r JOIN public.production_jobs j ON j.id=r.job_id WHERE r.id=supply_request_id AND j.artisan_id=auth.uid()));
CREATE POLICY payment_authorizations_participant_read ON public.payment_authorizations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.production_jobs j WHERE j.id=job_id AND (j.buyer_id=auth.uid() OR j.artisan_id=auth.uid() OR public.is_admin())));
CREATE POLICY financial_accounts_owner ON public.financial_accounts FOR SELECT TO authenticated USING (artisan_id=auth.uid() OR public.has_permission('analytics:read'));
CREATE POLICY journal_entries_owner ON public.journal_entries FOR SELECT TO authenticated USING (artisan_id=auth.uid() OR public.has_permission('analytics:read'));
CREATE POLICY journal_lines_owner ON public.journal_lines FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.id=journal_entry_id AND (e.artisan_id=auth.uid() OR public.has_permission('analytics:read'))));
CREATE POLICY job_financial_events_owner ON public.job_financial_events FOR SELECT TO authenticated USING (artisan_id=auth.uid() OR public.has_permission('analytics:read'));

GRANT SELECT ON public.artisan_profiles, public.production_jobs, public.job_offers, public.bom_versions, public.bom_items, public.sourcing_decisions, public.supply_requests, public.vendor_supply_quotes, public.payment_authorizations, public.financial_accounts, public.journal_entries, public.journal_lines, public.job_financial_events TO authenticated;
GRANT UPDATE ON public.artisan_profiles TO authenticated;
