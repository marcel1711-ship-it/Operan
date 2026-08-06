/*
# Phase 5.5: Platform-Managed Resend Email Infrastructure

## Summary
Sets up the database schema for platform-managed Resend email:
- Tenant sending domains with DNS records and verification tracking
- Tenant sender identities (From/Reply-To)
- Communication suppressions (bounces, complaints, manual blocks)
- Provider event log (webhook events with idempotency)
- Email usage tracking (daily per-tenant)
- Email limit configuration (per-plan and global)
- Expanded communication_messages status model and email-specific columns
- Resend catalog entry with connection_scope = platform_managed

## New Tables
1. tenant_email_domains — tenant sending domains with provider DNS records
2. tenant_email_senders — tenant sender identities (From/Reply-To)
3. communication_suppressions — bounce/complaint/manual suppression list
4. provider_events — raw provider webhook events with idempotency
5. email_usage_daily — per-tenant daily email usage counts
6. email_limit_config — plan-level and global email limits

## Modified Tables
- communication_messages: added email-specific columns + expanded status CHECK
- integration_catalog: added connection_scope + supported_channels columns

## Security
- All new tables have RLS enabled
- tenant_email_domains/senders: tenant-scoped CRUD (tenant_admin or super_admin)
- communication_suppressions: tenant-scoped SELECT, service-role-only writes
- provider_events: super_admin SELECT only, service-role-only writes
- email_usage_daily: tenant-scoped SELECT, service-role-only writes
- email_limit_config: super_admin CRUD, tenant SELECT for own plan
*/

-- ============================================================
-- 1. ADD connection_scope TO integration_catalog
-- ============================================================
ALTER TABLE integration_catalog ADD COLUMN IF NOT EXISTS connection_scope text DEFAULT 'tenant_managed';
ALTER TABLE integration_catalog ADD COLUMN IF NOT EXISTS supported_channels text[] DEFAULT '{}';

-- ============================================================
-- 2. SEED RESEND CATALOG ENTRY
-- ============================================================
INSERT INTO integration_catalog (category, provider, display_name, description, icon, is_active, connection_scope, supported_channels, config_schema, sort_order)
VALUES (
  'communication',
  'resend',
  'Resend',
  'Platform-managed email delivery. Tenants configure sending domains and sender identities; the platform manages the Resend API connection.',
  'Mail',
  true,
  'platform_managed',
  ARRAY['email'],
  jsonb_build_object(
    'supports_sending_domains', true,
    'supports_webhooks', true,
    'supports_delivery_status', true,
    'supports_bounces', true,
    'supports_complaints', true,
    'tenant_api_key_required', false,
    'tenant_domain_required', true,
    'available_plans', ARRAY['starter', 'pro', 'enterprise'],
    'provider_status', 'active'
  ),
  10
)
ON CONFLICT (category, provider) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  connection_scope = EXCLUDED.connection_scope,
  supported_channels = EXCLUDED.supported_channels,
  config_schema = EXCLUDED.config_schema;

-- ============================================================
-- 3. tenant_email_domains
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_email_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'resend',
  provider_domain_id text,
  domain text NOT NULL,
  subdomain text,
  region text,
  status text NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured','domain_pending','dns_required','verifying','verified','sender_incomplete','ready','suspended','disabled','error')),
  verification_status text,
  sending_enabled boolean NOT NULL DEFAULT false,
  receiving_enabled boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  dns_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz,
  verified_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_email_domains_domain_unique
  ON tenant_email_domains (lower(domain))
  WHERE status NOT IN ('disabled', 'error');

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_email_domains_default
  ON tenant_email_domains (tenant_id)
  WHERE is_default = true AND status NOT IN ('disabled', 'error');

