/*
# Phase 5.5 Part 2: Email Readiness and Status Update RPCs

## Summary
- check_tenant_email_readiness: centralized email readiness validation
- update_message_from_provider_event: safe status update from webhook events with regression prevention
- increment_email_usage: atomic usage counter increment
- check_email_usage_limit: check if tenant is within limits
- add_communication_suppression: add suppression record with consent side-effects
- is_address_suppressed: check if address is suppressed
- record_provider_event: idempotent storage of raw provider webhook events

## Security
- All functions are SECURITY DEFINER, revoked from anon/public
- check_tenant_email_readiness, check_email_usage_limit, is_address_suppressed: granted to authenticated
- All write functions: service-role only
*/

-- ============================================================
-- 1. check_tenant_email_readiness
-- ============================================================
CREATE OR REPLACE FUNCTION check_tenant_email_readiness(p_tenant_id uuid, p_recipient text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_platform_connected boolean := false;
  v_domain_count int := 0;
  v_verified_domain_count int := 0;
  v_sender_found boolean := false;
  v_default_sender_id uuid;
  v_tenant_suspended boolean := false;
  v_usage_today int := 0;
  v_daily_limit int;
  v_monthly_limit int;
  v_usage_this_month int := 0;
  v_recipient_suppressed boolean := false;
  v_reason text := '';
  v_ready boolean := true;
BEGIN
  -- Check platform Resend integration
  SELECT
    connection_status = 'connected' AND enabled = true
  INTO v_platform_connected
  FROM platform_integrations
  WHERE category = 'communication' AND provider = 'resend'
  ORDER BY updated_at DESC LIMIT 1;

  IF NOT v_platform_connected THEN
    v_ready := false;
    v_reason := 'platform_provider_not_configured';
  END IF;

  -- Check tenant email domains
  SELECT count(*) INTO v_domain_count
  FROM tenant_email_domains
  WHERE tenant_id = p_tenant_id AND status NOT IN ('disabled');

  SELECT count(*) INTO v_verified_domain_count
  FROM tenant_email_domains
  WHERE tenant_id = p_tenant_id AND status IN ('verified', 'ready') AND sending_enabled = true;

  IF v_verified_domain_count = 0 THEN
    v_ready := false;
    v_reason := CASE WHEN v_domain_count > 0 THEN 'domain_not_verified' ELSE 'no_verified_domain' END;
  END IF;

  -- Check default sender
  SELECT id INTO v_default_sender_id
  FROM tenant_email_senders
  WHERE tenant_id = p_tenant_id AND is_default = true AND is_active = true AND archived_at IS NULL
  LIMIT 1;

  v_sender_found := FOUND;

  IF NOT v_sender_found THEN
    v_ready := false;
    v_reason := CASE WHEN v_reason = '' THEN 'no_default_sender' ELSE v_reason END;
  END IF;

  -- Check tenant not suspended
  SELECT COALESCE(is_suspended, false) INTO v_tenant_suspended FROM tenants WHERE id = p_tenant_id;
  IF v_tenant_suspended THEN
    v_ready := false;
    v_reason := 'tenant_suspended';
  END IF;

  -- Check usage limits
  SELECT COALESCE(SUM(emails_accepted), 0) INTO v_usage_today
  FROM email_usage_daily WHERE tenant_id = p_tenant_id AND usage_date = CURRENT_DATE;

  SELECT COALESCE(SUM(emails_accepted), 0) INTO v_usage_this_month
  FROM email_usage_daily
  WHERE tenant_id = p_tenant_id AND usage_date >= date_trunc('month', CURRENT_DATE)::date;

  SELECT
    COALESCE(
      (SELECT daily_email_limit FROM email_limit_config WHERE scope = 'tenant_override' AND tenant_id = p_tenant_id),
      (SELECT daily_email_limit FROM email_limit_config WHERE scope = 'plan' AND plan = (SELECT plan FROM tenants WHERE id = p_tenant_id)),
      (SELECT daily_email_limit FROM email_limit_config WHERE scope = 'global')
    ),
    COALESCE(
      (SELECT monthly_email_limit FROM email_limit_config WHERE scope = 'tenant_override' AND tenant_id = p_tenant_id),
      (SELECT monthly_email_limit FROM email_limit_config WHERE scope = 'plan' AND plan = (SELECT plan FROM tenants WHERE id = p_tenant_id)),
      (SELECT monthly_email_limit FROM email_limit_config WHERE scope = 'global')
    )
  INTO v_daily_limit, v_monthly_limit;

  IF v_daily_limit IS NOT NULL AND v_usage_today >= v_daily_limit THEN
    v_ready := false;
    v_reason := 'daily_limit_reached';
  END IF;

  IF v_monthly_limit IS NOT NULL AND v_usage_this_month >= v_monthly_limit THEN
    v_ready := false;
    v_reason := 'monthly_limit_reached';
  END IF;

  -- Check recipient suppression
  IF p_recipient IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM communication_suppressions
      WHERE tenant_id = p_tenant_id AND channel = 'email' AND lower(address) = lower(p_recipient) AND active = true
    ) INTO v_recipient_suppressed;

    IF v_recipient_suppressed THEN
      v_ready := false;
      v_reason := 'recipient_suppressed';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ready', v_ready,
    'reason', CASE WHEN v_ready THEN null ELSE v_reason END,
    'provider', 'resend',
    'domain_status', CASE
      WHEN v_verified_domain_count > 0 THEN 'verified'
      WHEN v_domain_count > 0 THEN 'pending'
      ELSE 'not_configured'
    END,
    'sender_status', CASE WHEN v_sender_found THEN 'configured' ELSE 'not_configured' END,
    'usage_status', jsonb_build_object(
      'today', v_usage_today,
      'this_month', v_usage_this_month,
      'daily_limit', v_daily_limit,
      'monthly_limit', v_monthly_limit
    ),
    'integration_status', CASE WHEN v_platform_connected THEN 'connected' ELSE 'not_configured' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_tenant_email_readiness(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION check_tenant_email_readiness(uuid, text) FROM anon, PUBLIC;

-- ============================================================
-- 2. update_message_from_provider_event
-- ============================================================
CREATE OR REPLACE FUNCTION update_message_from_provider_event(
  p_provider_message_id text,
  p_new_status text,
  p_event_type text,
  p_failure_reason text DEFAULT NULL,
  p_provider_event_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg communication_messages%ROWTYPE;
  v_status_map jsonb := '{
    "queued": 0, "scheduled": 5, "sending": 10, "accepted": 20,
    "sent": 30, "sent_mock": 30, "delivered": 40, "delivery_delayed": 35,
    "bounced": 90, "complained": 91, "rejected": 92, "failed": 95,
    "failed_mock": 95, "action_required": 85, "cancelled": 99, "skipped": 99
  }';
  v_current_rank int;
  v_new_rank int;
BEGIN
  SELECT * INTO v_msg FROM communication_messages
  WHERE provider_message_id = p_provider_message_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_not_found');
  END IF;

  v_current_rank := COALESCE((v_status_map->>v_msg.status)::int, 0);
  v_new_rank := COALESCE((v_status_map->>p_new_status)::int, 0);

  -- Terminal states are sticky
  IF v_msg.status IN ('bounced','complained','rejected','failed','cancelled') THEN
    RETURN jsonb_build_object('success', true, 'status', v_msg.status, 'note', 'terminal_state_unchanged');
  END IF;

  -- Prevent regression
  IF v_new_rank < v_current_rank THEN
    RETURN jsonb_build_object('success', true, 'status', v_msg.status, 'note', 'no_regression');
  END IF;

  UPDATE communication_messages SET
    status = p_new_status,
    provider_status = p_new_status,
    last_provider_event_at = now(),
    provider_event_count = provider_event_count + 1,
    failure_reason = CASE WHEN p_failure_reason IS NOT NULL THEN p_failure_reason ELSE failure_reason END,
    sent_at = CASE WHEN p_new_status IN ('sent','sent_mock','delivered','delivery_delayed') AND sent_at IS NULL THEN now() ELSE sent_at END,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN now() ELSE delivered_at END,
    bounced_at = CASE WHEN p_new_status = 'bounced' THEN now() ELSE bounced_at END,
    complained_at = CASE WHEN p_new_status = 'complained' THEN now() ELSE complained_at END,
    failed_at = CASE WHEN p_new_status IN ('failed','rejected') THEN now() ELSE failed_at END,
    updated_at = now()
  WHERE id = v_msg.id;

  -- Update daily usage counters
  IF p_new_status = 'delivered' THEN
    UPDATE email_usage_daily SET emails_delivered = emails_delivered + 1
    WHERE tenant_id = v_msg.tenant_id AND usage_date = CURRENT_DATE;
  ELSIF p_new_status = 'bounced' THEN
    UPDATE email_usage_daily SET emails_bounced = emails_bounced + 1
    WHERE tenant_id = v_msg.tenant_id AND usage_date = CURRENT_DATE;
  ELSIF p_new_status = 'complained' THEN
    UPDATE email_usage_daily SET emails_complained = emails_complained + 1
    WHERE tenant_id = v_msg.tenant_id AND usage_date = CURRENT_DATE;
  ELSIF p_new_status IN ('failed','rejected') THEN
    UPDATE email_usage_daily SET emails_failed = emails_failed + 1
    WHERE tenant_id = v_msg.tenant_id AND usage_date = CURRENT_DATE;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', p_new_status, 'message_id', v_msg.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION update_message_from_provider_event(text, text, text, text, text) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. increment_email_usage
-- ============================================================
CREATE OR REPLACE FUNCTION increment_email_usage(p_tenant_id uuid, p_is_test boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO email_usage_daily (tenant_id, usage_date, emails_accepted, test_emails_sent)
  VALUES (p_tenant_id, CURRENT_DATE, CASE WHEN NOT p_is_test THEN 1 ELSE 0 END, CASE WHEN p_is_test THEN 1 ELSE 0 END)
  ON CONFLICT (tenant_id, usage_date)
  DO UPDATE SET
    emails_accepted = email_usage_daily.emails_accepted + (CASE WHEN NOT p_is_test THEN 1 ELSE 0 END),
    test_emails_sent = email_usage_daily.test_emails_sent + (CASE WHEN p_is_test THEN 1 ELSE 0 END),
    updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION increment_email_usage(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 4. check_email_usage_limit
-- ============================================================
CREATE OR REPLACE FUNCTION check_email_usage_limit(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage_today int;
  v_usage_this_month int;
  v_daily_limit int;
  v_monthly_limit int;
  v_within_limit boolean := true;
  v_reason text := null;
BEGIN
  SELECT COALESCE(SUM(emails_accepted), 0) INTO v_usage_today
  FROM email_usage_daily WHERE tenant_id = p_tenant_id AND usage_date = CURRENT_DATE;

  SELECT COALESCE(SUM(emails_accepted), 0) INTO v_usage_this_month
  FROM email_usage_daily
  WHERE tenant_id = p_tenant_id AND usage_date >= date_trunc('month', CURRENT_DATE)::date;

  SELECT
    COALESCE(
      (SELECT daily_email_limit FROM email_limit_config WHERE scope = 'tenant_override' AND tenant_id = p_tenant_id),
      (SELECT daily_email_limit FROM email_limit_config WHERE scope = 'plan' AND plan = (SELECT plan FROM tenants WHERE id = p_tenant_id)),
      (SELECT daily_email_limit FROM email_limit_config WHERE scope = 'global')
    ),
    COALESCE(
      (SELECT monthly_email_limit FROM email_limit_config WHERE scope = 'tenant_override' AND tenant_id = p_tenant_id),
      (SELECT monthly_email_limit FROM email_limit_config WHERE scope = 'plan' AND plan = (SELECT plan FROM tenants WHERE id = p_tenant_id)),
      (SELECT monthly_email_limit FROM email_limit_config WHERE scope = 'global')
    )
  INTO v_daily_limit, v_monthly_limit;

  IF v_daily_limit IS NOT NULL AND v_usage_today >= v_daily_limit THEN
    v_within_limit := false;
    v_reason := 'daily_limit_reached';
  ELSIF v_monthly_limit IS NOT NULL AND v_usage_this_month >= v_monthly_limit THEN
    v_within_limit := false;
    v_reason := 'monthly_limit_reached';
  END IF;

  RETURN jsonb_build_object(
    'within_limit', v_within_limit,
    'reason', v_reason,
    'usage_today', v_usage_today,
    'usage_this_month', v_usage_this_month,
    'daily_limit', v_daily_limit,
    'monthly_limit', v_monthly_limit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION check_email_usage_limit(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION check_email_usage_limit(uuid) FROM anon, PUBLIC;

-- ============================================================
-- 5. add_communication_suppression
-- ============================================================
CREATE OR REPLACE FUNCTION add_communication_suppression(
  p_tenant_id uuid,
  p_channel text,
  p_address text,
  p_reason text,
  p_source text DEFAULT 'system',
  p_provider text DEFAULT 'resend',
  p_provider_event_id text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO communication_suppressions (tenant_id, customer_id, channel, address, reason, source, provider, provider_event_id, active)
  VALUES (p_tenant_id, p_customer_id, p_channel, lower(p_address), p_reason, p_source, p_provider, p_provider_event_id, true)
  ON CONFLICT (tenant_id, channel, lower(address)) WHERE active = true
  DO UPDATE SET
    reason = EXCLUDED.reason,
    source = EXCLUDED.source,
    provider = EXCLUDED.provider,
    provider_event_id = COALESCE(EXCLUDED.provider_event_id, communication_suppressions.provider_event_id),
    updated_at = now()
  RETURNING id INTO v_id;

  -- Complaint: disable marketing consent
  IF p_reason = 'complaint' AND p_customer_id IS NOT NULL THEN
    UPDATE customers SET
      marketing_email_consent = false,
      consent_updated_at = now(),
      consent_source = 'provider_complaint'
    WHERE id = p_customer_id;
  END IF;

  -- Hard bounce: mark transactional email as not allowed
  IF p_reason = 'hard_bounce' AND p_customer_id IS NOT NULL THEN
    UPDATE customers SET
      transactional_email_allowed = false,
      consent_updated_at = now(),
      consent_source = 'hard_bounce'
    WHERE id = p_customer_id AND email = p_address;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION add_communication_suppression(uuid, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 6. is_address_suppressed
-- ============================================================
CREATE OR REPLACE FUNCTION is_address_suppressed(p_tenant_id uuid, p_channel text, p_address text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM communication_suppressions
    WHERE tenant_id = p_tenant_id
      AND channel = p_channel
      AND lower(address) = lower(p_address)
      AND active = true
  );
$$;

GRANT EXECUTE ON FUNCTION is_address_suppressed(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION is_address_suppressed(uuid, text, text) FROM anon, PUBLIC;

-- ============================================================
-- 7. record_provider_event
-- ============================================================
CREATE OR REPLACE FUNCTION record_provider_event(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_environment text DEFAULT NULL,
  p_message_id text DEFAULT NULL,
  p_communication_message_id uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM provider_events
  WHERE provider = p_provider
    AND COALESCE(environment, '') = COALESCE(p_environment, '')
    AND provider_event_id = p_provider_event_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'id', v_existing, 'duplicate', true);
  END IF;

  INSERT INTO provider_events (provider, environment, provider_event_id, event_type, message_id, communication_message_id, tenant_id, raw_payload, processed, processed_at)
  VALUES (p_provider, p_environment, p_provider_event_id, p_event_type, p_message_id, p_communication_message_id, p_tenant_id, p_raw_payload, true, now())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'duplicate', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION record_provider_event(text, text, text, text, text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
