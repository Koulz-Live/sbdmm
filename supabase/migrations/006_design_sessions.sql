-- ─── Migration 006: AI Design Sessions ──────────────────────────────────────
-- Stores the full AI-assisted carpentry furniture design flow:
--   Room type selection → photo upload → preferences → AI concept generation
--   → refinement → conversion to carpentry order

create table if not exists public.design_sessions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  created_by            uuid not null references public.user_profiles(id) on delete cascade,

  -- Step 1: Room context
  room_type             text not null
                          check (room_type in (
                            'living_room','dining_room','kitchen_nook','office_study'
                          )),

  -- Step 2: Room photo (stored in Supabase Storage bucket 'room-photos')
  room_photo_path       text,          -- storage path — never expose directly
  room_photo_url        text,          -- short-lived signed URL refreshed on read

  -- Step 3: User preferences
  table_type            text
                          check (table_type in (
                            'coffee_table','dining_table','side_table','console_table'
                          )),
  style                 text
                          check (style in (
                            'modern','minimalist','rustic','classic','luxury'
                          )),
  seating_size          text
                          check (seating_size in (
                            '2_seater','4_seater','6_seater','8_seater','not_applicable'
                          )),
  material_preference   text
                          check (material_preference in (
                            'oak','pine','dark_wood','walnut','mixed_wood_steel'
                          )),
  budget_min            numeric(10,2),
  budget_max            numeric(10,2),
  budget_currency       char(3) not null default 'USD',

  -- Steps 4-5: AI output (JSONB for flexibility — schema enforced at app layer)
  ai_design_rationale   text,
  ai_concepts           jsonb,          -- DesignConcept[] — see shared types
  ai_model_used         text,
  ai_prompt_tokens      integer,
  ai_completion_tokens  integer,

  -- Step 6: Refinement history
  refinement_history    jsonb not null default '[]'::jsonb,
  active_concept_index  integer not null default 0,

  -- Steps 7-8: Conversion to order
  converted_to_order_id uuid references public.orders(id) on delete set null,
  status                text not null default 'draft'
                          check (status in (
                            'draft','concepts_ready','refining','converted','abandoned'
                          )),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Indexes for common query patterns
create index if not exists idx_design_sessions_tenant      on public.design_sessions(tenant_id);
create index if not exists idx_design_sessions_created_by  on public.design_sessions(created_by);
create index if not exists idx_design_sessions_status      on public.design_sessions(status);
create index if not exists idx_design_sessions_created_at  on public.design_sessions(created_at desc);

-- Reuse existing updated_at trigger function (created in 001_initial_schema.sql)
create trigger trg_design_sessions_updated_at
  before update on public.design_sessions
  for each row execute function public.set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Uses the project's established helper functions from 002_rls_policies.sql:
--   public.get_my_tenant_id()  → current user's tenant_id
--   public.is_tenant_admin()   → true if role is tenant_admin or super_admin
--   public.is_super_admin()    → true if role is super_admin

alter table public.design_sessions enable row level security;

-- Owners: see their own sessions within their tenant
create policy "design_sessions_owner_select" on public.design_sessions
  for select using (
    created_by = auth.uid()
    and tenant_id = public.get_my_tenant_id()
  );

-- Owners: create sessions scoped to their own tenant and user
create policy "design_sessions_owner_insert" on public.design_sessions
  for insert with check (
    created_by = auth.uid()
    and tenant_id = public.get_my_tenant_id()
  );

-- Owners: update their own sessions
create policy "design_sessions_owner_update" on public.design_sessions
  for update using (
    created_by = auth.uid()
    and tenant_id = public.get_my_tenant_id()
  );

-- Tenant admins: read all sessions in their tenant (for reporting)
create policy "design_sessions_admin_select" on public.design_sessions
  for select using (
    tenant_id = public.get_my_tenant_id()
    and public.is_tenant_admin()
  );

-- ─── Storage bucket instructions (run in Supabase dashboard) ─────────────────
-- create bucket 'room-photos' with:
--   public = false
--   file size limit = 10485760   (10 MB)
--   allowed mime types = image/jpeg, image/png, image/webp, image/heic
-- Storage paths follow: {tenant_id}/design-sessions/{session_id}/room-photo.{ext}
-- RLS policies on storage.objects should mirror the above tenant/user isolation.
