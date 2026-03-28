-- ============================================================
-- Migration: 002_rls_policies.sql
-- SBDMM Platform — Row Level Security Policies
-- ============================================================
--
-- SECURITY ARCHITECTURE:
-- RLS is the database-level enforcement of multi-tenancy and access control.
-- It is the LAST LINE OF DEFENCE — even if application code has a bug,
-- RLS prevents cross-tenant data leakage.
--
-- DESIGN PRINCIPLES:
-- 1. RLS ENABLED on every tenant-owned table — no exceptions
-- 2. Default DENY — tables have no access unless explicitly granted
-- 3. Tenant isolation: users can only access rows where tenant_id = their tenant
-- 4. Role awareness: policies use app metadata from the JWT to enforce roles
-- 5. audit_logs: append-only — INSERT allowed, UPDATE/DELETE denied
-- 6. super_admin uses service role (bypasses RLS) — must be audit-logged
--
-- HOW SUPABASE IDENTIFIES THE CURRENT USER:
-- auth.uid()       → the authenticated user's UUID
-- auth.jwt()       → the full JWT claims object
--
-- HOW WE IDENTIFY TENANT:
-- We use a helper function that reads tenant_id from user_profiles.
-- This is authoritative — we do NOT trust JWT claims for tenant_id.
--
-- IMPORTANT: The helper function runs with SECURITY DEFINER to allow
-- it to read user_profiles even before RLS is satisfied.
-- ============================================================

-- ─── Enable RLS on All Tables ─────────────────────────────────────────────────
ALTER TABLE public.tenants                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_optimization_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_evaluations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esg_scores                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_credentials            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs                 ENABLE ROW LEVEL SECURITY;

-- ─── Helper Functions ─────────────────────────────────────────────────────────

-- Returns the current user's tenant_id from user_profiles.
-- SECURITY DEFINER ensures this runs as the function owner, not the calling user.
-- This is necessary because user_profiles itself is RLS-protected.
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT tenant_id
  FROM public.user_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- Returns the current user's role from user_profiles.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS platform_role
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role
  FROM public.user_profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- Returns true if the current user is an active super_admin.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
  );
$$;

-- Returns true if the current user is an active tenant_admin for their tenant.
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND role = 'tenant_admin'
      AND is_active = true
  );
$$;

-- ─── TENANTS Table Policies ────────────────────────────────────────────────────
-- Users see only their own tenant. Super admin sees all.

CREATE POLICY "tenants_select_own"
  ON public.tenants
  FOR SELECT
  USING (
    id = public.get_my_tenant_id()
    OR public.is_super_admin()
  );

-- Only super admin can create tenants (tenant provisioning is privileged)
CREATE POLICY "tenants_insert_super_admin_only"
  ON public.tenants
  FOR INSERT
  WITH CHECK (public.is_super_admin());

-- Tenant admin can update their own tenant settings; super admin can update any
CREATE POLICY "tenants_update_privileged"
  ON public.tenants
  FOR UPDATE
  USING (
    (id = public.get_my_tenant_id() AND public.is_tenant_admin())
    OR public.is_super_admin()
  );

-- Only super admin can delete (soft delete only — use deleted_at)
-- HUMAN DECISION: Consider disabling physical deletes entirely for compliance
CREATE POLICY "tenants_delete_super_admin_only"
  ON public.tenants
  FOR DELETE
  USING (public.is_super_admin());

-- ─── USER_PROFILES Table Policies ──────────────────────────────────────────────

-- Users can see their own profile
-- Tenant admins can see all profiles within their tenant
-- Super admin sees all profiles
CREATE POLICY "user_profiles_select"
  ON public.user_profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR (tenant_id = public.get_my_tenant_id() AND public.is_tenant_admin())
    OR public.is_super_admin()
  );

-- Users can update their own non-privileged fields
-- NOTE: Role changes must go through the admin API, not direct client updates
CREATE POLICY "user_profiles_update_self"
  ON public.user_profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- SECURITY: Users cannot change their own role or tenant_id through this policy
    -- Role/tenant changes require tenant_admin or super_admin via separate policies
    AND role = (SELECT role FROM public.user_profiles WHERE id = auth.uid())
    AND tenant_id = (SELECT tenant_id FROM public.user_profiles WHERE id = auth.uid())
  );

-- Tenant admins can update profiles within their tenant (e.g., suspend a user)
CREATE POLICY "user_profiles_update_tenant_admin"
  ON public.user_profiles
  FOR UPDATE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_admin()
    -- SECURITY: Tenant admins cannot promote users to super_admin
    AND role != 'super_admin'
  );

