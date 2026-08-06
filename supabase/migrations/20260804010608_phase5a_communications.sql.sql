-- ============================================================
-- Phase 5A: Communications Architecture
-- ============================================================

-- 1. Communication templates
CREATE TABLE IF NOT EXISTS communication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp','in_app')),
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
  archived_at timestamptz,
  CONSTRAINT tpl_email_subject CHECK (
    channel <> 'email' OR (subject IS NOT NULL AND length(trim(subject)) > 0)
  ),
  CONSTRAINT tpl_category_valid CHECK (
    category IN ('booking_confirmation','booking_request_received','payment_received','payment_failed',
    'waiver_request','waiver_reminder','balance_due','upcoming_trip','captain_assignment',
    'cancellation','refund','review_request','custom')
  )
);

CREATE INDEX idx_comm_tpl_tenant ON communication_templates(tenant_id);
CREATE INDEX idx_comm_tpl_tenant_channel ON communication_templates(tenant_id, channel);
CREATE INDEX idx_comm_tpl_tenant_active ON communication_templates(tenant_id, is_active) WHERE is_active = true;

-- 2. Communication messages (message log + queue)
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
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp','in_app')),
  provider text NOT NULL DEFAULT 'mock',
  integration_id uuid,
  recipient text NOT NULL,
  rendered_subject text,
  rendered_body text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','scheduled','sending','sent','delivered','failed','cancelled','skipped')),
  provider_message_id text,
  provider_status text,
  failure_code text,
  failure_reason text,
  scheduled_for timestamptz,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT msg_idem_unique UNIQUE (idempotency_key, tenant_id)
);

CREATE INDEX idx_comm_msg_tenant ON communication_messages(tenant_id);
CREATE INDEX idx_comm_msg_status ON communication_messages(status) WHERE status IN ('queued','scheduled','sending');
CREATE INDEX idx_comm_msg_reservation ON communication_messages(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX idx_comm_msg_customer ON communication_messages(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX idx_comm_msg_scheduled ON communication_messages(scheduled_for) WHERE status = 'scheduled';

-- 3. Tenant communication settings
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

CREATE INDEX idx_comm_settings_tenant ON tenant_communication_settings(tenant_id);

-- 4. Add consent columns to customers
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS transactional_email_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS transactional_sms_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS transactional_whatsapp_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS marketing_email_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_whatsapp_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_source text,
  ADD COLUMN IF NOT EXISTS consent_updated_at timestamptz;

-- 5. Enable RLS on all new tables
ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_communication_settings ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies: communication_templates (tenant-scoped CRUD)
CREATE POLICY "comm_tpl_select_tenant" ON communication_templates
  FOR SELECT TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "comm_tpl_insert_tenant" ON communication_templates
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "comm_tpl_update_tenant" ON communication_templates
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "comm_tpl_delete_tenant" ON communication_templates
  FOR DELETE TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id());

-- 7. RLS Policies: communication_messages (tenant-scoped SELECT only, no direct writes)
CREATE POLICY "comm_msg_select_tenant" ON communication_messages
  FOR SELECT TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id());

-- No INSERT/UPDATE/DELETE policies for authenticated — only service_role can write

-- 8. RLS Policies: tenant_communication_settings (tenant-scoped CRUD)
CREATE POLICY "comm_settings_select_tenant" ON tenant_communication_settings
  FOR SELECT TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "comm_settings_insert_tenant" ON tenant_communication_settings
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "comm_settings_update_tenant" ON tenant_communication_settings
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "comm_settings_delete_tenant" ON tenant_communication_settings
  FOR DELETE TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id());

-- 9. Revoke direct table grants
REVOKE INSERT, UPDATE, DELETE ON communication_messages FROM anon, authenticated;
REVOKE ALL ON communication_templates FROM anon;
REVOKE ALL ON tenant_communication_settings FROM anon;

-- 10. Add messaging catalog entries
INSERT INTO integration_catalog (category, provider, display_name, description, icon, is_active, config_schema, sort_order)
VALUES
  ('messaging', 'resend', 'Resend', 'Send transactional emails via Resend API', 'Mail', true, '{}'::jsonb, 22),
  ('messaging', 'sendgrid', 'SendGrid', 'Email delivery and marketing via SendGrid', 'Mail', true, '{}'::jsonb, 23),
  ('messaging', 'postmark', 'Postmark', 'Transactional email via Postmark', 'Mail', true, '{}'::jsonb, 24),
  ('messaging', 'amazon_ses', 'Amazon SES', 'Email delivery via Amazon Simple Email Service', 'Mail', true, '{}'::jsonb, 25),
  ('messaging', 'twilio_sms', 'Twilio SMS', 'SMS notifications via Twilio', 'MessageSquare', true, '{}'::jsonb, 26),
  ('messaging', 'telnyx', 'Telnyx', 'SMS and voice via Telnyx', 'MessageSquare', true, '{}'::jsonb, 27),
  ('messaging', 'meta_whatsapp', 'WhatsApp (Meta Cloud API)', 'WhatsApp messaging via Meta Cloud API', 'MessageSquare', true, '{}'::jsonb, 28),
  ('messaging', 'twilio_whatsapp', 'WhatsApp (Twilio)', 'WhatsApp messaging via Twilio', 'MessageSquare', true, '{}'::jsonb, 29)
