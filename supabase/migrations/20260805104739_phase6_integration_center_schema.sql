/*
# Integration Center Schema — Phase 6

## Overview
Extends the existing integration framework to support a complete tenant Integrations Center.
Adds operational columns to `tenant_integrations`, creates new tables for iCal feeds,
outgoing webhooks, API keys, integration activity logs, and calendar connections.

## New Tables

1. **tenant_ical_feeds** — iCal export/import feeds per tenant. Export feeds generate
   secure unguessable URLs for external calendar subscription. Import feeds pull
   external iCal URLs and create availability blocks.

2. **tenant_webhook_endpoints** — Outgoing webhook endpoints configured by tenants.
   Each endpoint has a destination URL, selected events, and a signing secret for
   HMAC signature verification.

3. **tenant_webhook_deliveries** — Delivery history for outgoing webhooks.
   Tracks attempt count, status, response code, and error messages.

4. **tenant_api_keys** — API keys for tenant developer access. Stores only a secure
   hash of the key; the plaintext key is shown once at creation time.

5. **integration_activity_logs** — Operational logs for all integration activity.
   Records connection attempts, syncs, webhook deliveries, errors, etc.
   Never stores credentials or tokens.

6. **tenant_calendar_connections** — OAuth-based calendar connections (Google Calendar).
   Stores encrypted token references (not plaintext tokens) and sync settings.

## Modified Tables

- **tenant_integrations** — Adds columns: `connection_mode`, `display_name`,
  `configuration` (JSONB for safe configurable fields), `last_tested_at`,
  `last_success_at`, `last_error_at`, `last_error_code`, `last_error_message`,
  `disconnected_at`.

## Security

- RLS enabled on all new tables with tenant-scoped policies.
- `tenant_api_keys` stores only SHA-256 hashes — never plaintext keys.
- `tenant_calendar_connections` stores encrypted token references.
- `tenant_webhook_endpoints` signing secrets are generated server-side.
- Super admin has read access to all tenant integration data for diagnostics.
- All tables use `auth.uid()` ownership checks via tenant membership.

## Important Notes

1. The `configuration` JSONB column on `tenant_integrations` stores ONLY safe,
   non-secret configuration values (e.g., sync settings, selected calendar ID,
   sender names). Secrets and tokens are NEVER stored in this column.
2. The `encrypted_credentials` column on `tenant_calendar_connections` stores
   encrypted OAuth tokens using application-level encryption keyed by a server
   environment variable.
3. iCal feed tokens are 32-byte cryptographically random strings.
4. Webhook signing secrets are 32-byte cryptographically random strings.
5. API keys are prefixed with `opk_` (OPERAN key) for identification.
*/

-- ============================================================
-- 1. Add operational columns to tenant_integrations
-- ============================================================

ALTER TABLE tenant_integrations
  ADD COLUMN IF NOT EXISTS connection_mode text DEFAULT 'tenant_managed',
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS configuration jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_message text,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;

