-- ============================================================
-- Phase 4 Migration 4: Core RPCs — Checkout, Confirm, Fail, Refund, Outbox, Opportunity Sync
-- ============================================================

-- 1. create_booking_checkout — creates pending payment record, returns payment_id + metadata
-- Called server-side after validating reservation, tenant, and integration readiness
CREATE OR REPLACE FUNCTION create_booking_checkout(
  p_reservation_id uuid,
  p_integration_id uuid,
  p_provider text,
  p_environment text,
  p_payment_type text,
  p_amount numeric,
  p_currency text,
  p_idempotency_key text,
  p_provider_checkout_id text DEFAULT NULL,
  p_platform_fee_amount numeric DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_reservation RECORD;
  v_tenant_id uuid;
  v_payment_id uuid;
BEGIN
  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Reservation not found');
  END IF;

  v_tenant_id := v_reservation.tenant_id;

  -- Validate reservation can accept payment
  IF v_reservation.booking_status NOT IN ('awaiting_payment') THEN
    RETURN jsonb_build_object('error', 'Reservation is not awaiting payment');
  END IF;

  IF v_reservation.expires_at IS NOT NULL AND v_reservation.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'Booking hold has expired');
  END IF;

  -- Create payment record (idempotent)
  INSERT INTO payments (
    tenant_id, reservation_id, customer_id, integration_id,
    provider, environment, payment_type, amount, currency,
    status, provider_checkout_session_id, platform_fee_amount,
    idempotency_key, metadata
  ) VALUES (
    v_tenant_id, p_reservation_id, v_reservation.customer_id, p_integration_id,
    p_provider, p_environment, p_payment_type, p_amount, p_currency,
    'pending', p_provider_checkout_id, p_platform_fee_amount,
    p_idempotency_key, p_metadata
  )
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_payment_id;

  -- Update reservation payment_status to processing
  UPDATE reservations
  SET payment_status = 'processing', updated_at = now()
  WHERE id = p_reservation_id AND payment_status IN ('unpaid', 'processing');

  -- Emit domain event
  PERFORM emit_domain_event(
    v_tenant_id, 'payment.checkout_created', 'payment', v_payment_id,
    jsonb_build_object('amount', p_amount, 'currency', p_currency, 'payment_type', p_payment_type, 'provider', p_provider),
    p_reservation_id, v_reservation.customer_id, NULL, v_payment_id,
    'checkout_' || p_idempotency_key
  );

  -- Emit activity log
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_name, metadata)
  VALUES (v_tenant_id, 'reservation', p_reservation_id, 'checkout_created', 'system',
    jsonb_build_object('payment_id', v_payment_id, 'amount', p_amount, 'provider', p_provider));

  RETURN jsonb_build_object('payment_id', v_payment_id, 'reservation_id', p_reservation_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_booking_checkout TO authenticated;

-- 2. confirm_payment_from_webhook — idempotent payment confirmation
-- Called by webhook handler after verified Stripe event
CREATE OR REPLACE FUNCTION confirm_payment_from_webhook(
  p_provider text,
  p_environment text,
  p_provider_event_id text,
  p_provider_checkout_id text,
  p_provider_payment_id text,
  p_provider_charge_id text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_payment_type text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_payment RECORD;
  v_reservation RECORD;
  v_tenant_id uuid;
  v_event_id uuid;
  v_confirmed_event_id uuid;
  v_amount numeric;
  v_new_amount_paid numeric;
  v_new_balance numeric;
  v_new_payment_status text;
  v_new_booking_status text;
  v_opportunity_id uuid;
BEGIN
  -- Idempotency: check if this webhook event was already processed
  SELECT * INTO v_payment FROM payments
  WHERE provider_checkout_session_id = p_provider_checkout_id
    AND provider = p_provider
    AND environment = p_environment
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Payment not found for checkout session', 'checkout_id', p_provider_checkout_id);
  END IF;

  -- Already succeeded? Idempotent return
  IF v_payment.status = 'succeeded' THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true, 'payment_id', v_payment.id);
  END IF;

  v_tenant_id := v_payment.tenant_id;

  -- Lock reservation
  SELECT * INTO v_reservation FROM reservations WHERE id = v_payment.reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Reservation not found');
  END IF;

  -- Update payment record
  UPDATE payments SET
    status = 'succeeded',
    provider_payment_id = COALESCE(p_provider_payment_id, provider_payment_id),
    provider_charge_id = COALESCE(p_provider_charge_id, provider_charge_id),
    paid_at = now(),
    updated_at = now(),
    metadata = metadata || p_metadata
  WHERE id = v_payment.id;

  -- Calculate new amounts
  v_amount := COALESCE(p_amount, v_payment.amount);
  v_new_amount_paid := v_reservation.amount_paid + v_amount;
  v_new_balance := GREATEST(v_reservation.total_amount - v_new_amount_paid, 0);

  -- Determine new payment status
  IF v_new_balance <= 0 THEN
    v_new_payment_status := 'paid_in_full';
  ELSE
    v_new_payment_status := 'deposit_paid';
  END IF;

  -- Determine new booking status
  IF v_reservation.booking_status = 'awaiting_payment' THEN
    v_new_booking_status := 'confirmed';
  ELSE
    v_new_booking_status := v_reservation.booking_status;
  END IF;

  -- Update reservation
  UPDATE reservations SET
    payment_status = v_new_payment_status,
    booking_status = v_new_booking_status,
    amount_paid = v_new_amount_paid,
    balance_due = v_new_balance,
    confirmed_at = CASE WHEN v_new_booking_status = 'confirmed' AND confirmed_at IS NULL THEN now() ELSE confirmed_at END,
    updated_at = now()
  WHERE id = v_reservation.id;

  -- Emit payment.succeeded domain event
  v_event_id := emit_domain_event(
    v_tenant_id, 'payment.succeeded', 'payment', v_payment.id,
    jsonb_build_object('amount', v_amount, 'currency', COALESCE(p_currency, v_payment.currency), 'payment_type', COALESCE(p_payment_type, v_payment.payment_type)),
    v_reservation.id, v_reservation.customer_id, NULL, v_payment.id,
    'payment_succeeded_' || p_provider_event_id
  );

  -- Emit reservation.confirmed domain event (if newly confirmed)
  IF v_new_booking_status = 'confirmed' AND v_reservation.booking_status != 'confirmed' THEN
    v_confirmed_event_id := emit_domain_event(
      v_tenant_id, 'reservation.confirmed', 'reservation', v_reservation.id,
      jsonb_build_object('payment_id', v_payment.id, 'payment_status', v_new_payment_status),
      v_reservation.id, v_reservation.customer_id, NULL, v_payment.id,
      'reservation_confirmed_' || p_provider_event_id
    );

    -- Emit outbox entries for async processing
    PERFORM emit_outbox_entry(v_tenant_id, v_confirmed_event_id, 'opportunity.sync', jsonb_build_object('reservation_id', v_reservation.id));
    PERFORM emit_outbox_entry(v_tenant_id, v_confirmed_event_id, 'notification.create', jsonb_build_object('type', 'payment_received', 'reservation_id', v_reservation.id));
    PERFORM emit_outbox_entry(v_tenant_id, v_confirmed_event_id, 'activity.log', jsonb_build_object('action', 'reservation_confirmed', 'reservation_id', v_reservation.id));
  END IF;

  -- Emit outbox for payment notification
  PERFORM emit_outbox_entry(v_tenant_id, v_event_id, 'notification.create', jsonb_build_object('type', 'payment_received', 'reservation_id', v_reservation.id, 'payment_id', v_payment.id));

  -- Activity log
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_name, metadata)
  VALUES (v_tenant_id, 'reservation', v_reservation.id, 'payment_succeeded', 'system',
    jsonb_build_object('payment_id', v_payment.id, 'amount', v_amount, 'provider', p_provider));

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment.id,
    'reservation_id', v_reservation.id,
    'booking_status', v_new_booking_status,
    'payment_status', v_new_payment_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_payment_from_webhook TO authenticated;

