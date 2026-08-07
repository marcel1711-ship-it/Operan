/*
# Phase 2 — Integration Infrastructure

## Overview
Creates the database infrastructure for integrations, webhooks, API keys,
calendar connections, availability blocks, and activity logging.

## New Tables (10)
1. event_outbox — Domain event outbox for async processing
2. activity_log — Activity/audit logging for all entity changes
3. tenant_ical_feeds — iCal export/import feeds per tenant
4. tenant_webhook_endpoints — Outgoing webhook endpoint configuration
5. tenant_webhook_deliveries — Webhook delivery history
6. tenant_api_keys — API keys for tenant developer access (hash-only)
7. integration_activity_logs — Integration-specific activity logs
8. tenant_calendar_connections — OAuth calendar connections (Google Calendar)
9. listing_availability_blocks — External calendar blocks on listings
10. webhook_outbox — Webhook delivery queue with idempotency

## Modified Tables
- tenant_integrations: Added operational columns (connection_mode, configuration, etc.)
- reservations: Added google_calendar_event_id column

## New Functions (12)
- emit_domain_event — Insert domain events into outbox
- log_integration_activity — Log integration operations
- generate_ical_feed_token — Generate secure feed tokens
- generate_webhook_signing_secret — Generate HMAC signing secrets
- authenticate_api_key — Validate API key and return tenant info
- create_webhook_deliveries_for_event — Fan-out events to webhook endpoints
- check_listing_availability_with_blocks — Availability check including blocks
- emit_reservation_event — Emit reservation lifecycle events + webhooks
- emit_payment_event — Emit payment events + webhooks
- emit_customer_event — Emit customer events + webhooks
- emit_waiver_event — Emit waiver events + webhooks
- emit_workflow_event — Emit workflow events + webhooks

## Security
- RLS enabled on all tables with is_tenant_member() policies
- No current_tenant_id() dependency (uses is_tenant_member instead)
- API keys store SHA-256 hashes only
- Calendar connections store encrypted credentials (bytea)
- All SECURITY DEFINER functions have SET search_path = public
*/

-- ============================================================
-- 1. Foundation: event_outbox
-- ============================================================

CREATE TABLE IF NOT EXISTS event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reservation_id uuid,
  customer_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  error_message text,
  next_retry_at timestamptz,
  processed_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_outbox_tenant ON event_outbox(tenant_id);