ON CONFLICT DO NOTHING;

-- 11. Updated_at triggers
CREATE TRIGGER trg_comm_tpl_updated_at
  BEFORE UPDATE ON communication_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_comm_msg_updated_at
  BEFORE UPDATE ON communication_messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_comm_settings_updated_at
  BEFORE UPDATE ON tenant_communication_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 12. RPC: Queue a communication message (service-role only)
CREATE OR REPLACE FUNCTION public.queue_communication_message(
  p_tenant_id uuid,
  p_channel text,
  p_recipient text,
  p_rendered_body text,
  p_provider text DEFAULT 'mock',
  p_rendered_subject text DEFAULT NULL,
  p_template_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_reservation_id uuid DEFAULT NULL,
  p_workflow_id uuid DEFAULT NULL,
  p_workflow_run_id uuid DEFAULT NULL,
  p_workflow_step_run_id uuid DEFAULT NULL,
  p_integration_id uuid DEFAULT NULL,
  p_scheduled_for timestamptz DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_idem text;
BEGIN
  v_idem := COALESCE(p_idempotency_key, 'msg-' || gen_random_uuid()::text);

  INSERT INTO communication_messages (
    tenant_id, channel, provider, recipient,
    rendered_subject, rendered_body, template_id,
    customer_id, reservation_id, workflow_id, workflow_run_id, workflow_step_run_id,
    integration_id, scheduled_for, idempotency_key, metadata, status
  ) VALUES (
    p_tenant_id, p_channel, p_provider, p_recipient,
    p_rendered_subject, p_rendered_body, p_template_id,
    p_customer_id, p_reservation_id, p_workflow_id, p_workflow_run_id, p_workflow_step_run_id,
    p_integration_id, p_scheduled_for, v_idem, p_metadata,
    CASE WHEN p_scheduled_for IS NOT NULL THEN 'scheduled' ELSE 'queued' END
  )
  ON CONFLICT (idempotency_key, tenant_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('message_id', v_id, 'status', 'queued');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.queue_communication_message(
  uuid, text, text, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, text, jsonb
) FROM PUBLIC, anon, authenticated;

-- 13. RPC: Update message status (service-role only)
CREATE OR REPLACE FUNCTION public.update_communication_message_status(
  p_message_id uuid,
  p_status text,
  p_provider_message_id text DEFAULT NULL,
  p_provider_status text DEFAULT NULL,
  p_failure_code text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE communication_messages SET
    status = p_status,
    provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
    provider_status = COALESCE(p_provider_status, provider_status),
    failure_code = COALESCE(p_failure_code, failure_code),
    failure_reason = COALESCE(p_failure_reason, failure_reason),
    sent_at = CASE WHEN p_status IN ('sent','delivered') AND sent_at IS NULL THEN now() ELSE sent_at END,
    delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END,
    failed_at = CASE WHEN p_status = 'failed' THEN now() ELSE failed_at END
  WHERE id = p_message_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_communication_message_status(
  uuid, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;

-- 14. RPC: Check communication consent
CREATE OR REPLACE FUNCTION public.check_communication_consent(
  p_customer_id uuid,
  p_channel text,
  p_is_transactional boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer RECORD;
BEGIN
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'customer_not_found');
  END IF;

  IF v_customer.do_not_contact THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'do_not_contact');
  END IF;

  IF v_customer.unsubscribed_at IS NOT NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'unsubscribed');
  END IF;

  IF p_is_transactional THEN
    IF p_channel = 'email' AND NOT v_customer.transactional_email_allowed THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'transactional_email_opt_out');
    END IF;
    IF p_channel = 'sms' AND NOT v_customer.transactional_sms_allowed THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'transactional_sms_opt_out');
    END IF;
    IF p_channel = 'whatsapp' AND NOT v_customer.transactional_whatsapp_allowed THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'transactional_whatsapp_opt_out');
    END IF;
  ELSE
    IF p_channel = 'email' AND NOT v_customer.marketing_email_consent THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'marketing_email_no_consent');
    END IF;
    IF p_channel = 'sms' AND NOT v_customer.marketing_sms_consent THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'marketing_sms_no_consent');
    END IF;
    IF p_channel = 'whatsapp' AND NOT v_customer.marketing_whatsapp_consent THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'marketing_whatsapp_no_consent');
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_communication_consent(uuid, text, boolean) FROM PUBLIC, anon;
