-- ============================================================
-- Phase 5.4 Part 2: Inline helper functions (corrected)
-- ============================================================

-- check_provider_readiness_inline
CREATE OR REPLACE FUNCTION check_provider_readiness_inline(p_tenant_id uuid, p_channel text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
      'ready', true,
      'provider', ti.provider,
      'integration_id', ti.id::text
    )
    FROM tenant_integrations ti
    WHERE ti.tenant_id = p_tenant_id
      AND ti.category = 'communication'
      AND ti.connection_status = 'connected'
      AND ti.enabled = true
      AND (ti.capabilities->>p_channel) = 'true'
    ORDER BY ti.is_default DESC
    LIMIT 1),
    jsonb_build_object('ready', false, 'reason', 'no connected integration for ' || p_channel)
  );
$$;

REVOKE EXECUTE ON FUNCTION check_provider_readiness_inline(uuid, text) FROM PUBLIC, anon, authenticated;

-- check_consent_inline
CREATE OR REPLACE FUNCTION check_consent_inline(p_customer_id uuid, p_channel text, p_is_transactional boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer RECORD;
BEGIN
  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id LIMIT 1;

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
    IF p_channel = 'email' AND NOT COALESCE(v_customer.transactional_email_allowed, true) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'transactional_email_opt_out');
    ELSIF p_channel = 'sms' AND NOT COALESCE(v_customer.transactional_sms_allowed, true) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'transactional_sms_opt_out');
    ELSIF p_channel = 'whatsapp' AND NOT COALESCE(v_customer.transactional_whatsapp_allowed, true) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'transactional_whatsapp_opt_out');
    END IF;
  ELSE
    IF p_channel = 'email' AND NOT COALESCE(v_customer.marketing_email_consent, false) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'marketing_email_no_consent');
    ELSIF p_channel = 'sms' AND NOT COALESCE(v_customer.marketing_sms_consent, false) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'marketing_sms_no_consent');
    ELSIF p_channel = 'whatsapp' AND NOT COALESCE(v_customer.marketing_whatsapp_consent, false) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'marketing_whatsapp_no_consent');
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION check_consent_inline(uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- render_inline_template
CREATE OR REPLACE FUNCTION render_inline_template(p_template text, p_tenant_id uuid, p_reservation_id uuid, p_customer_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result text := p_template;
  v_customer RECORD;
  v_reservation RECORD;
  v_tenant RECORD;
BEGIN
  IF p_template IS NULL THEN RETURN ''; END IF;

  SELECT name INTO v_tenant FROM tenants WHERE id = p_tenant_id LIMIT 1;
  IF FOUND THEN
    v_result := replace(v_result, '{{tenant.name}}', COALESCE(v_tenant.name, ''));
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT first_name, last_name, full_name, email, phone INTO v_customer FROM customers WHERE id = p_customer_id LIMIT 1;
    IF FOUND THEN
      v_result := replace(v_result, '{{customer.first_name}}', COALESCE(v_customer.first_name, ''));
      v_result := replace(v_result, '{{customer.last_name}}', COALESCE(v_customer.last_name, ''));
      v_result := replace(v_result, '{{customer.full_name}}', COALESCE(v_customer.full_name, ''));
      v_result := replace(v_result, '{{customer.email}}', COALESCE(v_customer.email, ''));
      v_result := replace(v_result, '{{customer.phone}}', COALESCE(v_customer.phone, ''));
    END IF;
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    SELECT booking_reference, start_at::text, end_at::text, guest_count::text,
           total_amount::text, amount_paid::text, balance_due::text,
           booking_status, payment_status
    INTO v_reservation FROM reservations WHERE id = p_reservation_id LIMIT 1;
    IF FOUND THEN
      v_result := replace(v_result, '{{reservation.booking_reference}}', COALESCE(v_reservation.booking_reference, ''));
      v_result := replace(v_result, '{{reservation.start_at}}', COALESCE(v_reservation.start_at, ''));
      v_result := replace(v_result, '{{reservation.end_at}}', COALESCE(v_reservation.end_at, ''));
      v_result := replace(v_result, '{{reservation.guest_count}}', COALESCE(v_reservation.guest_count, ''));
      v_result := replace(v_result, '{{reservation.total_amount}}', COALESCE(v_reservation.total_amount, ''));
      v_result := replace(v_result, '{{reservation.amount_paid}}', COALESCE(v_reservation.amount_paid, ''));
      v_result := replace(v_result, '{{reservation.balance_due}}', COALESCE(v_reservation.balance_due, ''));
      v_result := replace(v_result, '{{reservation.booking_status}}', COALESCE(v_reservation.booking_status, ''));
      v_result := replace(v_result, '{{reservation.payment_status}}', COALESCE(v_reservation.payment_status, ''));
    END IF;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION render_inline_template(text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- validate_url_ssrf — returns a single jsonb instead of a set
CREATE OR REPLACE FUNCTION validate_url_ssrf(p_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hostname text;
  v_blocked_hosts text[] := ARRAY['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254', 'metadata.google.internal', 'metadata.aws.internal'];
  v_blocked_prefixes text[] := ARRAY['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.'];
  v_prefix text;
BEGIN
  IF p_url IS NULL OR p_url = '' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'empty URL');
  END IF;

  BEGIN
    v_hostname := lower(split_part(split_part(p_url, '://', 2), '/', 1));
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid URL');
  END;

  IF v_hostname = '' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid URL');
  END IF;

  IF v_hostname = ANY(v_blocked_hosts) THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'blocked host');
  END IF;

  FOREACH v_prefix IN ARRAY v_blocked_prefixes LOOP
    IF starts_with(v_hostname, v_prefix) THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'private IP range');
    END IF;
  END LOOP;

  IF v_hostname LIKE '%.internal' OR v_hostname LIKE '%.local' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'internal/local TLD');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', null);
END;
$$;

REVOKE EXECUTE ON FUNCTION validate_url_ssrf(text) FROM PUBLIC, anon, authenticated;

-- process_queued_messages_db
CREATE OR REPLACE FUNCTION process_queued_messages_db()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg RECORD;
BEGIN
  FOR v_msg IN
    SELECT id, tenant_id, channel, provider, recipient, metadata
    FROM communication_messages
    WHERE status = 'queued'
    ORDER BY queued_at
    LIMIT 20
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE communication_messages SET status = 'sending', updated_at = now()
    WHERE id = v_msg.id AND status = 'queued';

    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE communication_messages SET
      status = 'failed',
      failure_code = 'NO_ADAPTER',
      failure_reason = 'No adapter configured for provider: ' || COALESCE(v_msg.provider, 'none'),
      failed_at = now(),
      updated_at = now()
    WHERE id = v_msg.id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION process_queued_messages_db FROM PUBLIC, anon, authenticated;