-- 3. record_payment_failure — marks payment as failed
CREATE OR REPLACE FUNCTION record_payment_failure(
  p_provider text,
  p_environment text,
  p_provider_event_id text,
  p_provider_checkout_id text DEFAULT NULL,
  p_provider_payment_id text DEFAULT NULL,
  p_failure_code text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_payment RECORD;
  v_reservation RECORD;
  v_tenant_id uuid;
  v_event_id uuid;
BEGIN
  -- Find payment by checkout session or provider payment ID
  IF p_provider_checkout_id IS NOT NULL THEN
    SELECT * INTO v_payment FROM payments
    WHERE provider_checkout_session_id = p_provider_checkout_id
      AND provider = p_provider AND environment = p_environment
    FOR UPDATE;
  END IF;

  IF NOT FOUND AND p_provider_payment_id IS NOT NULL THEN
    SELECT * INTO v_payment FROM payments
    WHERE provider_payment_id = p_provider_payment_id
      AND provider = p_provider AND environment = p_environment
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Payment not found');
  END IF;

  -- Already failed? Idempotent
  IF v_payment.status = 'failed' THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true);
  END IF;

  v_tenant_id := v_payment.tenant_id;

  -- Update payment
  UPDATE payments SET
    status = 'failed',
    failure_code = p_failure_code,
    failure_reason = p_failure_reason,
    provider_payment_id = COALESCE(p_provider_payment_id, provider_payment_id),
    failed_at = now(),
    updated_at = now(),
    metadata = metadata || p_metadata
  WHERE id = v_payment.id;

  -- Update reservation payment_status back to unpaid (but keep awaiting_payment)
  SELECT * INTO v_reservation FROM reservations WHERE id = v_payment.reservation_id FOR UPDATE;

  IF v_reservation.booking_status = 'awaiting_payment' THEN
    UPDATE reservations SET
      payment_status = CASE WHEN v_reservation.payment_status = 'processing' THEN 'unpaid' ELSE v_reservation.payment_status END,
      updated_at = now()
    WHERE id = v_reservation.id;
  END IF;

  -- Emit domain event
  v_event_id := emit_domain_event(
    v_tenant_id, 'payment.failed', 'payment', v_payment.id,
    jsonb_build_object('failure_code', p_failure_code, 'failure_reason', p_failure_reason),
    v_reservation.id, v_reservation.customer_id, NULL, v_payment.id,
    'payment_failed_' || p_provider_event_id
  );

  -- Outbox for notification
  PERFORM emit_outbox_entry(v_tenant_id, v_event_id, 'notification.create',
    jsonb_build_object('type', 'payment_failed', 'reservation_id', v_reservation.id, 'payment_id', v_payment.id));

  -- Activity log
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_name, metadata)
  VALUES (v_tenant_id, 'reservation', v_reservation.id, 'payment_failed', 'system',
    jsonb_build_object('payment_id', v_payment.id, 'failure_reason', p_failure_reason));

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment.id);
END;
$$;

