-- Four-group RBAC: buyer, artisan, vendor, admin.
-- Supabase Auth owns identity; this schema owns authorization attributes.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname='admin_role'
  ) THEN
    CREATE TYPE public.admin_role AS ENUM (
      'tier1_support', 'tier2_support', 'tier3_security',
      'logistics_manager', 'executive', 'super_admin'
    );
  END IF;
END $$;

-- Safe when an earlier run created only part of the enum.
ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'tier1_support';
ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'tier2_support';
ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'tier3_security';
ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'logistics_manager';
ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'executive';
ALTER TYPE public.admin_role ADD VALUE IF NOT EXISTS 'super_admin';

ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS admin_role public.admin_role;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}';

-- Rename in place so existing RLS policy dependencies remain valid. The legacy
-- super_admin enum label is retained for PostgreSQL migration safety, but the
-- constraint below makes it impossible to assign to a profile.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='platform_role' AND e.enumlabel='logistics_provider')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='platform_role' AND e.enumlabel='artisan') THEN
    ALTER TYPE public.platform_role RENAME VALUE 'logistics_provider' TO 'artisan';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='platform_role' AND e.enumlabel='tenant_admin')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='platform_role' AND e.enumlabel='admin') THEN
    ALTER TYPE public.platform_role RENAME VALUE 'tenant_admin' TO 'admin';
  END IF;
END $$;

-- Handles databases where both the legacy and replacement label already exist.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='platform_role' AND e.enumlabel='logistics_provider')
     AND EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='platform_role' AND e.enumlabel='artisan') THEN
    UPDATE public.user_profiles SET role='artisan'::public.platform_role WHERE role::text='logistics_provider';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='platform_role' AND e.enumlabel='tenant_admin')
     AND EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='platform_role' AND e.enumlabel='admin') THEN
    UPDATE public.user_profiles SET role='admin'::public.platform_role WHERE role::text='tenant_admin';
  END IF;
END $$;

UPDATE public.user_profiles
SET role = 'admin'::public.platform_role, admin_role = 'super_admin'::public.admin_role
WHERE role::text = 'super_admin';

UPDATE public.user_profiles
SET admin_role = COALESCE(admin_role, CASE
  WHEN full_name ILIKE '%super%' THEN 'super_admin'::admin_role
  ELSE 'logistics_manager'::admin_role
END)
WHERE role::text = 'admin' AND admin_role IS NULL;

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_admin_role_consistency;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_admin_role_consistency
CHECK (
  role::text IN ('buyer', 'artisan', 'vendor', 'admin')
  AND ((role::text = 'admin' AND admin_role IS NOT NULL)
  OR (role::text <> 'admin' AND admin_role IS NULL))
);

CREATE OR REPLACE FUNCTION public.permissions_for(p_role platform_role, p_admin_role admin_role)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_role = 'buyer' THEN ARRAY['design:create','order:create']::text[]
    WHEN p_role = 'artisan' THEN ARRAY['order:fulfil','bom:read','bom:manage']::text[]
    WHEN p_role = 'vendor' THEN ARRAY['bom:read','quote:create']::text[]
    WHEN p_admin_role = 'tier1_support' THEN ARRAY['support:tier1']::text[]
    WHEN p_admin_role = 'tier2_support' THEN ARRAY['support:tier1','support:tier2']::text[]
    WHEN p_admin_role = 'tier3_security' THEN ARRAY['support:tier1','support:tier2','security:manage']::text[]
    WHEN p_admin_role = 'logistics_manager' THEN ARRAY['bom:read','bom:manage','quote:manage','logistics:manage']::text[]
    WHEN p_admin_role = 'executive' THEN ARRAY['analytics:read']::text[]
    WHEN p_admin_role = 'super_admin' THEN ARRAY['*']::text[]
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_authorization(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  user_id uuid, tenant_id uuid, role platform_role, admin_role admin_role,
  permissions text[], is_active boolean, mfa_required boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.tenant_id, p.role, p.admin_role,
         (public.permissions_for(p.role, p.admin_role) || p.permissions),
         p.is_active,
         p.mfa_required
  FROM public.user_profiles p
  WHERE p.id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_authorization(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_authorization(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS platform_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.user_profiles WHERE id = auth.uid() AND is_active LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.has_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.get_user_authorization(auth.uid()) a
    WHERE a.is_active AND ('*' = ANY(a.permissions) OR p_permission = ANY(a.permissions))
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.get_my_role() = 'admin'::platform_role $$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin' AND admin_role = 'super_admin' AND is_active
  )
$$;

-- Compatibility for policies created before this migration.
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_permission('admin:manage') $$;

-- New authorization columns must never be writable through the generic
-- self-service profile policy. Role/capability changes go through audited APIs.
DROP POLICY IF EXISTS "user_profiles_update_self" ON public.user_profiles;
CREATE POLICY "user_profiles_update_self"
  ON public.user_profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = public.get_my_role()
    AND tenant_id = public.get_my_tenant_id()
    AND admin_role IS NOT DISTINCT FROM (
      SELECT p.admin_role FROM public.user_profiles p WHERE p.id = auth.uid()
    )
    AND permissions = (
      SELECT p.permissions FROM public.user_profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "user_profiles_update_tenant_admin" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert_admin" ON public.user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert_super_admin" ON public.user_profiles;
CREATE POLICY "user_profiles_insert_super_admin"
  ON public.user_profiles FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, tenant_id, full_name, role)
  VALUES (
    NEW.id,
    '00000000-0000-0000-0000-000000000001',
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    'buyer'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.get_user_authorization(uuid) IS
  'Authoritative SECURITY DEFINER RBAC resolver. Identity comes exclusively from Supabase Auth.';