-- Super admin can update any profile
CREATE POLICY "user_profiles_update_super_admin"
  ON public.user_profiles
  FOR UPDATE
  USING (public.is_super_admin());

-- Insert: new users are created via Supabase auth trigger or admin API
-- Tenant admins can invite new users to their tenant
CREATE POLICY "user_profiles_insert_admin"
  ON public.user_profiles
  FOR INSERT
  WITH CHECK (
    (tenant_id = public.get_my_tenant_id() AND public.is_tenant_admin()
      AND role != 'super_admin')  -- Tenant admin cannot create super admins
    OR public.is_super_admin()
  );

-- ─── VENDORS Table Policies ────────────────────────────────────────────────────

CREATE POLICY "vendors_select_tenant"
  ON public.vendors
  FOR SELECT
  USING (
    tenant_id = public.get_my_tenant_id()
    OR public.is_super_admin()
  );

CREATE POLICY "vendors_insert_tenant"
  ON public.vendors
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND (
      public.get_my_role() IN ('vendor', 'tenant_admin')
      OR public.is_super_admin()
    )
  );

CREATE POLICY "vendors_update_tenant"
  ON public.vendors
  FOR UPDATE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND (public.is_tenant_admin() OR public.is_super_admin())
  );

-- ─── ORDERS Table Policies ────────────────────────────────────────────────────

-- All authenticated users in a tenant can see tenant orders
-- BUT: role-specific visibility is enforced at the application layer
-- (buyers see own orders, providers see assigned orders)
CREATE POLICY "orders_select_tenant"
  ON public.orders
  FOR SELECT
  USING (
    tenant_id = public.get_my_tenant_id()
    OR public.is_super_admin()
  );

-- Buyers and vendors can create orders within their tenant
CREATE POLICY "orders_insert_tenant"
  ON public.orders
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND public.get_my_role() IN ('buyer', 'vendor', 'tenant_admin')
    -- SECURITY: Ensure created_by matches the authenticated user
    AND created_by = auth.uid()
  );

-- Status updates are restricted — logistics providers and admins only
CREATE POLICY "orders_update_tenant"
  ON public.orders
  FOR UPDATE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.get_my_role() IN ('logistics_provider', 'tenant_admin')
    OR public.is_super_admin()
  );

-- ─── QUOTES Table Policies ────────────────────────────────────────────────────

CREATE POLICY "quotes_select_tenant"
  ON public.quotes
  FOR SELECT
  USING (
    tenant_id = public.get_my_tenant_id()
    OR public.is_super_admin()
  );

CREATE POLICY "quotes_insert_provider"
  ON public.quotes
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND public.get_my_role() IN ('logistics_provider', 'tenant_admin')
    AND created_by = auth.uid()
  );

CREATE POLICY "quotes_update_tenant"
  ON public.quotes
  FOR UPDATE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.get_my_role() IN ('logistics_provider', 'tenant_admin')
    OR public.is_super_admin()
  );

-- ─── TRADE DOCUMENTS Table Policies ───────────────────────────────────────────

CREATE POLICY "trade_documents_select_tenant"
  ON public.trade_documents
  FOR SELECT
  USING (
    tenant_id = public.get_my_tenant_id()
    OR public.is_super_admin()
  );

-- Only authenticated tenant members can upload documents
CREATE POLICY "trade_documents_insert_tenant"
  ON public.trade_documents
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND created_by = auth.uid()
  );

-- Only admins can review/update document status
CREATE POLICY "trade_documents_update_admin"
  ON public.trade_documents
  FOR UPDATE
  USING (
    tenant_id = public.get_my_tenant_id()
    AND (public.is_tenant_admin() OR public.is_super_admin())
  );

-- ─── COMPLIANCE RULES Table Policies ──────────────────────────────────────────

-- Everyone in the tenant can read compliance rules
CREATE POLICY "compliance_rules_select"
  ON public.compliance_rules
  FOR SELECT
  USING (
    tenant_id = public.get_my_tenant_id()
    OR tenant_id IS NULL   -- Global rules visible to all authenticated users
    OR public.is_super_admin()
  );

-- Only tenant admins can manage tenant-level rules; super admin manages global rules
CREATE POLICY "compliance_rules_insert"
  ON public.compliance_rules
  FOR INSERT
  WITH CHECK (
    (tenant_id = public.get_my_tenant_id() AND public.is_tenant_admin())
    OR (tenant_id IS NULL AND public.is_super_admin())
    OR public.is_super_admin()
  );