GRANT EXECUTE ON FUNCTION record_payment_failure TO authenticated;

-- 4. expire_checkout_session — marks checkout as expired (not the reservation)
CREATE OR REPLACE FUNCTION expire_checkout_session(
  p_provider_checkout_id text,
  p_provider text DEFAULT 'stripe'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_payment RECORD;
BEGIN
  SELECT * INTO v_payment FROM payments
  WHERE provider_checkout_session_id = p_provider_checkout_id
    AND provider = p_provider
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Payment not found');
  END IF;

  -- Only expire if still pending
  IF v_payment.status NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true);
  END IF;

  UPDATE payments SET
    status = 'cancelled',
    updated_at = now()
  WHERE id = v_payment.id;

  -- Reset reservation payment_status to unpaid (but keep awaiting_payment if hold is still valid)
  UPDATE reservations SET
    payment_status = 'unpaid',
    updated_at = now()
  WHERE id = v_payment.reservation_id
    AND booking_status = 'awaiting_payment'
    AND payment_status = 'processing';

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment.id);
END;
$$;

GRANT EXECUTE ON FUNCTION expire_checkout_session TO authenticated;

-- 5. process_refund — records refund request, validates ownership
CREATE OR REPLACE FUNCTION process_refund(
  p_payment_id uuid,
  p_amount numeric DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_acting_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_provider_refund_id text DEFAULT NULL,
  p_refunded_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_payment RECORD;
  v_reservation RECORD;
  v_tenant_id uuid;
  v_refund_amount numeric;
  v_total_refunded numeric;
  v_event_id uuid;
BEGIN
  v_tenant_id := current_tenant_id();
  IF v_tenant_id IS NULL AND p_acting_user_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM tenant_users
    WHERE user_id = p_acting_user_id AND role = 'tenant_admin' LIMIT 1;
  END IF;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unable to determine tenant');
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id AND tenant_id = v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Payment not found');
  END IF;

  IF v_payment.status != 'succeeded' THEN
    RETURN jsonb_build_object('error', 'Only successful payments can be refunded');
  END IF;

  v_refund_amount := COALESCE(p_refunded_amount, p_amount, v_payment.amount - v_payment.refunded_amount);
  v_total_refunded := v_payment.refunded_amount + v_refund_amount;

  IF v_total_refunded > v_payment.amount THEN
    RETURN jsonb_build_object('error', 'Refund amount exceeds payment amount');
  END IF;

  -- Update payment
  UPDATE payments SET
    refunded_amount = v_total_refunded,
    refunded_at = now(),
    provider_refund_id = COALESCE(p_provider_refund_id, provider_refund_id),
    status = CASE WHEN v_total_refunded >= v_payment.amount THEN 'refunded' ELSE 'partially_refunded' END,
    updated_at = now()
  WHERE id = p_payment_id;

  SELECT * INTO v_reservation FROM reservations WHERE id = v_payment.reservation_id FOR UPDATE;

  -- Update reservation payment_status
  UPDATE reservations SET
    payment_status = CASE WHEN v_total_refunded >= v_payment.amount THEN 'refunded' ELSE 'partially_refunded' END,
    amount_paid = GREATEST(amount_paid - v_refund_amount, 0),
    balance_due = balance_due + v_refund_amount,
    updated_at = now()
  WHERE id = v_reservation.id;

  -- Emit domain event
  v_event_id := emit_domain_event(
    v_tenant_id,
    CASE WHEN v_total_refunded >= v_payment.amount THEN 'payment.refunded' ELSE 'payment.partially_refunded' END,
    'payment', p_payment_id,
    jsonb_build_object('refund_amount', v_refund_amount, 'total_refunded', v_total_refunded, 'reason', p_reason),
    v_reservation.id, v_reservation.customer_id, NULL, p_payment_id,
    'refund_' || p_payment_id::text || '_' || v_refund_amount::text
  );

  -- Outbox for notification
  PERFORM emit_outbox_entry(v_tenant_id, v_event_id, 'notification.create',
    jsonb_build_object('type', 'refund_completed', 'reservation_id', v_reservation.id, 'payment_id', p_payment_id));

  -- Activity log
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_user_id, actor_name, metadata)
  VALUES (v_tenant_id, 'reservation', v_reservation.id, 'refund_processed',
    p_acting_user_id, p_actor_name,
    jsonb_build_object('payment_id', p_payment_id, 'refund_amount', v_refund_amount));

  RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id, 'refunded_amount', v_refund_amount, 'total_refunded', v_total_refunded);
