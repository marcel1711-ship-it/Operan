/*
# Create Native CRM Tables — Customers, Pipelines, Pipeline Stages, Opportunities, Opportunity Notes, Activity Log

## Overview
Replaces GHL contacts, opportunities, pipeline stages, and notes with native multi-tenant tables.

## New Tables
- customers: tenant-scoped customer records (replaces ghl_contacts)
- pipelines: tenant-scoped customizable pipelines
- pipeline_stages: customizable stages per pipeline with stable system_key + stage_type
- opportunities: native opportunities (replaces ghl_opportunities), may exist without reservation/listing
- opportunity_notes_native: notes linked to native opportunities via FK
- activity_log: audit trail for all critical operations

## Security
- All tables have RLS enabled with tenant isolation via is_super_admin() OR tenant_id = current_tenant_id()
- No anon access on any CRM table
*/

-- ============================================
-- 1. CUSTOMERS
-- ============================================

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  email text,
  normalized_email text,
  phone text,
  normalized_phone text,
  company_name text,
  tags text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'manual',
  notes text,
  preferred_language text DEFAULT 'en',
  marketing_consent boolean NOT NULL DEFAULT false,
  sms_consent boolean NOT NULL DEFAULT false,
  whatsapp_consent boolean NOT NULL DEFAULT false,
  last_activity_at timestamptz,
  legacy_ghl_contact_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_email
  ON customers(tenant_id, normalized_email)
  WHERE normalized_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers(tenant_id, normalized_phone)
  WHERE normalized_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_legacy_ghl ON customers(legacy_ghl_contact_id)
  WHERE legacy_ghl_contact_id IS NOT NULL;

DROP POLICY IF EXISTS "select_customers" ON customers;
CREATE POLICY "select_customers" ON customers FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "insert_customers" ON customers;
CREATE POLICY "insert_customers" ON customers FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "update_customers" ON customers;
CREATE POLICY "update_customers" ON customers FOR UPDATE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "delete_customers" ON customers;
CREATE POLICY "delete_customers" ON customers FOR DELETE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================
-- 2. PIPELINES
-- ============================================

CREATE TABLE IF NOT EXISTS pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pipelines_one_default
  ON pipelines(tenant_id)
  WHERE is_default = true AND is_active = true AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pipelines_tenant_id ON pipelines(tenant_id);

DROP POLICY IF EXISTS "select_pipelines" ON pipelines;
CREATE POLICY "select_pipelines" ON pipelines FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "insert_pipelines" ON pipelines;
CREATE POLICY "insert_pipelines" ON pipelines FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "update_pipelines" ON pipelines;
CREATE POLICY "update_pipelines" ON pipelines FOR UPDATE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "delete_pipelines" ON pipelines;
CREATE POLICY "delete_pipelines" ON pipelines FOR DELETE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================
-- 3. PIPELINE_STAGES
-- ============================================

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  system_key text NOT NULL DEFAULT 'custom',
  stage_type text NOT NULL DEFAULT 'custom' CHECK (stage_type IN (
    'open', 'ready', 'in_progress', 'completed', 'cancelled', 'won', 'lost', 'custom'
  )),
  stage_order int NOT NULL DEFAULT 0,
  color text DEFAULT '#6b7280',
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  behavior_configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant_id ON pipeline_stages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline_id ON pipeline_stages(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_order ON pipeline_stages(pipeline_id, stage_order);

DROP POLICY IF EXISTS "select_pipeline_stages" ON pipeline_stages;
CREATE POLICY "select_pipeline_stages" ON pipeline_stages FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "insert_pipeline_stages" ON pipeline_stages;
CREATE POLICY "insert_pipeline_stages" ON pipeline_stages FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "update_pipeline_stages" ON pipeline_stages;
CREATE POLICY "update_pipeline_stages" ON pipeline_stages FOR UPDATE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "delete_pipeline_stages" ON pipeline_stages;
CREATE POLICY "delete_pipeline_stages" ON pipeline_stages FOR DELETE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================
-- 4. OPPORTUNITIES
-- ============================================

CREATE TABLE IF NOT EXISTS opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  name text NOT NULL,
  monetary_value numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'won', 'lost', 'abandoned'
  )),
  assigned_to text,
  source text NOT NULL DEFAULT 'manual',
  expected_service_date timestamptz,
  last_status_change_at timestamptz,
  legacy_ghl_opportunity_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_id ON opportunities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_pipeline_id ON opportunities(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage_id ON opportunities(stage_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_customer_id ON opportunities(customer_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_listing_id ON opportunities(listing_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_reservation_id ON opportunities(reservation_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_legacy_ghl ON opportunities(legacy_ghl_opportunity_id)
  WHERE legacy_ghl_opportunity_id IS NOT NULL;

DROP POLICY IF EXISTS "select_opportunities" ON opportunities;
CREATE POLICY "select_opportunities" ON opportunities FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "insert_opportunities" ON opportunities;
CREATE POLICY "insert_opportunities" ON opportunities FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "update_opportunities" ON opportunities;
CREATE POLICY "update_opportunities" ON opportunities FOR UPDATE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "delete_opportunities" ON opportunities;
CREATE POLICY "delete_opportunities" ON opportunities FOR DELETE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================
-- 5. OPPORTUNITY_NOTES (native)
-- ============================================

CREATE TABLE IF NOT EXISTS opportunity_notes_native (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  body text NOT NULL,
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE opportunity_notes_native ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_opp_notes_native_tenant ON opportunity_notes_native(tenant_id);
CREATE INDEX IF NOT EXISTS idx_opp_notes_native_opp ON opportunity_notes_native(opportunity_id);

DROP POLICY IF EXISTS "select_opp_notes_native" ON opportunity_notes_native;
CREATE POLICY "select_opp_notes_native" ON opportunity_notes_native FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "insert_opp_notes_native" ON opportunity_notes_native;
CREATE POLICY "insert_opp_notes_native" ON opportunity_notes_native FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "update_opp_notes_native" ON opportunity_notes_native;
CREATE POLICY "update_opp_notes_native" ON opportunity_notes_native FOR UPDATE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "delete_opp_notes_native" ON opportunity_notes_native;
CREATE POLICY "delete_opp_notes_native" ON opportunity_notes_native FOR DELETE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================
-- 6. ACTIVITY_LOG
-- ============================================

CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_activity_log_tenant ON activity_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

DROP POLICY IF EXISTS "select_activity_log" ON activity_log;
CREATE POLICY "select_activity_log" ON activity_log FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "insert_activity_log" ON activity_log;
CREATE POLICY "insert_activity_log" ON activity_log FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================
-- 7. UPDATED_AT TRIGGERS (using DO block for idempotency)
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_customers_updated_at') THEN
    CREATE TRIGGER trigger_customers_updated_at
      BEFORE UPDATE ON customers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_pipelines_updated_at') THEN
    CREATE TRIGGER trigger_pipelines_updated_at
      BEFORE UPDATE ON pipelines
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_pipeline_stages_updated_at') THEN
    CREATE TRIGGER trigger_pipeline_stages_updated_at
      BEFORE UPDATE ON pipeline_stages
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_opportunities_updated_at') THEN
    CREATE TRIGGER trigger_opportunities_updated_at
      BEFORE UPDATE ON opportunities
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_opp_notes_native_updated_at') THEN
    CREATE TRIGGER trigger_opp_notes_native_updated_at
      BEFORE UPDATE ON opportunity_notes_native
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;