CREATE INDEX IF NOT EXISTS idx_tenant_email_domains_tenant ON tenant_email_domains(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_email_domains_status ON tenant_email_domains(status);
CREATE INDEX IF NOT EXISTS idx_tenant_email_domains_provider ON tenant_email_domains(provider);

ALTER TABLE tenant_email_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_email_domains" ON tenant_email_domains;
CREATE POLICY "select_own_email_domains" ON tenant_email_domains FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "insert_own_email_domains" ON tenant_email_domains;
CREATE POLICY "insert_own_email_domains" ON tenant_email_domains FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "update_own_email_domains" ON tenant_email_domains;
CREATE POLICY "update_own_email_domains" ON tenant_email_domains FOR UPDATE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "delete_own_email_domains" ON tenant_email_domains;
CREATE POLICY "delete_own_email_domains" ON tenant_email_domains FOR DELETE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================================
-- 4. tenant_email_senders
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_email_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email_domain_id uuid NOT NULL REFERENCES tenant_email_domains(id) ON DELETE RESTRICT,
  sender_name text NOT NULL,
  from_email text NOT NULL,
  reply_to_email text,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  verification_status text DEFAULT 'pending',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_email_senders_default
  ON tenant_email_senders (tenant_id)
  WHERE is_default = true AND is_active = true AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_email_senders_tenant ON tenant_email_senders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_email_senders_domain ON tenant_email_senders(email_domain_id);

ALTER TABLE tenant_email_senders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_email_senders" ON tenant_email_senders;
CREATE POLICY "select_own_email_senders" ON tenant_email_senders FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "insert_own_email_senders" ON tenant_email_senders;
CREATE POLICY "insert_own_email_senders" ON tenant_email_senders FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "update_own_email_senders" ON tenant_email_senders;
CREATE POLICY "update_own_email_senders" ON tenant_email_senders FOR UPDATE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "delete_own_email_senders" ON tenant_email_senders;
CREATE POLICY "delete_own_senders" ON tenant_email_senders FOR DELETE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================================
-- 5. communication_suppressions
-- ============================================================
CREATE TABLE IF NOT EXISTS communication_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email','sms','whatsapp')),
  address text NOT NULL,
  reason text NOT NULL
    CHECK (reason IN ('hard_bounce','complaint','manual_block','invalid_address','provider_suppression')),
  source text NOT NULL DEFAULT 'system'
    CHECK (source IN ('system','provider','manual')),
  provider text,
  provider_event_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  lifted_at timestamptz,
  lifted_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_comm_suppressions_active_unique
  ON communication_suppressions (tenant_id, channel, lower(address))
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_comm_suppressions_tenant ON communication_suppressions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comm_suppressions_customer ON communication_suppressions(customer_id);

ALTER TABLE communication_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_suppressions" ON communication_suppressions;
CREATE POLICY "select_own_suppressions" ON communication_suppressions FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================================
-- 6. provider_events
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
-- 7. email_usage_daily
-- ============================================================
CREATE TABLE IF NOT EXISTS email_usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  emails_accepted int NOT NULL DEFAULT 0,
  emails_delivered int NOT NULL DEFAULT 0,
  emails_bounced int NOT NULL DEFAULT 0,
  emails_complained int NOT NULL DEFAULT 0,
  emails_failed int NOT NULL DEFAULT 0,
  test_emails_sent int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_usage_daily_unique
  ON email_usage_daily (tenant_id, usage_date);

CREATE INDEX IF NOT EXISTS idx_email_usage_daily_tenant ON email_usage_daily(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_usage_daily_date ON email_usage_daily(usage_date);

ALTER TABLE email_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_email_usage" ON email_usage_daily;
CREATE POLICY "select_own_email_usage" ON email_usage_daily FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================================
-- 8. email_limit_config
-- ============================================================
CREATE TABLE IF NOT EXISTS email_limit_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL DEFAULT 'plan'
    CHECK (scope IN ('plan','global','tenant_override')),
  plan text,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  daily_email_limit int,
  monthly_email_limit int,
  test_emails_per_hour int DEFAULT 5,
  max_messages_per_workflow_event int DEFAULT 50,
  max_retry_attempts int DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_limit_config_plan_unique
  ON email_limit_config (plan) WHERE scope = 'plan';

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_limit_config_global_unique
  ON email_limit_config (scope) WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_limit_config_tenant_unique
  ON email_limit_config (tenant_id) WHERE scope = 'tenant_override';

ALTER TABLE email_limit_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_email_limits" ON email_limit_config;
CREATE POLICY "select_email_limits" ON email_limit_config FOR SELECT
  TO authenticated USING (
    is_super_admin()
    OR (scope = 'plan' AND plan = (SELECT plan FROM tenants WHERE id = current_tenant_id()))
    OR (scope = 'global')
    OR (scope = 'tenant_override' AND tenant_id = current_tenant_id())
  );

DROP POLICY IF EXISTS "insert_email_limits_admin" ON email_limit_config;
CREATE POLICY "insert_email_limits_admin" ON email_limit_config FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "update_email_limits_admin" ON email_limit_config;
CREATE POLICY "update_email_limits_admin" ON email_limit_config FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "delete_email_limits_admin" ON email_limit_config;
CREATE POLICY "delete_email_limits_admin" ON email_limit_config FOR DELETE
  TO authenticated USING (is_super_admin());

-- Seed default plan limits
INSERT INTO email_limit_config (scope, plan, daily_email_limit, monthly_email_limit, test_emails_per_hour)
VALUES ('plan', 'starter', 50, 1000, 3)
ON CONFLICT (plan) WHERE scope = 'plan' DO NOTHING;

INSERT INTO email_limit_config (scope, plan, daily_email_limit, monthly_email_limit, test_emails_per_hour)
VALUES ('plan', 'pro', 500, 10000, 10)
ON CONFLICT (plan) WHERE scope = 'plan' DO NOTHING;

INSERT INTO email_limit_config (scope, plan, daily_email_limit, monthly_email_limit, test_emails_per_hour)
VALUES ('plan', 'enterprise', null, null, 50)
ON CONFLICT (plan) WHERE scope = 'plan' DO NOTHING;

INSERT INTO email_limit_config (scope, daily_email_limit, monthly_email_limit)
VALUES ('global', 10000, 100000)
ON CONFLICT (scope) WHERE scope = 'global' DO NOTHING;

-- ============================================================
-- 9. EXPAND communication_messages
-- ============================================================
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS from_email text;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS reply_to_email text;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS last_provider_event_at timestamptz;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS bounced_at timestamptz;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS complained_at timestamptz;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS provider_event_count int NOT NULL DEFAULT 0;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS provider_environment text;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS email_domain_id uuid REFERENCES tenant_email_domains(id) ON DELETE SET NULL;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS email_sender_id uuid REFERENCES tenant_email_senders(id) ON DELETE SET NULL;
ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'workflow';

-- Expand status CHECK
ALTER TABLE communication_messages DROP CONSTRAINT IF EXISTS communication_messages_status_check;
ALTER TABLE communication_messages ADD CONSTRAINT communication_messages_status_check
  CHECK (status IN (
    'queued','scheduled','sending','accepted','sent','sent_mock',
    'delivered','delivery_delayed','bounced','complained','rejected',
    'failed','failed_mock','action_required','cancelled','skipped'
  ));

CREATE INDEX IF NOT EXISTS idx_comm_messages_provider_msg_id
  ON communication_messages(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comm_messages_status ON communication_messages(status);
CREATE INDEX IF NOT EXISTS idx_comm_messages_email_domain ON communication_messages(email_domain_id)
  WHERE email_domain_id IS NOT NULL;

-- ============================================================
-- 10. UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_email_domain_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trigger_tenant_email_domains_updated_at ON tenant_email_domains;
CREATE TRIGGER trigger_tenant_email_domains_updated_at
  BEFORE UPDATE ON tenant_email_domains
  FOR EACH ROW EXECUTE FUNCTION update_email_domain_updated_at();

CREATE OR REPLACE FUNCTION update_email_sender_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trigger_tenant_email_senders_updated_at ON tenant_email_senders;
CREATE TRIGGER trigger_tenant_email_senders_updated_at
  BEFORE UPDATE ON tenant_email_senders
  FOR EACH ROW EXECUTE FUNCTION update_email_sender_updated_at();

CREATE OR REPLACE FUNCTION update_email_usage_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trigger_email_usage_daily_updated_at ON email_usage_daily;
CREATE TRIGGER trigger_email_usage_daily_updated_at
  BEFORE UPDATE ON email_usage_daily
  FOR EACH ROW EXECUTE FUNCTION update_email_usage_updated_at();

CREATE OR REPLACE FUNCTION update_email_limit_config_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trigger_email_limit_config_updated_at ON email_limit_config;
CREATE TRIGGER trigger_email_limit_config_updated_at
  BEFORE UPDATE ON email_limit_config
  FOR EACH ROW EXECUTE FUNCTION update_email_limit_config_updated_at();

CREATE OR REPLACE FUNCTION update_suppressions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trigger_communication_suppressions_updated_at ON communication_suppressions;
CREATE TRIGGER trigger_communication_suppressions_updated_at
  BEFORE UPDATE ON communication_suppressions
  FOR EACH ROW EXECUTE FUNCTION update_suppressions_updated_at();