END;
$$;

GRANT EXECUTE ON FUNCTION process_refund TO authenticated;

-- 6. sync_opportunity_for_reservation — idempotent opportunity creation/update
CREATE OR REPLACE FUNCTION sync_opportunity_for_reservation(
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_reservation RECORD;
  v_tenant RECORD;
  v_pipeline RECORD;
  v_stage RECORD;
  v_opportunity RECORD;
  v_customer RECORD;
  v_opportunity_id uuid;
  v_event_id uuid;
BEGIN
  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Reservation not found');
  END IF;

  SELECT * INTO v_tenant FROM tenants WHERE id = v_reservation.tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Tenant not found');
  END IF;

  -- Check if opportunity already exists for this reservation
  SELECT * INTO v_opportunity FROM opportunities WHERE reservation_id = p_reservation_id LIMIT 1;
  IF FOUND THEN
    -- Update existing opportunity stage based on booking status
    v_opportunity_id := v_opportunity.id;

    IF v_reservation.booking_status = 'confirmed' AND v_tenant.confirmed_booking_stage_id IS NOT NULL THEN
      PERFORM move_opportunity_stage(v_opportunity_id, v_tenant.confirmed_booking_stage_id, NULL, 'system');
    ELSIF v_reservation.booking_status = 'cancelled' AND v_tenant.cancelled_stage_id IS NOT NULL THEN
      PERFORM move_opportunity_stage(v_opportunity_id, v_tenant.cancelled_stage_id, NULL, 'system');
    ELSIF v_reservation.booking_status = 'completed' AND v_tenant.completed_stage_id IS NOT NULL THEN
      PERFORM move_opportunity_stage(v_opportunity_id, v_tenant.completed_stage_id, NULL, 'system');
    END IF;

    RETURN jsonb_build_object('success', true, 'opportunity_id', v_opportunity_id, 'already_existed', true);
  END IF;

  -- Check tenant config
  IF v_tenant.create_opportunity_on_booking = false THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'create_opportunity_on_booking is false');
  END IF;

  -- Find default pipeline
  SELECT * INTO v_pipeline FROM pipelines WHERE tenant_id = v_reservation.tenant_id AND is_default = true AND is_active = true LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_pipeline FROM pipelines WHERE tenant_id = v_reservation.tenant_id AND is_active = true LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'No pipeline found');
  END IF;

  -- Determine stage based on booking status
  IF v_reservation.booking_status = 'confirmed' AND v_tenant.confirmed_booking_stage_id IS NOT NULL THEN
    SELECT * INTO v_stage FROM pipeline_stages WHERE id = v_tenant.confirmed_booking_stage_id AND tenant_id = v_reservation.tenant_id;
  ELSIF v_reservation.booking_status = 'pending' AND v_tenant.request_stage_id IS NOT NULL THEN
    SELECT * INTO v_stage FROM pipeline_stages WHERE id = v_tenant.request_stage_id AND tenant_id = v_reservation.tenant_id;
  END IF;

  -- Fallback: first active stage in pipeline
  IF NOT FOUND THEN
    SELECT * INTO v_stage FROM pipeline_stages
    WHERE pipeline_id = v_pipeline.id AND tenant_id = v_reservation.tenant_id AND is_active = true
    ORDER BY stage_order LIMIT 1;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'No stage found');
  END IF;

  -- Get customer
  SELECT * INTO v_customer FROM customers WHERE id = v_reservation.customer_id;

  -- Create opportunity
  INSERT INTO opportunities (
    tenant_id, pipeline_id, stage_id, customer_id, listing_id, reservation_id,
    name, monetary_value, currency, status, source, expected_service_date
  ) VALUES (
    v_reservation.tenant_id, v_pipeline.id, v_stage.id, v_reservation.customer_id,
    v_reservation.listing_id, p_reservation_id,
    COALESCE(v_customer.full_name, v_reservation.client_name, 'Booking ' || v_reservation.booking_reference),
    v_reservation.total_amount, v_reservation.currency, 'open', 'public_booking',
    v_reservation.start_at
  ) RETURNING id INTO v_opportunity_id;

  -- Emit domain event
  v_event_id := emit_domain_event(
    v_reservation.tenant_id, 'opportunity.created', 'opportunity', v_opportunity_id,
    jsonb_build_object('reservation_id', p_reservation_id, 'pipeline_id', v_pipeline.id, 'stage_id', v_stage.id),
    p_reservation_id, v_reservation.customer_id, v_opportunity_id, NULL,
    'opportunity_created_' || p_reservation_id::text
  );

  -- Activity log
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_name, metadata)
  VALUES (v_reservation.tenant_id, 'opportunity', v_opportunity_id, 'created', 'system',
    jsonb_build_object('reservation_id', p_reservation_id));

  RETURN jsonb_build_object('success', true, 'opportunity_id', v_opportunity_id);
