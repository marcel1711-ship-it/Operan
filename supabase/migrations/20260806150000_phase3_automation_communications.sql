/*
# Phase 3 — Automation, Communications & Email Infrastructure

## New Tables (10)
1. worker_health_log — Edge function health monitoring
2. tenant_communication_settings — Tenant comm provider settings
3. communication_templates — Email/SMS/WhatsApp templates
4. automation_workflows — Workflow definitions with trigger config
5. automation_workflow_versions — Versioned workflow definitions (JSONB)
6. automation_runs — Workflow execution runs with idempotency
7. automation_step_runs — Individual step execution within a run
8. tenant_email_domains — Email domain configuration (Resend)
9. tenant_email_senders — Email sender identities
10. communication_messages — Sent message log with full lifecycle

## New Functions (1)
- log_worker_invocation — Record edge function health metrics

## Security
- RLS enabled on all tables with is_tenant_member() policies
- worker_health_log: super_admin read-only, open insert for edge functions
*/

-- ============================================================
-- 1. worker_health_log
-- ============================================================

CREATE TABLE IF NOT EXISTS worker_health_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name text NOT NULL,
  invoked_at timestamptz NOT NULL DEFAULT now(),
  success boolean NOT NULL,
  processed_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  dead_letter_count int NOT NULL DEFAULT 0,
  duration_ms int,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_health_worker ON worker_health_log(worker_name, invoked_at DESC);
ALTER TABLE worker_health_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_select_worker_health" ON worker_health_log FOR SELECT
  TO authenticated USING (is_super_admin());
CREATE POLICY "insert_worker_health" ON worker_health_log FOR INSERT
  TO authenticated WITH CHECK (true);

-- ============================================================
-- 2. tenant_communication_settings
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_communication_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  default_email_provider text,
  default_sms_provider text,
  default_whatsapp_provider text,
  sender_name text,
  from_email text,
  reply_to_email text,
  sms_sender text,
  whatsapp_business_number text,
  default_language text NOT NULL DEFAULT 'en',
  business_timezone text NOT NULL DEFAULT 'UTC',
  quiet_hours_start time,
  quiet_hours_end time,
  test_recipient_email text,
  test_recipient_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_communication_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_comm_settings" ON tenant_communication_settings FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_comm_settings" ON tenant_communication_settings FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_comm_settings" ON tenant_communication_settings FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 3. communication_templates
-- ============================================================

CREATE TABLE IF NOT EXISTS communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'in_app')),
  category text NOT NULL DEFAULT 'custom',
  subject text,
  body text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  variables_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_system_template boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_comm_templates_tenant ON communication_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comm_templates_channel ON communication_templates(tenant_id, channel) WHERE is_active = true;
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_templates" ON communication_templates FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_templates" ON communication_templates FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_templates" ON communication_templates FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 4. automation_workflows
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL,
  trigger_configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  active_version integer,
  is_template boolean NOT NULL DEFAULT false,
  test_mode boolean NOT NULL DEFAULT false,
  created_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_workflows_tenant ON automation_workflows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON automation_workflows(tenant_id, status) WHERE status IN ('active', 'paused');
ALTER TABLE automation_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_workflows" ON automation_workflows FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_workflows" ON automation_workflows FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_workflows" ON automation_workflows FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "delete_own_workflows" ON automation_workflows FOR DELETE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 5. automation_workflow_versions
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  definition jsonb NOT NULL,
  trigger_type text NOT NULL,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow ON automation_workflow_versions(workflow_id);
ALTER TABLE automation_workflow_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_workflow_versions" ON automation_workflow_versions FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_workflow_versions" ON automation_workflow_versions FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_workflow_versions" ON automation_workflow_versions FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 6. automation_runs
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  workflow_version_id uuid NOT NULL REFERENCES automation_workflow_versions(id) ON DELETE CASCADE,
  trigger_event_id uuid,
  entity_type text,
  entity_id uuid,
  reservation_id uuid,
  customer_id uuid,
  opportunity_id uuid,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  current_node_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_runs_workflow ON automation_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_runs_tenant ON automation_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON automation_runs(status) WHERE status = 'running';
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_runs" ON automation_runs FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_runs" ON automation_runs FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_runs" ON automation_runs FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 7. automation_step_runs
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  automation_run_id uuid NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'running', 'completed', 'failed', 'cancelled', 'skipped', 'dead_letter', 'action_required')),
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  input jsonb,
  output jsonb,
  error_message text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_step_runs_run ON automation_step_runs(automation_run_id);