-- ============================================================
-- 2. tenant_ical_feeds
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_ical_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feed_type text NOT NULL CHECK (feed_type IN ('export', 'import')),
  name text NOT NULL DEFAULT 'Calendar Feed',
  -- Export fields
  feed_token text UNIQUE,
  include_cancelled boolean DEFAULT false,
  include_customer_info boolean DEFAULT false,
  selected_listing_ids uuid[] DEFAULT '{}',
  -- Import fields
  source_url text,
  assigned_listing_ids uuid[] DEFAULT '{}',
  conflict_handling text DEFAULT 'skip' CHECK (conflict_handling IN ('skip', 'overwrite', 'block')),
  sync_frequency text DEFAULT 'daily' CHECK (sync_frequency IN ('hourly', 'daily', 'manual')),
  -- Shared
  status text DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'error')),
  last_sync_at timestamptz,
  last_error text,
  external_uids jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ical_feeds_tenant ON tenant_ical_feeds(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ical_feeds_token ON tenant_ical_feeds(feed_token) WHERE feed_token IS NOT NULL;

ALTER TABLE tenant_ical_feeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ical_feeds" ON tenant_ical_feeds;
CREATE POLICY "select_own_ical_feeds" ON tenant_ical_feeds FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "insert_own_ical_feeds" ON tenant_ical_feeds;
CREATE POLICY "insert_own_ical_feeds" ON tenant_ical_feeds FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "update_own_ical_feeds" ON tenant_ical_feeds;
CREATE POLICY "update_own_ical_feeds" ON tenant_ical_feeds FOR UPDATE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "delete_own_ical_feeds" ON tenant_ical_feeds;
CREATE POLICY "delete_own_ical_feeds" ON tenant_ical_feeds FOR DELETE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- ============================================================
-- 3. tenant_webhook_endpoints
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL DEFAULT '{}',
  signing_secret text NOT NULL,
  is_active boolean DEFAULT true,
  last_delivery_at timestamptz,
  last_delivery_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON tenant_webhook_endpoints(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON tenant_webhook_endpoints(tenant_id) WHERE is_active = true;

ALTER TABLE tenant_webhook_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_webhook_endpoints" ON tenant_webhook_endpoints;
CREATE POLICY "select_own_webhook_endpoints" ON tenant_webhook_endpoints FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "insert_own_webhook_endpoints" ON tenant_webhook_endpoints;
CREATE POLICY "insert_own_webhook_endpoints" ON tenant_webhook_endpoints FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "update_own_webhook_endpoints" ON tenant_webhook_endpoints;
CREATE POLICY "update_own_webhook_endpoints" ON tenant_webhook_endpoints FOR UPDATE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "delete_own_webhook_endpoints" ON tenant_webhook_endpoints;
CREATE POLICY "delete_own_webhook_endpoints" ON tenant_webhook_endpoints FOR DELETE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- ============================================================
-- 4. tenant_webhook_deliveries
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES tenant_webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'delivered', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  response_code integer,
  response_body text,
  error_message text,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON tenant_webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant ON tenant_webhook_deliveries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON tenant_webhook_deliveries(status) WHERE status IN ('pending', 'failed');

ALTER TABLE tenant_webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_webhook_deliveries" ON tenant_webhook_deliveries;
CREATE POLICY "select_own_webhook_deliveries" ON tenant_webhook_deliveries FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "insert_own_webhook_deliveries" ON tenant_webhook_deliveries;
CREATE POLICY "insert_own_webhook_deliveries" ON tenant_webhook_deliveries FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "update_own_webhook_deliveries" ON tenant_webhook_deliveries;
CREATE POLICY "update_own_webhook_deliveries" ON tenant_webhook_deliveries FOR UPDATE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "delete_own_webhook_deliveries" ON tenant_webhook_deliveries;
CREATE POLICY "delete_own_webhook_deliveries" ON tenant_webhook_deliveries FOR DELETE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- ============================================================
-- 5. tenant_api_keys
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON tenant_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON tenant_api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON tenant_api_keys(key_prefix) WHERE revoked_at IS NULL;

ALTER TABLE tenant_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_api_keys" ON tenant_api_keys;
CREATE POLICY "select_own_api_keys" ON tenant_api_keys FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "insert_own_api_keys" ON tenant_api_keys;
CREATE POLICY "insert_own_api_keys" ON tenant_api_keys FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "update_own_api_keys" ON tenant_api_keys;
CREATE POLICY "update_own_api_keys" ON tenant_api_keys FOR UPDATE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "delete_own_api_keys" ON tenant_api_keys;
CREATE POLICY "delete_own_api_keys" ON tenant_api_keys FOR DELETE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- ============================================================
-- 6. integration_activity_logs
-- ============================================================

CREATE TABLE IF NOT EXISTS integration_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES tenant_integrations(id) ON DELETE SET NULL,
  category text NOT NULL,
  provider text NOT NULL,
  action text NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'failed', 'info', 'warning')),
  message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant ON integration_activity_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_integration ON integration_activity_logs(integration_id) WHERE integration_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON integration_activity_logs(created_at DESC);

