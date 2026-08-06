/*
# Multi-tenant Auth System

## Overview
Adds full multi-tenant authentication to the Charter Ops app. Introduces tenants (organizations), a join table linking auth users to tenants with roles, and tenant_id scoping on all existing data tables.

## New Tables
### tenants
Organization record with branding, domain, Stripe, GHL config.
### tenant_users
Links auth.users to tenants with role (super_admin | tenant_admin).

## Modified Tables
- listings, reservations, ghl_opportunities, ghl_contacts, ghl_pipeline_stages, opportunity_notes — add tenant_id column.

## Security
- RLS on all tables, tenant-scoped for tenant_admins, full access for super_admins.
- Public anon SELECT on active listings + active tenants for public landing pages.
*/

-- ============================================
-- 1. CREATE TABLES FIRST
-- ============================================

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  primary_color text DEFAULT '#0d9488',
  secondary_color text DEFAULT '#0f766e',
  logo_url text,
  hero_title text,
  hero_subtitle text,
  hero_image_url text,
  domain text UNIQUE,
  landing_page_url text,
  template text NOT NULL DEFAULT 'default' CHECK (template IN ('default','premium','custom')),
  phone text,
  email text,
  stripe_account_id text,
  stripe_connected boolean NOT NULL DEFAULT false,
  ghl_pipeline_id text,
  ghl_location_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'tenant_admin' CHECK (role IN ('super_admin','tenant_admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tenant_id)
);

-- ============================================
-- 2. HELPER FUNCTIONS (tables exist now)
-- ============================================

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM tenant_users
  WHERE user_id = auth.uid()
  AND role = 'tenant_admin'
  LIMIT 1;
$$;

-- ============================================
-- 3. ADD tenant_id TO EXISTING TABLES
-- ============================================
ALTER TABLE listings ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE ghl_opportunities ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE ghl_contacts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE ghl_pipeline_stages ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE opportunity_notes ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

-- Indexes for tenant filtering
CREATE INDEX IF NOT EXISTS idx_listings_tenant_id ON listings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_id ON reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_tenant_id ON ghl_opportunities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_tenant_id ON ghl_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ghl_pipeline_stages_tenant_id ON ghl_pipeline_stages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_notes_tenant_id ON opportunity_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON tenant_users(tenant_id);

-- ============================================
-- 4. ENABLE RLS
-- ============================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. TENANTS POLICIES
-- ============================================
DROP POLICY IF EXISTS "select_tenants" ON tenants;
CREATE POLICY "select_tenants" ON tenants FOR SELECT
  TO authenticated USING (
    is_super_admin() OR id IN (
      SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_tenants" ON tenants;
CREATE POLICY "insert_tenants" ON tenants FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "update_tenants" ON tenants;
CREATE POLICY "update_tenants" ON tenants FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "delete_tenants" ON tenants;
CREATE POLICY "delete_tenants" ON tenants FOR DELETE
  TO authenticated USING (is_super_admin());

-- Public read for active tenants (for public landing pages by slug/domain)
DROP POLICY IF EXISTS "anon_select_active_tenants" ON tenants;
CREATE POLICY "anon_select_active_tenants" ON tenants FOR SELECT
  TO anon, authenticated USING (is_active = true);

-- ============================================
-- 6. TENANT_USERS POLICIES
-- ============================================
DROP POLICY IF EXISTS "select_own_tenant_users" ON tenant_users;
CREATE POLICY "select_own_tenant_users" ON tenant_users FOR SELECT
  TO authenticated USING (
    user_id = auth.uid() OR is_super_admin()
  );

DROP POLICY IF EXISTS "insert_tenant_users" ON tenant_users;
CREATE POLICY "insert_tenant_users" ON tenant_users FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "update_tenant_users" ON tenant_users;
CREATE POLICY "update_tenant_users" ON tenant_users FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "delete_tenant_users" ON tenant_users;
CREATE POLICY "delete_tenant_users" ON tenant_users FOR DELETE
  TO authenticated USING (is_super_admin());

-- ============================================
-- 7. DATA TABLE POLICIES
-- ============================================

-- LISTINGS — drop old anon policies, add tenant-scoped
DROP POLICY IF EXISTS "anon_select_listings" ON listings;
DROP POLICY IF EXISTS "anon_insert_listings" ON listings;
DROP POLICY IF EXISTS "anon_update_listings" ON listings;
DROP POLICY IF EXISTS "anon_delete_listings" ON listings;

CREATE POLICY "public_select_active_listings" ON listings FOR SELECT
  TO anon, authenticated USING (is_active = true);

CREATE POLICY "auth_select_listings" ON listings FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_insert_listings" ON listings FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_update_listings" ON listings FOR UPDATE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_delete_listings" ON listings FOR DELETE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- RESERVATIONS
DROP POLICY IF EXISTS "anon_select_reservations" ON reservations;
DROP POLICY IF EXISTS "anon_insert_reservations" ON reservations;
DROP POLICY IF EXISTS "anon_update_reservations" ON reservations;
DROP POLICY IF EXISTS "anon_delete_reservations" ON reservations;

CREATE POLICY "auth_select_reservations" ON reservations FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_insert_reservations" ON reservations FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_update_reservations" ON reservations FOR UPDATE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_delete_reservations" ON reservations FOR DELETE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- GHL_OPPORTUNITIES
DROP POLICY IF EXISTS "anon_select_opps" ON ghl_opportunities;
DROP POLICY IF EXISTS "anon_insert_opps" ON ghl_opportunities;
DROP POLICY IF EXISTS "anon_update_opps" ON ghl_opportunities;
DROP POLICY IF EXISTS "anon_delete_opps" ON ghl_opportunities;

CREATE POLICY "auth_select_opps" ON ghl_opportunities FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_insert_opps" ON ghl_opportunities FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_update_opps" ON ghl_opportunities FOR UPDATE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_delete_opps" ON ghl_opportunities FOR DELETE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- GHL_CONTACTS
DROP POLICY IF EXISTS "anon_select_contacts" ON ghl_contacts;
DROP POLICY IF EXISTS "anon_insert_contacts" ON ghl_contacts;
DROP POLICY IF EXISTS "anon_update_contacts" ON ghl_contacts;
DROP POLICY IF EXISTS "anon_delete_contacts" ON ghl_contacts;

CREATE POLICY "auth_select_contacts" ON ghl_contacts FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_insert_contacts" ON ghl_contacts FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_update_contacts" ON ghl_contacts FOR UPDATE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_delete_contacts" ON ghl_contacts FOR DELETE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- GHL_PIPELINE_STAGES
DROP POLICY IF EXISTS "anon_select_stages" ON ghl_pipeline_stages;
DROP POLICY IF EXISTS "anon_insert_stages" ON ghl_pipeline_stages;
DROP POLICY IF EXISTS "anon_update_stages" ON ghl_pipeline_stages;
DROP POLICY IF EXISTS "anon_delete_stages" ON ghl_pipeline_stages;

CREATE POLICY "auth_select_stages" ON ghl_pipeline_stages FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_insert_stages" ON ghl_pipeline_stages FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_update_stages" ON ghl_pipeline_stages FOR UPDATE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_delete_stages" ON ghl_pipeline_stages FOR DELETE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- OPPORTUNITY_NOTES
DROP POLICY IF EXISTS "anon_delete_notes" ON opportunity_notes;
DROP POLICY IF EXISTS "anon_insert_notes" ON opportunity_notes;
DROP POLICY IF EXISTS "anon_select_notes" ON opportunity_notes;
DROP POLICY IF EXISTS "anon_update_notes" ON opportunity_notes;

CREATE POLICY "auth_select_notes" ON opportunity_notes FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_insert_notes" ON opportunity_notes FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_update_notes" ON opportunity_notes FOR UPDATE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

CREATE POLICY "auth_delete_notes" ON opportunity_notes FOR DELETE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- ============================================
-- 8. UPDATED_AT TRIGGER FOR TENANTS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_tenants_updated_at ON tenants;
CREATE TRIGGER trigger_tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();