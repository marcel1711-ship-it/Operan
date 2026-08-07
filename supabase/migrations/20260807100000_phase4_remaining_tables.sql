/*
  Phase 4 — Remaining Tables

  Creates the 7 low-priority tables referenced in code but not yet
  applied to the live database. All RLS policies use is_tenant_member()
  (not current_tenant_id() which does not exist).

  Tables:
    1. platform_integrations
    2. opportunity_notes_native
    3. waiver_templates (+ form_fields, listing_id columns)
    4. invoices
    5. provider_events
    6. reservation_status_labels (+ seed data)
    7. platform_secret_audit_log
*/

-- ============================================================
-- 1. platform_integrations
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  provider text NOT NULL,
  environment text NOT NULL DEFAULT 'test',
  connection_status text NOT NULL DEFAULT 'not_configured',
  external_account_id text,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  webhook_status text NOT NULL DEFAULT 'not_configured',
  webhook_last_event_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_integrations_super_admin_all" ON platform_integrations;
CREATE POLICY "platform_integrations_super_admin_all"
  ON platform_integrations FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE INDEX IF NOT EXISTS idx_platform_integrations_category ON platform_integrations(category);

-- ============================================================
-- 2. opportunity_notes_native
-- ============================================================

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
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "insert_opp_notes_native" ON opportunity_notes_native;
CREATE POLICY "insert_opp_notes_native" ON opportunity_notes_native FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "update_opp_notes_native" ON opportunity_notes_native;
CREATE POLICY "update_opp_notes_native" ON opportunity_notes_native FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "delete_opp_notes_native" ON opportunity_notes_native;
CREATE POLICY "delete_opp_notes_native" ON opportunity_notes_native FOR DELETE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 3. waiver_templates (with form_fields and listing_id)
-- ============================================================

CREATE TABLE IF NOT EXISTS waiver_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  html_content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  form_fields jsonb DEFAULT '[]'::jsonb,
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

ALTER TABLE waiver_templates ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_waiver_templates_tenant ON waiver_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_waiver_templates_listing ON waiver_templates(listing_id);

DROP POLICY IF EXISTS "select_own_waiver_templates" ON waiver_templates;
CREATE POLICY "select_own_waiver_templates"
  ON waiver_templates FOR SELECT
  TO authenticated
  USING (is_super_admin() OR is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "anon_select_active_waiver_templates" ON waiver_templates;
CREATE POLICY "anon_select_active_waiver_templates"
  ON waiver_templates FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "insert_own_waiver_templates" ON waiver_templates;
CREATE POLICY "insert_own_waiver_templates"
  ON waiver_templates FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "update_own_waiver_templates" ON waiver_templates;
CREATE POLICY "update_own_waiver_templates"
  ON waiver_templates FOR UPDATE
  TO authenticated
  USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "delete_own_waiver_templates" ON waiver_templates;
CREATE POLICY "delete_own_waiver_templates"
  ON waiver_templates FOR DELETE
  TO authenticated
  USING (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 4. invoices
-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  due_date timestamptz NOT NULL,
  paid_at timestamptz,
  stripe_invoice_id text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

DROP POLICY IF EXISTS "select_invoices" ON invoices;
CREATE POLICY "select_invoices" ON invoices FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "insert_invoices" ON invoices;
CREATE POLICY "insert_invoices" ON invoices FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "update_invoices" ON invoices;
CREATE POLICY "update_invoices" ON invoices FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "delete_invoices" ON invoices;
CREATE POLICY "delete_invoices" ON invoices FOR DELETE
  TO authenticated USING (is_super_admin());

-- ============================================================
-- 5. provider_events
-- ============================================================

CREATE TABLE IF NOT EXISTS provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  provider text NOT NULL,
  environment text,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  message_id text,
  communication_message_id uuid REFERENCES communication_messages(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_events_unique
  ON provider_events (provider, COALESCE(environment, ''), provider_event_id);

CREATE INDEX IF NOT EXISTS idx_provider_events_message ON provider_events(communication_message_id);
CREATE INDEX IF NOT EXISTS idx_provider_events_tenant ON provider_events(tenant_id);

ALTER TABLE provider_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_provider_events_admin" ON provider_events;
CREATE POLICY "select_provider_events_admin" ON provider_events FOR SELECT
  TO authenticated USING (is_super_admin());

-- ============================================================
-- 6. reservation_status_labels
-- ============================================================

CREATE TABLE IF NOT EXISTS reservation_status_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status_key text NOT NULL,
  display_label text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#6b7280',
  is_visible_to_customer boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reservation_status_labels ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_status_labels_tenant_key
  ON reservation_status_labels (tenant_id, status_key);

DROP POLICY IF EXISTS "status_labels_select" ON reservation_status_labels;
CREATE POLICY "status_labels_select" ON reservation_status_labels FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "status_labels_insert" ON reservation_status_labels;
CREATE POLICY "status_labels_insert" ON reservation_status_labels FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "status_labels_update" ON reservation_status_labels;
CREATE POLICY "status_labels_update" ON reservation_status_labels FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "status_labels_delete" ON reservation_status_labels;
CREATE POLICY "status_labels_delete" ON reservation_status_labels FOR DELETE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));

-- Seed default status labels for all existing tenants
INSERT INTO reservation_status_labels (tenant_id, status_key, display_label, description, color, is_visible_to_customer, sort_order)
SELECT t.id, s.status_key, s.display_label, s.description, s.color, s.is_visible_to_customer, s.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('inquiry', 'Inquiry', 'Customer made an inquiry', '#6b7280', true, 0),
  ('pending', 'Pending', 'Booking request awaiting approval', '#f59e0b', true, 1),
  ('awaiting_payment', 'Awaiting Payment', 'Booking held, awaiting payment', '#3b82f6', true, 2),
  ('confirmed', 'Confirmed', 'Booking is confirmed', '#10b981', true, 3),
  ('in_progress', 'In Progress', 'Service is in progress', '#8b5cf6', true, 4),
  ('completed', 'Completed', 'Service has been completed', '#059669', true, 5),
  ('cancelled', 'Cancelled', 'Booking was cancelled', '#ef4444', true, 6),
  ('expired', 'Expired', 'Booking hold expired without payment', '#94a3b8', true, 7),
  ('no_show', 'No Show', 'Customer did not show up', '#dc2626', true, 8)
) AS s(status_key, display_label, description, color, is_visible_to_customer, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM reservation_status_labels rsl
  WHERE rsl.tenant_id = t.id AND rsl.status_key = s.status_key
);

-- ============================================================
-- 7. platform_secret_audit_log
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_secret_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  provider_key text NOT NULL,
  action text NOT NULL,
  environment text,
  result text NOT NULL DEFAULT 'success',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_provider
  ON platform_secret_audit_log (provider_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_actor
  ON platform_secret_audit_log (actor_id, created_at DESC);

ALTER TABLE platform_secret_audit_log ENABLE ROW LEVEL SECURITY;

-- No policies: service-role only access

-- ============================================================
-- Reload PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';
