-- ============================================================
-- seed.sql — SBDMM Platform Development Seed Data
-- ============================================================
-- Run via: supabase db reset  (automatically applies after migrations)
--    or:   psql $DATABASE_URL -f supabase/seed.sql
--
-- Creates:
--   • 2 tenants (furniture importer + logistics firm)
--   • 8 auth users  (1 super_admin, 2 tenant_admins, 2 buyers, 3 vendors)
--   • 8 user_profiles linked to the above
--   • 3 vendor records
--   • 16 vendor_catalogue items (furniture logistics lanes, real categories)
--   • 6 orders (various statuses)
--   • 8 quotes (pending / accepted / rejected)
--   • 2 saved_collections with 6 saved_items
--   • 4 notifications
--   • 4 compliance_rules (global)
--   • 3 compliance_evaluations
--   • 4 messages (order thread)
--   • 3 vendor_ratings
--   • 2 esg_scores
-- ============================================================

-- ─── Safety guard ─────────────────────────────────────────────────────────────
-- Wrapped in a transaction so the whole seed rolls back on any error.
BEGIN;

-- ─── 1. Tenants ───────────────────────────────────────────────────────────────

INSERT INTO public.tenants (id, name, slug, status, plan, region) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Casa Bella Imports',   'casa-bella',   'active', 'professional', 'ZA'),
  ('10000000-0000-0000-0000-000000000002', 'Nordic Freight Co.',   'nordic-freight','active', 'starter',      'SE')
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Auth users ────────────────────────────────────────────────────────────
-- NOTE: Supabase local dev seeds auth.users via the auth schema.
-- In production, users are created through the Supabase Auth API.
-- These inserts work with `supabase db reset` in local dev only.

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, aud, role
) VALUES
  -- super_admin
  ('20000000-0000-0000-0000-000000000001', 'super@sbdmm.dev',
   crypt('Seed1234!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', 'authenticated'),

  -- casa-bella tenant_admin
  ('20000000-0000-0000-0000-000000000002', 'admin@casabella.dev',
   crypt('Seed1234!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', 'authenticated'),

  -- nordic-freight tenant_admin
  ('20000000-0000-0000-0000-000000000003', 'admin@nordicfreight.dev',
   crypt('Seed1234!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', 'authenticated'),

  -- casa-bella buyers
  ('20000000-0000-0000-0000-000000000004', 'buyer1@casabella.dev',
   crypt('Seed1234!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', 'authenticated'),

  ('20000000-0000-0000-0000-000000000005', 'buyer2@casabella.dev',
   crypt('Seed1234!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', 'authenticated'),

  -- vendors (all in casa-bella tenant)
  ('20000000-0000-0000-0000-000000000006', 'vendor1@casabella.dev',
   crypt('Seed1234!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', 'authenticated'),

  ('20000000-0000-0000-0000-000000000007', 'vendor2@casabella.dev',
   crypt('Seed1234!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', 'authenticated'),

  ('20000000-0000-0000-0000-000000000008', 'vendor3@casabella.dev',
   crypt('Seed1234!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), 'authenticated', 'authenticated')

ON CONFLICT (id) DO NOTHING;

-- ─── 3. User Profiles ────────────────────────────────────────────────────────

INSERT INTO public.user_profiles (id, tenant_id, full_name, role) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Sam Superadmin',     'super_admin'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Alice Tenant Admin', 'tenant_admin'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Erik Andersson',     'tenant_admin'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Priya Naidoo',       'buyer'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'James Obi',          'buyer'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Chen Wei Logistics', 'logistics_provider'),
  ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'Maria Santos',       'vendor'),
  ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'Tarek Mansour',      'logistics_provider')
ON CONFLICT (id) DO NOTHING;

-- ─── 4. Vendors ───────────────────────────────────────────────────────────────

INSERT INTO public.vendors (
  id, tenant_id, user_id, company_name, company_registration_number,
  country_of_registration, contact_email, contact_phone, business_category,
  website_url, onboarding_status, compliance_status, esg_score, created_by
) VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000006',
    'SinoFurn Freight Ltd.', 'CHN2024001', 'CN',
    'ops@sinofurn.dev', '+86 21 5555 0100', 'furniture_logistics',
    'https://sinofurn.dev', 'approved', 'passed', 82.50,
    '20000000-0000-0000-0000-000000000002'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000007',
    'Cape Route Shipping', 'ZA2024002', 'ZA',
    'info@caperoute.dev', '+27 21 555 0200', 'sea_freight',
    'https://caperoute.dev', 'approved', 'passed', 74.00,
    '20000000-0000-0000-0000-000000000002'
  ),
  (
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000008',
    'AirSwift Cargo', 'AE2024003', 'AE',
    'cargo@airswift.dev', '+971 4 555 0300', 'air_freight',
    'https://airswift.dev', 'approved', 'passed', 68.25,
    '20000000-0000-0000-0000-000000000002'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 5. Vendor Catalogue ──────────────────────────────────────────────────────
-- 16 realistic furniture-logistics lanes covering all service modes.

INSERT INTO public.vendor_catalogue (
  id, vendor_id, tenant_id, title, description,
  service_mode, origin_region, destination_region,
  transit_days_min, transit_days_max,
  base_price_amount, base_price_currency, price_unit,
  status, tags, save_count, created_by
) VALUES
  -- SinoFurn Freight (vendor 1) — 6 lanes
  (
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Shanghai → Durban FCL 40HQ (Sofas & Sectionals)',
    'Full container load service for bulky upholstered sofa sets. Includes palletisation, lashing and fumigation certificate.',
    'FCL', 'Shanghai, China', 'Durban, South Africa',
    28, 35, 3800.00, 'USD', 'per 40HQ container',
    'active', ARRAY['sofa','upholstered','FCL','container','China','South Africa'], 12,
    '20000000-0000-0000-0000-000000000006'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Guangzhou → Cape Town LCL (Dining Tables & Chairs)',
    'Less-than-container-load for dining sets. Consolidated weekly. Crating included for glass-top tables.',
    'LCL', 'Guangzhou, China', 'Cape Town, South Africa',
    35, 42, 680.00, 'USD', 'per CBM',
    'active', ARRAY['dining table','chairs','LCL','glass','China','South Africa'], 8,
    '20000000-0000-0000-0000-000000000006'
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Foshan → Johannesburg FCL 20GP (Bedroom Furniture)',
    'Dedicated lane for bedroom sets: beds, wardrobes, dressers. Foshan pickup included.',
    'FCL', 'Foshan, China', 'Johannesburg, South Africa',
    30, 38, 2600.00, 'USD', 'per 20GP container',
    'active', ARRAY['bedroom','bed','wardrobe','dresser','FCL','China','South Africa'], 5,
    '20000000-0000-0000-0000-000000000006'
  ),
  (
    '40000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Shanghai → Dubai FCL (Office Furniture)',
    'FCL service for commercial office furniture: desks, executive chairs, storage units. Includes customs HS code advisory.',
    'FCL', 'Shanghai, China', 'Dubai, UAE',
    18, 24, 3200.00, 'USD', 'per 40HQ container',
    'active', ARRAY['office','desk','chairs','FCL','China','UAE'], 3,
    '20000000-0000-0000-0000-000000000006'
  ),
  (
    '40000000-0000-0000-0000-000000000005',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Guangzhou → Nairobi LCL (Outdoor Furniture)',
    'LCL for patio and garden furniture. Weather-resistant packaging. Port of Mombasa clearance support available.',
    'LCL', 'Guangzhou, China', 'Nairobi, Kenya',
    32, 40, 720.00, 'USD', 'per CBM',
    'active', ARRAY['outdoor','patio','garden','LCL','China','Kenya'], 7,
    '20000000-0000-0000-0000-000000000006'
  ),
  (
    '40000000-0000-0000-0000-000000000006',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Yiwu → Accra LCL (Lighting & Décor)',
    'Consolidated groupage from Yiwu Market for lighting fixtures, wall art and decorative accessories.',
    'LCL', 'Yiwu, China', 'Accra, Ghana',
    38, 48, 590.00, 'USD', 'per CBM',
    'active', ARRAY['lighting','decor','accessories','LCL','China','Ghana'], 2,
    '20000000-0000-0000-0000-000000000006'
  ),

  -- Cape Route Shipping (vendor 2) — 5 lanes
  (
    '40000000-0000-0000-0000-000000000007',
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Cape Town → Lagos RORO (Flat-Pack Furniture)',
    'Roll-on/Roll-off service for flat-pack furniture in wrapped pallets. Weekly sailings, competitive rates.',
    'FCL', 'Cape Town, South Africa', 'Lagos, Nigeria',
    14, 18, 1800.00, 'USD', 'per 20GP container',
    'active', ARRAY['flat-pack','RORO','South Africa','Nigeria'], 9,
    '20000000-0000-0000-0000-000000000007'
  ),
  (
    '40000000-0000-0000-0000-000000000008',
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Durban → Johannesburg Road Freight (Sofas)',
    'Domestic road delivery for bulky sofa sets from Durban Port. White-glove room-of-choice delivery available.',
    'ROAD', 'Durban, South Africa', 'Johannesburg, South Africa',
    2, 4, 420.00, 'ZAR', 'per load',
    'active', ARRAY['sofa','road','domestic','South Africa','white-glove'], 14,
    '20000000-0000-0000-0000-000000000007'
  ),
  (
    '40000000-0000-0000-0000-000000000009',
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Johannesburg → Harare Road (Bedroom & Living Room)',
    'Cross-border road freight ZA → ZW. Carnets, permits and border clearance handled.',
    'ROAD', 'Johannesburg, South Africa', 'Harare, Zimbabwe',
    3, 5, 9500.00, 'ZAR', 'per truck',
    'active', ARRAY['bedroom','living room','road','Zimbabwe','cross-border'], 4,
    '20000000-0000-0000-0000-000000000007'
  ),
  (
    '40000000-0000-0000-0000-000000000010',
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Cape Town → Maputo Rail (Flat-Pack Containers)',
    'Rail service via SPOORNET / CFM for flat-pack furniture containers. Reliable schedule, lower carbon footprint.',
    'RAIL', 'Cape Town, South Africa', 'Maputo, Mozambique',
    5, 8, 2200.00, 'USD', 'per 20GP container',
    'active', ARRAY['flat-pack','rail','Mozambique','low-carbon','South Africa'], 6,
    '20000000-0000-0000-0000-000000000007'
  ),
  (
    '40000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Durban → Cape Town Coastal (Upholstered Goods)',
    'Coastal shipping for upholstered furniture. Lower cost alternative to road for Cape–KZN corridor.',
    'FCL', 'Durban, South Africa', 'Cape Town, South Africa',
    4, 6, 1400.00, 'USD', 'per 20GP container',
    'active', ARRAY['upholstered','coastal','domestic','South Africa'], 3,
    '20000000-0000-0000-0000-000000000007'
  ),

  -- AirSwift Cargo (vendor 3) — 5 lanes
  (
    '40000000-0000-0000-0000-000000000012',
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Dubai → Johannesburg AIR (Lighting & Accessories)',
    'Express air cargo for high-value lighting, mirrors and wall décor. RFS from UAE warehouses. 2–3 day transit.',
    'AIR', 'Dubai, UAE', 'Johannesburg, South Africa',
    2, 3, 18.50, 'USD', 'per kg',
    'active', ARRAY['lighting','mirrors','décor','air','UAE','South Africa','express'], 10,
    '20000000-0000-0000-0000-000000000008'
  ),
  (
    '40000000-0000-0000-0000-000000000013',
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Istanbul → Nairobi AIR (Rugs & Textiles)',
    'Air freight for Turkish rugs, cushions and fabric upholstery. Minimal damage risk vs sea. Weekly flights.',
    'AIR', 'Istanbul, Turkey', 'Nairobi, Kenya',
    3, 4, 14.00, 'USD', 'per kg',
    'active', ARRAY['rugs','textiles','cushions','air','Turkey','Kenya'], 5,
    '20000000-0000-0000-0000-000000000008'
  ),
  (
    '40000000-0000-0000-0000-000000000014',
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Milan → Cape Town AIR (Luxury Furniture Samples)',
    'Premium air service for Italian design furniture samples and showroom pieces. White-glove handling.',
    'AIR', 'Milan, Italy', 'Cape Town, South Africa',
    2, 3, 22.00, 'USD', 'per kg',
    'active', ARRAY['luxury','samples','Italian','air','Italy','South Africa','white-glove'], 8,
    '20000000-0000-0000-0000-000000000008'
  ),
  (
    '40000000-0000-0000-0000-000000000015',
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Dubai → Lagos COURIER (Hardware & Fittings)',
    'Express courier for small consignments: cabinet handles, hinges, lamp parts, upholstery foam samples.',
    'COURIER', 'Dubai, UAE', 'Lagos, Nigeria',
    2, 4, 32.00, 'USD', 'per kg',
    'active', ARRAY['hardware','fittings','courier','UAE','Nigeria','small parcel'], 1,
    '20000000-0000-0000-0000-000000000008'
  ),
  (
    '40000000-0000-0000-0000-000000000016',
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Amsterdam → Johannesburg LCL (Storage Solutions)',
    'LCL for modular shelving, storage cabinets and flat-pack wardrobe systems from Netherlands suppliers.',
    'LCL', 'Amsterdam, Netherlands', 'Johannesburg, South Africa',
    22, 28, 750.00, 'USD', 'per CBM',
    'active', ARRAY['storage','shelving','wardrobe','LCL','Netherlands','South Africa'], 6,
    '20000000-0000-0000-0000-000000000008'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 6. Orders ────────────────────────────────────────────────────────────────

INSERT INTO public.orders (
  id, tenant_id, title,
  status, origin_address, destination_address,
  origin_country, destination_country,
  cargo_description, cargo_weight_kg, cargo_volume_m3,
  required_delivery_date, notes, created_by
) VALUES
  (
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Q2 Sofa Import — 40HQ from Shanghai',
    'pending_quote',
    '1288 Lujiazui Ring Rd, Shanghai, China',
    '12 Intermodal Rd, Durban, South Africa',
    'CN', 'ZA',
    '120 x 3-seater fabric sofas, flat-packed, 1 x 40HQ container.',
    18500.000, 68.000,
    now() + interval '60 days',
    'Insurance required. Please include fumigation certificate in quote.',
    '20000000-0000-0000-0000-000000000004'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Dining Room Sets — LCL Guangzhou',
    'quoted',
    '88 Zhongshan Ave, Guangzhou, China',
    'N1 City Logistics Hub, Cape Town, South Africa',
    'CN', 'ZA',
    'Assorted dining tables and chair sets, glass-top variants, 12 CBM.',
    1800.000, 12.000,
    now() + interval '45 days',
    'Glass tops must be crated individually.',
    '20000000-0000-0000-0000-000000000004'
  ),
  (
    '50000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'Bedroom Suite Consolidation — Foshan FCL',
    'confirmed',
    'Foshan Furniture Market, Guangdong, China',
    '14 Electron Ave, Johannesburg, South Africa',
    'CN', 'ZA',
    'Queen bedroom sets x 40, single bedroom sets x 20, wardrobes x 30.',
    22000.000, 55.000,
    now() + interval '50 days',
    'White-glove delivery to warehouse required.',
    '20000000-0000-0000-0000-000000000005'
  ),
  (
    '50000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'Lighting Fixtures — Air Freight from Dubai',
    'in_transit',
    'JAFZA Warehouse 14, Dubai, UAE',
    '7 Montecasino Blvd, Johannesburg, South Africa',
    'AE', 'ZA',
    'Pendant lights, floor lamps and LED strip kits — 350 kg total.',
    350.000, 2.500,
    now() + interval '5 days',
    'Fragile — individual foam-wrap required.',
    '20000000-0000-0000-0000-000000000004'
  ),
  (
    '50000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    'Patio Furniture — LCL Guangzhou → Nairobi',
    'delivered',
    '22 Export Processing Zone, Guangzhou, China',
    'ICD Nairobi, Kenya',
    'CN', 'KE',
    'Outdoor dining sets, sun loungers, umbrella stands — 18 CBM.',
    2800.000, 18.000,
    now() - interval '5 days',
    NULL,
    '20000000-0000-0000-0000-000000000005'
  ),
  (
    '50000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000001',
    'Italian Luxury Samples — Milan → Cape Town',
    'draft',
    'Via Tortona 37, Milan, Italy',
    'V&A Waterfront Showroom, Cape Town, South Africa',
    'IT', 'ZA',
    'Showroom furniture samples: 3 sofas, 2 coffee tables, 1 dining set.',
    680.000, 8.000,
    now() + interval '30 days',
    'Handle with extreme care. White-glove handling only.',
    '20000000-0000-0000-0000-000000000004'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 7. Quotes ────────────────────────────────────────────────────────────────

INSERT INTO public.quotes (
  id, tenant_id, order_id, provider_id,
  price_amount, price_currency, transit_days_estimated,
  valid_until, status, notes, created_by
) VALUES
  -- Order 1 (pending_quote) — 3 competing quotes, all pending
  (
    '60000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000006',
    3800.00, 'USD', 32, now() + interval '14 days', 'pending',
    'Includes palletisation, lashing and fumigation certificate. All-in rate.',
    '20000000-0000-0000-0000-000000000006'
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000007',
    4100.00, 'USD', 28, now() + interval '14 days', 'pending',
    'Faster transit via Evergreen direct service. Includes inland from port.',
    '20000000-0000-0000-0000-000000000007'
  ),
  (
    '60000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000008',
    3650.00, 'USD', 35, now() + interval '7 days', 'pending',
    'Best price. Transshipment via Singapore. Valid 7 days only.',
    '20000000-0000-0000-0000-000000000008'
  ),

  -- Order 2 (quoted) — 1 accepted, 1 rejected
  (
    '60000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000006',
    8160.00, 'USD', 38, now() + interval '10 days', 'accepted',
    'Full LCL consolidation. Weekly cut-off Thursday.',
    '20000000-0000-0000-0000-000000000006'
  ),
  (
    '60000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000007',
    9200.00, 'USD', 36, now() + interval '10 days', 'rejected',
    'Slightly faster but higher cost.',
    '20000000-0000-0000-0000-000000000007'
  ),

  -- Order 3 (confirmed) — 1 accepted quote
  (
    '60000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000006',
    2600.00, 'USD', 34, now() + interval '20 days', 'accepted',
    'Foshan pickup included. Door-to-port.',
    '20000000-0000-0000-0000-000000000006'
  ),

  -- Order 4 (in_transit) — 1 accepted
  (
    '60000000-0000-0000-0000-000000000007',
    '10000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000004',
    '20000000-0000-0000-0000-000000000008',
    6475.00, 'USD', 3, now() + interval '2 days', 'accepted',
    'Emirates SkyCargo booking confirmed. AWB issued.',
    '20000000-0000-0000-0000-000000000008'
  ),

  -- Order 5 (delivered) — 1 accepted
  (
    '60000000-0000-0000-0000-000000000008',
    '10000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000006',
    12960.00, 'USD', 36, now() - interval '30 days', 'accepted',
    'Delivered on schedule. Final invoice matched estimate.',
    '20000000-0000-0000-0000-000000000006'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 8. Saved Collections ─────────────────────────────────────────────────────

INSERT INTO public.saved_collections (
  id, user_id, tenant_id, name, description, item_count, is_shared
) VALUES
  (
    '70000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'Q3 Bedroom Range',
    'Potential suppliers for the Q3 bedroom furniture push into Johannesburg stores.',
    3, false
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    'Air Freight Shortlist',
    'Fast-lane air options for premium and urgent consignments.',
    3, true
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 9. Saved Items ───────────────────────────────────────────────────────────

INSERT INTO public.saved_items (
  id, collection_id, user_id, tenant_id,
  catalogue_item_id, vendor_id, vendor_name,
  title, description, service_mode,
  origin_region, destination_region,
  transit_days_min, transit_days_max,
  base_price_amount, base_price_currency, price_unit,
  tags
) VALUES
  -- Q3 Bedroom Range (3 items)
  (
    '80000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001', 'SinoFurn Freight Ltd.',
    'Foshan → Johannesburg FCL 20GP (Bedroom Furniture)', NULL,
    'FCL', 'Foshan, China', 'Johannesburg, South Africa',
    30, 38, 2600.00, 'USD', 'per 20GP container',
    ARRAY['bedroom','bed','wardrobe','dresser','FCL']
  ),
  (
    '80000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001', 'SinoFurn Freight Ltd.',
    'Shanghai → Durban FCL 40HQ (Sofas & Sectionals)', NULL,
    'FCL', 'Shanghai, China', 'Durban, South Africa',
    28, 35, 3800.00, 'USD', 'per 40HQ container',
    ARRAY['sofa','upholstered','FCL','container']
  ),
  (
    '80000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000010',
    '30000000-0000-0000-0000-000000000002', 'Cape Route Shipping',
    'Cape Town → Maputo Rail (Flat-Pack Containers)', NULL,
    'RAIL', 'Cape Town, South Africa', 'Maputo, Mozambique',
    5, 8, 2200.00, 'USD', 'per 20GP container',
    ARRAY['flat-pack','rail','Mozambique']
  ),

  -- Air Freight Shortlist (3 items)
  (
    '80000000-0000-0000-0000-000000000004',
    '70000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000012',
    '30000000-0000-0000-0000-000000000003', 'AirSwift Cargo',
    'Dubai → Johannesburg AIR (Lighting & Accessories)', NULL,
    'AIR', 'Dubai, UAE', 'Johannesburg, South Africa',
    2, 3, 18.50, 'USD', 'per kg',
    ARRAY['lighting','air','UAE','express']
  ),
  (
    '80000000-0000-0000-0000-000000000005',
    '70000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000013',
    '30000000-0000-0000-0000-000000000003', 'AirSwift Cargo',
    'Istanbul → Nairobi AIR (Rugs & Textiles)', NULL,
    'AIR', 'Istanbul, Turkey', 'Nairobi, Kenya',
    3, 4, 14.00, 'USD', 'per kg',
    ARRAY['rugs','textiles','air','Turkey']
  ),
  (
    '80000000-0000-0000-0000-000000000006',
    '70000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000014',
    '30000000-0000-0000-0000-000000000003', 'AirSwift Cargo',
    'Milan → Cape Town AIR (Luxury Furniture Samples)', NULL,
    'AIR', 'Milan, Italy', 'Cape Town, South Africa',
    2, 3, 22.00, 'USD', 'per kg',
    ARRAY['luxury','Italian','air','samples']
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 10. Notifications ────────────────────────────────────────────────────────

INSERT INTO public.notifications (
  id, tenant_id, user_id, type, title, message, is_read, context_type, context_id
) VALUES
  (
    '90000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    'quote_received', 'New quote received',
    'SinoFurn Freight has submitted a quote of USD 3,800 for your Shanghai sofa order.',
    false, 'order', '50000000-0000-0000-0000-000000000001'
  ),
  (
    '90000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    'order_status_changed', 'Order in transit',
    'Your lighting fixture shipment from Dubai is now in transit. ETA 3 days.',
    false, 'order', '50000000-0000-0000-0000-000000000004'
  ),
  (
    '90000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000005',
    'order_delivered', 'Order delivered',
    'Your patio furniture shipment from Guangzhou has been delivered to ICD Nairobi.',
    true, 'order', '50000000-0000-0000-0000-000000000005'
  ),
  (
    '90000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'vendor_onboarded', 'New vendor approved',
    'AirSwift Cargo has completed onboarding and is now active on the platform.',
    false, 'vendor', '30000000-0000-0000-0000-000000000003'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 11. Compliance Rules ─────────────────────────────────────────────────────

INSERT INTO public.compliance_rules (
  id, tenant_id, rule_type, name, description, config,
  applies_to_countries, created_by
) VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    NULL,
    'sanctions_check',
    'OFAC Sanctions Screening',
    'All vendors and buyers must be screened against the OFAC SDN list before onboarding.',
    '{"provider":"ofac","auto_block":true}',
    '{}',
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    NULL,
    'document_required',
    'Bill of Lading Required on Confirmation',
    'A Bill of Lading must be uploaded within 48 hours of order confirmation.',
    '{"document_type":"bill_of_lading","hours_grace":48}',
    '{}',
    '20000000-0000-0000-0000-000000000001'
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'customs_classification',
    'HS Code Verification — Furniture',
    'All furniture imports must include a verified HS code in the 9401–9403 range.',
    '{"hs_range":["9401","9402","9403"],"block_on_missing":false}',
    ARRAY['ZA','KE','NG','GH','MZ','ZW'],
    '20000000-0000-0000-0000-000000000002'
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    'esg_threshold',
    'Minimum ESG Score for New Vendors',
    'Vendors must achieve an ESG score of at least 60 before being approved on the platform.',
    '{"min_score":60,"block_below_threshold":true}',
    '{}',
    '20000000-0000-0000-0000-000000000002'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 12. Compliance Evaluations ───────────────────────────────────────────────

INSERT INTO public.compliance_results (
  id, tenant_id, context_type, context_id, overall_status, check_results
) VALUES
  (
    'b0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'vendor_onboarding',
    '30000000-0000-0000-0000-000000000001',
    'passed',
    '[
      {"rule":"OFAC Sanctions Screening","status":"passed","detail":"No matches found."},
      {"rule":"Minimum ESG Score","status":"passed","detail":"ESG score 82.5 exceeds threshold of 60."}
    ]'
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'vendor_onboarding',
    '30000000-0000-0000-0000-000000000003',
    'passed',
    '[
      {"rule":"OFAC Sanctions Screening","status":"passed","detail":"No matches found."},
      {"rule":"Minimum ESG Score","status":"passed","detail":"ESG score 68.25 exceeds threshold of 60."}
    ]'
  ),
  (
    'b0000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    'order',
    '50000000-0000-0000-0000-000000000001',
    'pending',
    '[
      {"rule":"HS Code Verification","status":"pending","detail":"HS codes not yet provided by vendor."},
      {"rule":"Bill of Lading Required","status":"pending","detail":"Order not yet confirmed."}
    ]'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 13. Messages (order thread) ─────────────────────────────────────────────

INSERT INTO public.messages (id, order_id, tenant_id, sender_id, body) VALUES
  (
    'c0000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    'Hi, does your quote include fumigation and the phytosanitary certificate for South Africa customs?'
  ),
  (
    'c0000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000006',
    'Yes, the fumigation certificate is included. Phytosanitary is on request — additional USD 85 per container. I can add it to the quote if you confirm.'
  ),
  (
    'c0000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    'Please add the phytosanitary. Also, can you confirm cut-off dates for the next sailing?'
  ),
  (
    'c0000000-0000-0000-0000-000000000004',
    '50000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000006',
    'Confirmed. I''ve updated the quote. Next cut-off is Friday 25 April at 12:00 CST. Sailing ETA Durban 28 May.'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 14. Vendor Ratings ───────────────────────────────────────────────────────

INSERT INTO public.vendor_ratings (
  id, vendor_id, order_id, tenant_id, rated_by, rating, comment
) VALUES
  (
    'd0000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000005',
    5,
    'Excellent service. Delivered on time, documentation was perfect. Will use SinoFurn again for the next import.'
  ),
  (
    'd0000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    '50000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000004',
    4,
    'Good overall. One pallet arrived slightly damaged but was resolved quickly with an insurance claim.'
  ),
  (
    'd0000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000003',
    '50000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    4,
    'Fast and reliable. Communication could be slightly more proactive during transit.'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── 15. ESG Scores ───────────────────────────────────────────────────────────

INSERT INTO public.esg_scores (
  id, tenant_id, vendor_id, score, category_scores, assessment_date, assessed_by, created_by
) VALUES
  (
    'e0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    82.50,
    '{"environmental":78.0,"social":85.0,"governance":84.5}',
    '2026-01-15',
    'EcoVadis',
    '20000000-0000-0000-0000-000000000002'
  ),
  (
    'e0000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000003',
    68.25,
    '{"environmental":62.0,"social":71.0,"governance":71.75}',
    '2026-02-10',
    'EcoVadis',
    '20000000-0000-0000-0000-000000000002'
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Commit ───────────────────────────────────────────────────────────────────
COMMIT;

-- ─── Summary ──────────────────────────────────────────────────────────────────
-- Test credentials (local dev only — all passwords: Seed1234!)
-- ┌────────────────────────────────┬────────────────────────────┬──────────────────────┐
-- │ Email                          │ Role                       │ Tenant               │
-- ├────────────────────────────────┼────────────────────────────┼──────────────────────┤
-- │ super@sbdmm.dev                │ super_admin                │ Casa Bella Imports   │
-- │ admin@casabella.dev            │ tenant_admin               │ Casa Bella Imports   │
-- │ admin@nordicfreight.dev        │ tenant_admin               │ Nordic Freight Co.   │
-- │ buyer1@casabella.dev           │ buyer                      │ Casa Bella Imports   │
-- │ buyer2@casabella.dev           │ buyer                      │ Casa Bella Imports   │
-- │ vendor1@casabella.dev          │ logistics_provider         │ Casa Bella Imports   │
-- │ vendor2@casabella.dev          │ vendor                     │ Casa Bella Imports   │
-- │ vendor3@casabella.dev          │ logistics_provider         │ Casa Bella Imports   │
-- └────────────────────────────────┴────────────────────────────┴──────────────────────┘