END;
$$;

GRANT EXECUTE ON FUNCTION sync_opportunity_for_reservation TO authenticated;

-- 7. record_webhook_event — idempotent webhook event storage
CREATE OR REPLACE FUNCTION record_webhook_event(
  p_provider text,
  p_environment text,
  p_provider_event_id text,
  p_event_type text,
  p_payload_hash text DEFAULT NULL,
  p_safe_metadata jsonb DEFAULT '{}'::jsonb,
  p_tenant_id uuid DEFAULT NULL,
  p_integration_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_id uuid;
  v_already_exists boolean := false;
BEGIN
  -- Check if event already exists
  SELECT id INTO v_id FROM webhook_events
  WHERE provider = p_provider AND environment = p_environment AND provider_event_id = p_provider_event_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('already_exists', true, 'id', v_id);
  END IF;

  INSERT INTO webhook_events (
    provider, environment, provider_event_id, event_type,
    payload_hash, safe_metadata, tenant_id, integration_id,
    processing_status, attempt_count
  ) VALUES (
    p_provider, p_environment, p_provider_event_id, p_event_type,
    p_payload_hash, p_safe_metadata, p_tenant_id, p_integration_id,
    'pending', 0
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION record_webhook_event TO authenticated;

-- 8. mark_webhook_processed — marks webhook as processed or failed
CREATE OR REPLACE FUNCTION mark_webhook_processed(
  p_provider text,
  p_environment text,
  p_provider_event_id text,
  p_success boolean DEFAULT true,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE webhook_events SET
    processing_status = CASE WHEN p_success THEN 'processed' ELSE 'failed' END,
    processed_at = CASE WHEN p_success THEN now() ELSE processed_at END,
    attempt_count = attempt_count + 1,
    error_message = p_error_message,
    updated_at = now()
  WHERE provider = p_provider AND environment = p_environment AND provider_event_id = p_provider_event_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION mark_webhook_processed TO authenticated;

-- 9. process_outbox_batch — processes pending outbox items
-- This is called by the outbox processor Edge Function
CREATE OR REPLACE FUNCTION process_outbox_batch(
  p_batch_size int DEFAULT 10,
  p_worker_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_items jsonb;
  v_item RECORD;
  v_result jsonb;
  v_processed_count int := 0;
  v_failed_count int := 0;
BEGIN
  -- Lock and fetch pending items
  WITH locked AS (
    SELECT id FROM event_outbox
    WHERE status = 'pending' AND available_at <= now()
    ORDER BY available_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE event_outbox SET
    status = 'processing',
    locked_at = now(),
    locked_by = p_worker_id,
    updated_at = now()
  WHERE id IN (SELECT id FROM locked)
  RETURNING id, tenant_id, domain_event_id, topic, payload INTO v_items;

  -- For each item, process based on topic
  -- This is a simplified inline processor; the Edge Function handles the actual dispatch
  FOR v_item IN SELECT * FROM jsonb_to_recordset(v_items) AS (id uuid, tenant_id uuid, domain_event_id uuid, topic text, payload jsonb)
  LOOP
    BEGIN
      -- Internal handlers
      IF v_item.topic = 'activity.log' THEN
        INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_name, metadata)
        SELECT v_item.tenant_id,
          (v_item.payload->>'entity_type')::text,
          COALESCE((v_item.payload->>'entity_id')::uuid, NULL),
          COALESCE(v_item.payload->>'action', 'system_event'),
          'system',
          v_item.payload;
      ELSIF v_item.topic = 'notification.create' THEN
        INSERT INTO notifications (tenant_id, type, title, message, entity_type, entity_id, priority)
        SELECT v_item.tenant_id,
          COALESCE(v_item.payload->>'type', 'system'),
          CASE v_item.payload->>'type'
            WHEN 'payment_received' THEN 'Payment Received'
            WHEN 'payment_failed' THEN 'Payment Failed'
            WHEN 'reservation_confirmed' THEN 'Reservation Confirmed'
            WHEN 'reservation_cancelled' THEN 'Reservation Cancelled'
            WHEN 'refund_completed' THEN 'Refund Completed'
            ELSE 'System Notification'
          END,
          COALESCE(v_item.payload->>'message', ''),
          COALESCE(v_item.payload->>'entity_type', 'reservation'),
          COALESCE((v_item.payload->>'entity_id')::uuid, (v_item.payload->>'reservation_id')::uuid),
          'normal';
      ELSIF v_item.topic = 'opportunity.sync' THEN
        PERFORM sync_opportunity_for_reservation(COALESCE((v_item.payload->>'reservation_id')::uuid, NULL));
      END IF;

      -- Mark as completed
      UPDATE event_outbox SET
        status = 'completed',
        processed_at = now(),
        updated_at = now()
      WHERE id = v_item.id;

      v_processed_count := v_processed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE event_outbox SET
        status = CASE WHEN attempt_count + 1 >= max_attempts THEN 'dead_letter' ELSE 'pending' END,
        attempt_count = attempt_count + 1,
        last_error = SQLERRM,
        available_at = now() + (interval '1 minute' * (attempt_count + 1)),
        locked_at = NULL,
        locked_by = NULL,
        updated_at = now()
      WHERE id = v_item.id;

      v_failed_count := v_failed_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed_count, 'failed', v_failed_count);
END;
$$;

GRANT EXECUTE ON FUNCTION process_outbox_batch TO authenticated;

-- 10. get_reservation_timeline — returns timeline events for admin
CREATE OR REPLACE FUNCTION get_reservation_timeline(
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant_id uuid;
  v_events jsonb;
  v_activities jsonb;
  v_payments jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Reservation not found');
  END IF;

  -- Domain events
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', de.id,
    'event_type', de.event_type,
    'entity_type', de.entity_type,
    'occurred_at', de.occurred_at,
    'payload', de.payload,
    'source', 'event'
  ) ORDER BY de.occurred_at DESC), '[]'::jsonb) INTO v_events
  FROM domain_events de
  WHERE de.tenant_id = v_tenant_id AND de.reservation_id = p_reservation_id;

  -- Activity logs
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', al.id,
    'action', al.action,
    'actor_name', COALESCE(al.actor_name, 'system'),
    'created_at', al.created_at,
    'metadata', al.metadata,
    'source', 'activity'
  ) ORDER BY al.created_at DESC), '[]'::jsonb) INTO v_activities
  FROM activity_log al
  WHERE al.tenant_id = v_tenant_id AND al.entity_type = 'reservation' AND al.entity_id = p_reservation_id;

  -- Payments
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'payment_type', p.payment_type,
    'amount', p.amount,
    'currency', p.currency,
    'status', p.status,
    'provider', p.provider,
    'provider_payment_id', p.provider_payment_id,
    'paid_at', p.paid_at,
    'failed_at', p.failed_at,
    'failure_reason', p.failure_reason,
    'refunded_amount', p.refunded_amount,
    'created_at', p.created_at,
    'source', 'payment'
  ) ORDER BY p.created_at DESC), '[]'::jsonb) INTO v_payments
  FROM payments p
  WHERE p.tenant_id = v_tenant_id AND p.reservation_id = p_reservation_id;

  RETURN jsonb_build_object('events', v_events, 'activities', v_activities, 'payments', v_payments);
END;
$$;

GRANT EXECUTE ON FUNCTION get_reservation_timeline TO authenticated;