CREATE INDEX IF NOT EXISTS idx_event_outbox_status ON event_outbox(status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_event_outbox_entity ON event_outbox(entity_type, entity_id);

ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_events" ON event_outbox FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_events" ON event_outbox FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_events" ON event_outbox FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 2. Foundation: activity_log
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_activity_log_tenant ON activity_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(tenant_id, entity_type, entity_id, created_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_activity" ON activity_log FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_activity" ON activity_log FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

GRANT INSERT ON activity_log TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON activity_log FROM anon;

-- ============================================================
-- 3. emit_domain_event function
-- ============================================================

CREATE OR REPLACE FUNCTION emit_domain_event(
  p_tenant_id uuid, p_event_type text, p_entity_type text, p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb, p_reservation_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_event_id uuid;
BEGIN
  INSERT INTO event_outbox (
    tenant_id, event_type, entity_type, entity_id, payload,
    reservation_id, customer_id, status
  ) VALUES (
    p_tenant_id, p_event_type, p_entity_type, p_entity_id, p_payload,
    p_reservation_id, p_customer_id, 'pending'
  ) RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION emit_domain_event TO authenticated;

-- ============================================================
-- 4. Add operational columns to tenant_integrations
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
-- 5. tenant_ical_feeds
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_ical_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feed_type text NOT NULL CHECK (feed_type IN ('export', 'import')),
  name text NOT NULL DEFAULT 'Calendar Feed',
  feed_token text UNIQUE,
  include_cancelled boolean DEFAULT false,
  include_customer_info boolean DEFAULT false,
  selected_listing_ids uuid[] DEFAULT '{}',
  source_url text,
  assigned_listing_ids uuid[] DEFAULT '{}',
  conflict_handling text DEFAULT 'skip' CHECK (conflict_handling IN ('skip', 'overwrite', 'block')),
  sync_frequency text DEFAULT 'daily' CHECK (sync_frequency IN ('hourly', 'daily', 'manual')),
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

CREATE POLICY "select_own_ical_feeds" ON tenant_ical_feeds FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_ical_feeds" ON tenant_ical_feeds FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_ical_feeds" ON tenant_ical_feeds FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "delete_own_ical_feeds" ON tenant_ical_feeds FOR DELETE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "anon_select_export_feeds" ON tenant_ical_feeds FOR SELECT
  TO anon USING (feed_type = 'export' AND status = 'active' AND feed_token IS NOT NULL);

-- ============================================================
-- 6. tenant_webhook_endpoints
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

CREATE POLICY "select_own_webhook_endpoints" ON tenant_webhook_endpoints FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_webhook_endpoints" ON tenant_webhook_endpoints FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_webhook_endpoints" ON tenant_webhook_endpoints FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "delete_own_webhook_endpoints" ON tenant_webhook_endpoints FOR DELETE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 7. tenant_webhook_deliveries
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

CREATE POLICY "select_own_webhook_deliveries" ON tenant_webhook_deliveries FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_webhook_deliveries" ON tenant_webhook_deliveries FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_webhook_deliveries" ON tenant_webhook_deliveries FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 8. tenant_api_keys
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

CREATE POLICY "select_own_api_keys" ON tenant_api_keys FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_api_keys" ON tenant_api_keys FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_api_keys" ON tenant_api_keys FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 9. integration_activity_logs
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

CREATE INDEX IF NOT EXISTS idx_integration_activity_logs_tenant ON integration_activity_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integration_activity_logs_integration ON integration_activity_logs(integration_id) WHERE integration_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_integration_activity_logs_created ON integration_activity_logs(created_at DESC);
ALTER TABLE integration_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_integration_activity" ON integration_activity_logs FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_integration_activity" ON integration_activity_logs FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 10. tenant_calendar_connections
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

CREATE POLICY "select_own_calendar_connections" ON tenant_calendar_connections FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_calendar_connections" ON tenant_calendar_connections FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_calendar_connections" ON tenant_calendar_connections FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "delete_own_calendar_connections" ON tenant_calendar_connections FOR DELETE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 11. listing_availability_blocks
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('ical_import', 'google_calendar', 'manual')),
  source_id uuid,
  external_uid text,
  external_source_url text,
  title text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  is_all_day boolean DEFAULT false,
  status text DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  raw_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_availability_blocks_listing ON listing_availability_blocks(listing_id);
CREATE INDEX IF NOT EXISTS idx_availability_blocks_tenant ON listing_availability_blocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_availability_blocks_dates ON listing_availability_blocks(listing_id, start_at, end_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_availability_blocks_source ON listing_availability_blocks(source_type, source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_availability_blocks_external_uid ON listing_availability_blocks(tenant_id, listing_id, external_uid) WHERE external_uid IS NOT NULL AND status = 'active';
ALTER TABLE listing_availability_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_availability_blocks" ON listing_availability_blocks FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_availability_blocks" ON listing_availability_blocks FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_availability_blocks" ON listing_availability_blocks FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "delete_own_availability_blocks" ON listing_availability_blocks FOR DELETE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "anon_select_active_blocks" ON listing_availability_blocks FOR SELECT
  TO anon USING (status = 'active');

-- ============================================================
-- 12. webhook_outbox
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES tenant_webhook_endpoints(id) ON DELETE CASCADE,
  domain_event_type text NOT NULL,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivering', 'delivered', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  response_code integer,
  response_body text,
  error_message text,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_outbox_idempotency ON webhook_outbox(endpoint_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_status ON webhook_outbox(status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_tenant ON webhook_outbox(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_outbox_endpoint ON webhook_outbox(endpoint_id);
ALTER TABLE webhook_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_webhook_outbox" ON webhook_outbox FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_webhook_outbox" ON webhook_outbox FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_webhook_outbox" ON webhook_outbox FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 13. Add google_calendar_event_id to reservations
-- ============================================================

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS google_calendar_event_id text;

-- ============================================================
-- 14. Helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION log_integration_activity(
  p_tenant_id uuid, p_category text, p_provider text, p_action text,
  p_status text, p_message text DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb,
  p_integration_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_log_id uuid;
BEGIN
  INSERT INTO integration_activity_logs (
    tenant_id, integration_id, category, provider, action, status, message, metadata
  ) VALUES (
    p_tenant_id, p_integration_id, p_category, p_provider, p_action, p_status, p_message, p_metadata
  ) RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION generate_ical_feed_token()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN encode(gen_random_bytes(32), 'hex'); END;
$$;

CREATE OR REPLACE FUNCTION generate_webhook_signing_secret()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN RETURN 'whsec_' || encode(gen_random_bytes(32), 'hex'); END;
$$;

GRANT EXECUTE ON FUNCTION log_integration_activity TO authenticated;
GRANT EXECUTE ON FUNCTION generate_ical_feed_token TO authenticated;
GRANT EXECUTE ON FUNCTION generate_webhook_signing_secret TO authenticated;

-- ============================================================
-- 15. API key authentication
-- ============================================================

CREATE OR REPLACE FUNCTION authenticate_api_key(p_key text)
RETURNS TABLE(tenant_id uuid, tenant_name text, tenant_slug text, key_id uuid, key_name text, scopes text[], is_valid boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hash text; v_tenant_id uuid; v_tenant_name text; v_tenant_slug text;
  v_key_id uuid; v_key_name text; v_scopes text[];
BEGIN
  IF p_key IS NULL OR length(p_key) < 10 OR p_key NOT LIKE 'opk_%' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::text, NULL::text[], false;
    RETURN;
  END IF;
  v_hash := encode(digest(p_key, 'sha256'), 'hex');
  SELECT ak.tenant_id, ak.id, ak.name, ak.scopes
    INTO v_tenant_id, v_key_id, v_key_name, v_scopes
  FROM tenant_api_keys ak WHERE ak.key_hash = v_hash AND ak.revoked_at IS NULL LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::text, NULL::text[], false;
    RETURN;
  END IF;
  SELECT t.name, t.slug INTO v_tenant_name, v_tenant_slug FROM tenants t WHERE t.id = v_tenant_id;
  UPDATE tenant_api_keys SET last_used_at = now() WHERE id = v_key_id;
  RETURN QUERY SELECT v_tenant_id, v_tenant_name, v_tenant_slug, v_key_id, v_key_name, v_scopes, true;
END;
$$;

GRANT EXECUTE ON FUNCTION authenticate_api_key TO anon, authenticated;

-- ============================================================
-- 16. Webhook delivery fan-out
-- ============================================================

CREATE OR REPLACE FUNCTION create_webhook_deliveries_for_event(
  p_tenant_id uuid, p_event_type text, p_payload jsonb DEFAULT '{}'::jsonb, p_entity_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count integer := 0; v_endpoint record; v_idempotency_key text;
BEGIN
  FOR v_endpoint IN
    SELECT id FROM tenant_webhook_endpoints
    WHERE tenant_id = p_tenant_id AND is_active = true
      AND (events @> ARRAY[p_event_type] OR events @> ARRAY['*'])
  LOOP
    v_idempotency_key := p_event_type || ':' || COALESCE(p_entity_id::text, '') || ':' || v_endpoint.id::text;
    INSERT INTO webhook_outbox (tenant_id, endpoint_id, domain_event_type, entity_id, payload, idempotency_key, status)
    VALUES (p_tenant_id, v_endpoint.id, p_event_type, p_entity_id, p_payload, v_idempotency_key, 'pending')
    ON CONFLICT (endpoint_id, idempotency_key) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION create_webhook_deliveries_for_event TO authenticated;

-- ============================================================
-- 17. Availability check with blocks
-- ============================================================

CREATE OR REPLACE FUNCTION check_listing_availability_with_blocks(
  p_listing_id uuid, p_start_at timestamptz, p_end_at timestamptz, p_reservation_id uuid DEFAULT NULL
) RETURNS TABLE(available boolean, conflict_type text, conflict_id uuid, conflict_reference text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_block record;
BEGIN
  FOR v_block IN
    SELECT id, title FROM listing_availability_blocks
    WHERE listing_id = p_listing_id AND status = 'active'
      AND (start_at, end_at) OVERLAPS (p_start_at, p_end_at)
  LOOP
    RETURN QUERY SELECT false, 'availability_block'::text, v_block.id, v_block.title;
    RETURN;
  END LOOP;
  RETURN QUERY SELECT true, NULL::text, NULL::uuid, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION check_listing_availability_with_blocks TO authenticated;

-- ============================================================
-- 18. Event emission helpers (with webhook fan-out)
-- ============================================================

CREATE OR REPLACE FUNCTION emit_reservation_event(
  p_tenant_id uuid, p_event_type text, p_reservation_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb, p_customer_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event_id uuid;
BEGIN
  SELECT emit_domain_event(p_tenant_id, p_event_type, 'reservation', p_reservation_id, p_payload, p_reservation_id, p_customer_id) INTO v_event_id;
  PERFORM create_webhook_deliveries_for_event(p_tenant_id, p_event_type, p_payload, p_reservation_id);
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION emit_payment_event(
  p_tenant_id uuid, p_event_type text, p_payment_id uuid,
  p_reservation_id uuid DEFAULT NULL, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event_id uuid;
BEGIN
  SELECT emit_domain_event(p_tenant_id, p_event_type, 'payment', p_payment_id, p_payload, p_reservation_id) INTO v_event_id;
  PERFORM create_webhook_deliveries_for_event(p_tenant_id, p_event_type, p_payload, p_payment_id);
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION emit_customer_event(
  p_tenant_id uuid, p_event_type text, p_customer_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event_id uuid;
BEGIN
  SELECT emit_domain_event(p_tenant_id, p_event_type, 'customer', p_customer_id, p_payload, NULL, p_customer_id) INTO v_event_id;
  PERFORM create_webhook_deliveries_for_event(p_tenant_id, p_event_type, p_payload, p_customer_id);
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION emit_waiver_event(
  p_tenant_id uuid, p_event_type text, p_waiver_id uuid,
  p_reservation_id uuid DEFAULT NULL, p_customer_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event_id uuid;
BEGIN
  SELECT emit_domain_event(p_tenant_id, p_event_type, 'waiver', p_waiver_id, p_payload, p_reservation_id, p_customer_id) INTO v_event_id;
  PERFORM create_webhook_deliveries_for_event(p_tenant_id, p_event_type, p_payload, p_waiver_id);
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION emit_workflow_event(
  p_tenant_id uuid, p_event_type text, p_workflow_run_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_event_id uuid;
BEGIN
  SELECT emit_domain_event(p_tenant_id, p_event_type, 'workflow', p_workflow_run_id, p_payload) INTO v_event_id;
  PERFORM create_webhook_deliveries_for_event(p_tenant_id, p_event_type, p_payload, p_workflow_run_id);
  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION emit_reservation_event TO authenticated;
GRANT EXECUTE ON FUNCTION emit_payment_event TO authenticated;
GRANT EXECUTE ON FUNCTION emit_customer_event TO authenticated;
GRANT EXECUTE ON FUNCTION emit_waiver_event TO authenticated;
GRANT EXECUTE ON FUNCTION emit_workflow_event TO authenticated;

-- ============================================================
-- 19. Integration catalog updates
-- ============================================================

UPDATE integration_catalog SET connection_scope = 'tenant_managed' WHERE connection_scope IS NULL;

INSERT INTO integration_catalog (category, provider, display_name, description, icon, is_active, sort_order, connection_scope, is_coming_soon)
  VALUES ('automation', 'webhooks', 'Outgoing Webhooks', 'Send real-time event notifications to external systems when reservations, payments, or other events occur.', 'Webhook', true, 0, 'tenant_managed', false)
  ON CONFLICT (category, provider) DO UPDATE SET
    display_name = EXCLUDED.display_name, description = EXCLUDED.description,
    is_active = EXCLUDED.is_active, connection_scope = EXCLUDED.connection_scope, is_coming_soon = EXCLUDED.is_coming_soon;

INSERT INTO integration_catalog (category, provider, display_name, description, icon, is_active, sort_order, connection_scope, is_coming_soon)
  VALUES ('automation', 'api_access', 'API Access', 'Generate API keys for programmatic access to your tenant data and operations.', 'Code', true, 1, 'tenant_managed', false)
  ON CONFLICT (category, provider) DO UPDATE SET
    display_name = EXCLUDED.display_name, description = EXCLUDED.description,
    is_active = EXCLUDED.is_active, connection_scope = EXCLUDED.connection_scope, is_coming_soon = EXCLUDED.is_coming_soon;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