CREATE INDEX IF NOT EXISTS idx_step_runs_status ON automation_step_runs(status) WHERE status IN ('pending', 'scheduled', 'running');
ALTER TABLE automation_step_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_step_runs" ON automation_step_runs FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_step_runs" ON automation_step_runs FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_step_runs" ON automation_step_runs FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 8. tenant_email_domains
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_email_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'resend',
  provider_domain_id text,
  domain text NOT NULL,
  subdomain text,
  region text,
  status text NOT NULL DEFAULT 'not_configured' CHECK (status IN ('not_configured', 'pending', 'verifying', 'verified', 'active', 'failed', 'suspended', 'expired', 'dns_error', 'temporary_failure')),
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

CREATE INDEX IF NOT EXISTS idx_email_domains_tenant ON tenant_email_domains(tenant_id);
ALTER TABLE tenant_email_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_email_domains" ON tenant_email_domains FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_email_domains" ON tenant_email_domains FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_email_domains" ON tenant_email_domains FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "delete_own_email_domains" ON tenant_email_domains FOR DELETE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 9. tenant_email_senders
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

CREATE INDEX IF NOT EXISTS idx_email_senders_tenant ON tenant_email_senders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_senders_domain ON tenant_email_senders(email_domain_id);
ALTER TABLE tenant_email_senders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_email_senders" ON tenant_email_senders FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_email_senders" ON tenant_email_senders FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_email_senders" ON tenant_email_senders FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 10. communication_messages
-- ============================================================

CREATE TABLE IF NOT EXISTS communication_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  opportunity_id uuid,
  workflow_id uuid,
  workflow_run_id uuid,
  workflow_step_run_id uuid,
  template_id uuid REFERENCES communication_templates(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'in_app')),
  provider text NOT NULL DEFAULT 'mock',
  integration_id uuid,
  recipient text NOT NULL,
  sender_name text,
  from_email text,
  reply_to_email text,
  rendered_subject text,
  rendered_body text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'scheduled', 'sending', 'accepted', 'sent', 'sent_mock', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'rejected', 'failed', 'failed_mock', 'action_required', 'cancelled', 'skipped')),
  provider_message_id text,
  provider_status text,
  provider_ready boolean DEFAULT true,
  failure_code text,
  failure_reason text,
  scheduled_for timestamptz,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  last_provider_event_at timestamptz,
  provider_event_count int NOT NULL DEFAULT 0,
  provider_environment text,
  email_domain_id uuid REFERENCES tenant_email_domains(id) ON DELETE SET NULL,
  email_sender_id uuid REFERENCES tenant_email_senders(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'workflow',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_tenant ON communication_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON communication_messages(status) WHERE status IN ('queued', 'scheduled', 'sending');
CREATE INDEX IF NOT EXISTS idx_messages_provider_msg_id ON communication_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reservation ON communication_messages(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_customer ON communication_messages(customer_id) WHERE customer_id IS NOT NULL;
ALTER TABLE communication_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_messages" ON communication_messages FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "insert_own_messages" ON communication_messages FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));
CREATE POLICY "update_own_messages" ON communication_messages FOR UPDATE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id))
  WITH CHECK (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 11. log_worker_invocation RPC
-- ============================================================

CREATE OR REPLACE FUNCTION log_worker_invocation(
  p_worker_name text, p_success boolean,
  p_processed_count int DEFAULT 0, p_failed_count int DEFAULT 0,
  p_dead_letter_count int DEFAULT 0, p_duration_ms int DEFAULT NULL,
  p_error_message text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO worker_health_log (
    worker_name, success, processed_count, failed_count,
    dead_letter_count, duration_ms, error_message
  ) VALUES (
    p_worker_name, p_success, p_processed_count, p_failed_count,
    p_dead_letter_count, p_duration_ms, p_error_message
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_worker_invocation TO authenticated;

NOTIFY pgrst, 'reload schema';