CREATE POLICY "compliance_rules_update"
  ON public.compliance_rules
  FOR UPDATE
  USING (
    (tenant_id = public.get_my_tenant_id() AND public.is_tenant_admin())
    OR public.is_super_admin()
  );

-- ─── COMPLIANCE EVALUATIONS Table Policies ────────────────────────────────────

CREATE POLICY "compliance_evaluations_select_tenant"
  ON public.compliance_evaluations
  FOR SELECT
  USING (
    tenant_id = public.get_my_tenant_id()
    OR public.is_super_admin()
  );

-- Application (service role) inserts evaluations — no user-level insert needed
-- HUMAN DECISION: If you want admins to trigger manual evaluations via the client,
-- add an insert policy for tenant_admin.

-- ─── API CREDENTIALS Table Policies ───────────────────────────────────────────

-- SECURITY: Tenant members can see their API key records (prefix only — hash is internal)
-- Only admins can create/manage API credentials
CREATE POLICY "api_credentials_select_admin"
  ON public.api_credentials
  FOR SELECT
  USING (
    (tenant_id = public.get_my_tenant_id() AND public.is_tenant_admin())
    OR public.is_super_admin()
  );

CREATE POLICY "api_credentials_insert_admin"
  ON public.api_credentials
  FOR INSERT
  WITH CHECK (
    (tenant_id = public.get_my_tenant_id() AND public.is_tenant_admin())
    OR public.is_super_admin()
  );

CREATE POLICY "api_credentials_update_admin"
  ON public.api_credentials
  FOR UPDATE
  USING (
    (tenant_id = public.get_my_tenant_id() AND public.is_tenant_admin())
    OR public.is_super_admin()
  );

-- ─── NOTIFICATIONS Table Policies ─────────────────────────────────────────────

-- Users can only see their own notifications
CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid() OR public.is_super_admin());

-- Users can mark their own notifications as read
CREATE POLICY "notifications_update_own"
  ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Application (service role) creates notifications — no user-level insert
-- Notifications for a tenant can also be created by tenant_admin
CREATE POLICY "notifications_insert_admin"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    (tenant_id = public.get_my_tenant_id() AND public.is_tenant_admin())
    OR public.is_super_admin()
  );

-- ─── AUDIT LOGS Table Policies ────────────────────────────────────────────────
-- SECURITY: Audit logs are append-only. NO UPDATE or DELETE policies.
-- The service role (used by the API) inserts audit logs directly.
-- Users and admins can only READ audit logs.

-- Users can see their own audit events
CREATE POLICY "audit_logs_select_own"
  ON public.audit_logs
  FOR SELECT
  USING (actor_id = auth.uid()::text);

-- Tenant admins can see all audit events for their tenant
CREATE POLICY "audit_logs_select_tenant_admin"
  ON public.audit_logs
  FOR SELECT
  USING (
    tenant_id = public.get_my_tenant_id()::text
    AND public.is_tenant_admin()
  );

-- Super admin can see all audit events
CREATE POLICY "audit_logs_select_super_admin"
  ON public.audit_logs
  FOR SELECT
  USING (public.is_super_admin());

-- SECURITY: NO INSERT policy for audit_logs via user JWT.
-- Only the service role (API backend) can write audit logs.
-- This prevents users from fabricating audit records.

-- SECURITY: NO UPDATE or DELETE policies on audit_logs — ever.
-- Audit records are immutable by design.

-- ─── Grant Minimal Permissions to Authenticated Role ─────────────────────────
-- HUMAN DECISION: Review these grants. The authenticated role is any logged-in user.
-- More restrictive grants can be applied at the schema/table level.

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.vendors TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quotes TO authenticated;
GRANT SELECT, INSERT ON public.trade_documents TO authenticated;
GRANT UPDATE ON public.trade_documents TO authenticated;
GRANT SELECT ON public.compliance_rules TO authenticated;
GRANT INSERT ON public.compliance_rules TO authenticated;
GRANT UPDATE ON public.compliance_rules TO authenticated;
GRANT SELECT ON public.compliance_evaluations TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT INSERT ON public.notifications TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.api_credentials TO authenticated;
GRANT SELECT, INSERT ON public.esg_scores TO authenticated;
GRANT SELECT, INSERT ON public.route_optimization_requests TO authenticated;

-- Sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
