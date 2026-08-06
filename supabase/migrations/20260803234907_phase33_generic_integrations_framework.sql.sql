-- ============================================================
-- Generic Integrations Framework
-- Replaces payment-specific tables with category-aware design
-- ============================================================

-- 1. Platform-level integrations
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

CREATE POLICY "platform_integrations_super_admin_all"
  ON platform_integrations FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 2. Tenant-level integrations
CREATE TABLE IF NOT EXISTS tenant_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category text NOT NULL,
  provider text NOT NULL,
  environment text NOT NULL DEFAULT 'test',
  connection_status text NOT NULL DEFAULT 'not_configured',
  external_account_id text,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_integrations_select"
  ON tenant_integrations FOR SELECT
  TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "tenant_integrations_insert"
  ON tenant_integrations FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "tenant_integrations_update"
  ON tenant_integrations FOR UPDATE
  TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "tenant_integrations_delete"
  ON tenant_integrations FOR DELETE
  TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id());

CREATE UNIQUE INDEX IF NOT EXISTS tenant_integrations_tenant_category_provider_uniq
  ON tenant_integrations (tenant_id, category, provider)
  WHERE connection_status != 'disconnected';

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant ON tenant_integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_integrations_category ON tenant_integrations(category);
CREATE INDEX IF NOT EXISTS idx_platform_integrations_category ON platform_integrations(category);

-- 3. Integration catalog
CREATE TABLE IF NOT EXISTS integration_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  provider text NOT NULL,
  display_name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT 'Plug',
  is_active boolean NOT NULL DEFAULT true,
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE integration_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integration_catalog_select"
  ON integration_catalog FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "integration_catalog_super_admin_all"
  ON integration_catalog FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE UNIQUE INDEX IF NOT EXISTS integration_catalog_category_provider_uniq
  ON integration_catalog (category, provider);

-- 4. Seed the catalog
INSERT INTO integration_catalog (category, provider, display_name, description, icon, sort_order) VALUES
  ('payments', 'stripe', 'Stripe', 'Accept payments, deposits, and payouts via Stripe Connect', 'CreditCard', 0),
  ('calendar', 'google_calendar', 'Google Calendar', 'Sync bookings with Google Calendar', 'Calendar', 10),
  ('calendar', 'ical', 'iCal Feed', 'Export bookings as an iCal feed for any calendar app', 'Calendar', 11),
  ('messaging', 'twilio', 'Twilio', 'Send SMS notifications and reminders to customers', 'MessageSquare', 20),
  ('messaging', 'email', 'Email (SMTP)', 'Send transactional emails via SMTP', 'Mail', 21),
  ('crm', 'native', 'Native CRM', 'Built-in CRM with contacts, pipelines, and opportunities', 'Users', 30),
  ('accounting', 'quickbooks', 'QuickBooks', 'Sync revenue and invoices with QuickBooks', 'Calculator', 40)
ON CONFLICT (category, provider) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  updated_at = now();

-- 5. Migrate existing data from payment-specific tables
INSERT INTO platform_integrations (category, provider, environment, connection_status, external_account_id, capabilities, webhook_status, webhook_last_event_at, metadata, connected_at, last_synced_at)
SELECT
  'payments', provider, COALESCE(environment, 'test'),
  COALESCE(connection_status, 'not_configured'), external_account_id,
  jsonb_build_object(
    'charges_enabled', COALESCE(charges_enabled, false),
    'payouts_enabled', COALESCE(payouts_enabled, false),
    'requirements_pending', to_jsonb(COALESCE(requirements_pending, ARRAY[]::text[])),
    'default_currency', COALESCE(default_currency, 'USD')
  ),
  COALESCE(webhook_status, 'not_configured'), webhook_last_event_at, COALESCE(metadata, '{}'::jsonb),
  connected_at, last_synced_at
FROM platform_payment_connections
WHERE NOT EXISTS (SELECT 1 FROM platform_integrations pi WHERE pi.category = 'payments' AND pi.provider = platform_payment_connections.provider);

INSERT INTO tenant_integrations (tenant_id, category, provider, environment, connection_status, external_account_id, capabilities, is_default, enabled, metadata, connected_at, last_synced_at)
SELECT
  tenant_id, 'payments', provider, COALESCE(environment, 'test'),
  COALESCE(connection_status, 'not_configured'), external_account_id,
  jsonb_build_object(
    'charges_enabled', COALESCE(charges_enabled, false),
    'payouts_enabled', COALESCE(payouts_enabled, false),
    'requirements_pending', to_jsonb(COALESCE(requirements_pending, ARRAY[]::text[])),
    'default_currency', COALESCE(default_currency, 'USD')
  ),
  COALESCE(is_default, false), COALESCE(booking_payments_enabled, false), COALESCE(metadata, '{}'::jsonb),
  connected_at, last_synced_at
FROM payment_provider_connections
WHERE NOT EXISTS (SELECT 1 FROM tenant_integrations ti WHERE ti.tenant_id = payment_provider_connections.tenant_id AND ti.category = 'payments' AND ti.provider = payment_provider_connections.provider);

-- 6. Helper functions
CREATE OR REPLACE FUNCTION get_tenant_integration_status(p_tenant_id uuid, p_category text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object('connection_status', ti.connection_status, 'enabled', ti.enabled, 'capabilities', ti.capabilities)
  INTO result FROM tenant_integrations ti
  WHERE ti.tenant_id = p_tenant_id AND ti.category = p_category AND ti.is_default = true LIMIT 1;
  RETURN COALESCE(result, jsonb_build_object('connection_status', 'not_configured', 'enabled', false, 'capabilities', '{}'::jsonb));
END; $$;

GRANT EXECUTE ON FUNCTION get_tenant_integration_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_integration_status(uuid, text) TO anon;

CREATE OR REPLACE FUNCTION get_platform_integration_status(p_category text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object('provider', pi.provider, 'connection_status', pi.connection_status, 'capabilities', pi.capabilities, 'webhook_status', pi.webhook_status)
  INTO result FROM platform_integrations pi WHERE pi.category = p_category ORDER BY pi.updated_at DESC LIMIT 1;
  RETURN COALESCE(result, jsonb_build_object('connection_status', 'not_configured'));
END; $$;

GRANT EXECUTE ON FUNCTION get_platform_integration_status(text) TO authenticated;