ALTER TABLE integration_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_activity_logs" ON integration_activity_logs;
CREATE POLICY "select_own_activity_logs" ON integration_activity_logs FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "insert_own_activity_logs" ON integration_activity_logs;
CREATE POLICY "insert_own_activity_logs" ON integration_activity_logs FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- ============================================================
-- 7. tenant_calendar_connections
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google_calendar',
  provider_account_id text,
  encrypted_credentials bytea,
  selected_calendar_id text,
  calendar_name text,
  calendar_timezone text,
  sync_direction text DEFAULT 'to_external' CHECK (sync_direction IN ('to_external', 'to_internal', 'bidirectional')),
  conflict_handling text DEFAULT 'skip' CHECK (conflict_handling IN ('skip', 'overwrite', 'block')),
  event_title_template text DEFAULT 'Booking: {{customer_name}}',
  event_description_template text,
  include_customer_details boolean DEFAULT false,
  include_meeting_point boolean DEFAULT false,
  create_on_confirm boolean DEFAULT true,
  update_on_change boolean DEFAULT true,
  cancel_on_reservation_cancel boolean DEFAULT true,
  block_availability_from_external boolean DEFAULT true,
  granted_scopes text[] DEFAULT '{}',
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  connection_status text DEFAULT 'not_configured' CHECK (connection_status IN ('not_configured', 'connecting', 'connected', 'requires_action', 'disconnected', 'error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_connections_tenant ON tenant_calendar_connections(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_connections_provider_tenant ON tenant_calendar_connections(tenant_id, provider) WHERE connection_status != 'disconnected';

ALTER TABLE tenant_calendar_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_calendar_connections" ON tenant_calendar_connections;
CREATE POLICY "select_own_calendar_connections" ON tenant_calendar_connections FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "insert_own_calendar_connections" ON tenant_calendar_connections;
CREATE POLICY "insert_own_calendar_connections" ON tenant_calendar_connections FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "update_own_calendar_connections" ON tenant_calendar_connections;
CREATE POLICY "update_own_calendar_connections" ON tenant_calendar_connections FOR UPDATE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "delete_own_calendar_connections" ON tenant_calendar_connections;
CREATE POLICY "delete_own_calendar_connections" ON tenant_calendar_connections FOR DELETE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- ============================================================
-- 8. Update integration_catalog with connection_scope for existing entries
-- ============================================================

-- Ensure all catalog entries have a connection_scope
UPDATE integration_catalog
  SET connection_scope = 'tenant_managed'
  WHERE connection_scope IS NULL;

-- Mark providers that are not yet implemented as coming_soon
-- We add an `is_coming_soon` column to the catalog
ALTER TABLE integration_catalog
  ADD COLUMN IF NOT EXISTS is_coming_soon boolean DEFAULT false;

-- Mark unimplemented providers as coming soon
-- Implemented: payments/stripe, communication/resend
-- Partially scaffolded: calendar/google_calendar, calendar/ical
-- Everything else: coming soon
UPDATE integration_catalog SET is_coming_soon = true
  WHERE category = 'messaging' AND provider NOT IN ('resend')
  AND provider NOT IN ('twilio', 'twilio_sms', 'twilio_whatsapp', 'meta_whatsapp');

UPDATE integration_catalog SET is_coming_soon = true
  WHERE category = 'accounting';

UPDATE integration_catalog SET is_coming_soon = true
  WHERE category = 'crm' AND provider != 'native';

-- Re-categorize: move messaging providers that duplicate communication into a developer category
-- The messaging category has too many overlapping providers.
-- We keep: twilio (SMS), twilio_sms (SMS), twilio_whatsapp (WhatsApp), meta_whatsapp (WhatsApp)
-- We mark the rest as coming soon
UPDATE integration_catalog SET is_coming_soon = true
  WHERE category = 'messaging' AND provider IN ('email', 'sendgrid', 'postmark', 'amazon_ses', 'telnyx');

-- ============================================================
-- 9. Helper function: log_integration_activity
-- ============================================================

CREATE OR REPLACE FUNCTION log_integration_activity(
  p_tenant_id uuid,
  p_category text,
  p_provider text,
  p_action text,
  p_status text,
  p_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_integration_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO integration_activity_logs (
    tenant_id, integration_id, category, provider, action, status, message, metadata
  ) VALUES (
    p_tenant_id, p_integration_id, p_category, p_provider, p_action, p_status, p_message, p_metadata
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. Helper function: generate_ical_feed_token
-- ============================================================

CREATE OR REPLACE FUNCTION generate_ical_feed_token()
RETURNS text AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 11. Helper function: generate_webhook_signing_secret
-- ============================================================

CREATE OR REPLACE FUNCTION generate_webhook_signing_secret()
RETURNS text AS $$
BEGIN
  RETURN 'whsec_' || encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 12. Grant execute on helper functions
-- ============================================================

GRANT EXECUTE ON FUNCTION log_integration_activity TO authenticated;
GRANT EXECUTE ON FUNCTION generate_ical_feed_token TO authenticated;
GRANT EXECUTE ON FUNCTION generate_webhook_signing_secret TO authenticated;

-- ============================================================
-- 13. Update the integration_catalog to add an 'automation' category entry for webhooks
-- ============================================================

INSERT INTO integration_catalog (category, provider, display_name, description, icon, is_active, sort_order, connection_scope, is_coming_soon)
  VALUES ('automation', 'webhooks', 'Outgoing Webhooks', 'Send real-time event notifications to external systems when reservations, payments, or other events occur.', 'Webhook', true, 0, 'tenant_managed', false)
  ON CONFLICT (category, provider) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    connection_scope = EXCLUDED.connection_scope,
    is_coming_soon = EXCLUDED.is_coming_soon;

INSERT INTO integration_catalog (category, provider, display_name, description, icon, is_active, sort_order, connection_scope, is_coming_soon)
  VALUES ('automation', 'api_access', 'API Access', 'Generate API keys for programmatic access to your tenant data and operations.', 'Code', true, 1, 'tenant_managed', false)
  ON CONFLICT (category, provider) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    connection_scope = EXCLUDED.connection_scope,
    is_coming_soon = EXCLUDED.is_coming_soon;
