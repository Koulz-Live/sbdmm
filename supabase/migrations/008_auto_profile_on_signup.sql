-- ─── Migration 008: Auto-create user_profiles on OAuth sign-up ───────────────
--
-- Problem: When a user signs up via Google OAuth, Supabase creates a row in
-- auth.users but nothing creates the matching public.user_profiles row.
-- AuthContext.loadProfile() then returns null, and the user is stuck.
--
-- Solution:
--   1. Ensure a platform-level "buyer" tenant exists (slug: 'platform-buyers').
--      All Google OAuth sign-ups land here as role = 'buyer'.
--      A tenant_admin can later move users to a specific company tenant.
--   2. A trigger function fires AFTER INSERT on auth.users and inserts a
--      user_profiles row using metadata from the OAuth provider (full_name).
--   3. The trigger is attached to auth.users via Supabase's allowed mechanism.
--
-- NOTES:
--   • The function runs as SECURITY DEFINER so it can write to user_profiles
--     despite RLS (the trigger runs as the function owner, not the new user).
--   • full_name falls back to the email local-part if not provided.
--   • Email/password sign-ups also fire this trigger — that is intentional;
--     admins are always created via the API (service role), which bypasses
--     auth.users insert, so they are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Step 1: Ensure the platform-buyers tenant exists ────────────────────────
INSERT INTO public.tenants (id, name, slug, status, plan, region)
VALUES (
  '00000000-0000-0000-0000-000000000001',   -- fixed UUID so trigger can hard-reference it
  'Platform Buyers',
  'platform-buyers',
  'active',
  'starter',
  'ZA'                                       -- South Africa (adjust if needed)
)
ON CONFLICT (id) DO NOTHING;

-- ─── Step 2: Trigger function ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text;
BEGIN
  -- Pull full_name from OAuth metadata; fall back to email local-part
  v_full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.user_profiles (id, tenant_id, full_name, role)
  VALUES (
    NEW.id,
    '00000000-0000-0000-0000-000000000001',  -- platform-buyers tenant
    v_full_name,
    'buyer'
  )
  ON CONFLICT (id) DO NOTHING;              -- idempotent: never overwrite existing profiles

  RETURN NEW;
END;
$$;

-- ─── Step 3: Attach trigger to auth.users ─────────────────────────────────────
-- Supabase allows triggers on auth.users as long as the function is in public schema.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- ─── Step 4: Back-fill the existing Google user ───────────────────────────────
-- Khulekani signed up before this trigger existed.
-- Insert their profile now if not already present.
INSERT INTO public.user_profiles (id, tenant_id, full_name, role)
SELECT
  au.id,
  '00000000-0000-0000-0000-000000000001',
  COALESCE(
    au.raw_user_meta_data ->> 'full_name',
    au.raw_user_meta_data ->> 'name',
    split_part(au.email, '@', 1)
  ),
  'buyer'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_profiles up WHERE up.id = au.id
);
