-- ============================================================
-- PHASE 8: Booking & Payment Infrastructure
-- Creates all missing tables and RPC functions required for
-- the complete booking → payment → webhook flow.
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

-- 1.1 payments — tracks all payment attempts and their lifecycle
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  integration_id uuid REFERENCES tenant_integrations(id),
  provider text NOT NULL DEFAULT 'stripe',
  environment text NOT NULL DEFAULT 'test',
  payment_type text NOT NULL DEFAULT 'deposit',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  platform_fee_amount numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  provider_checkout_session_id text,
  provider_payment_id text,
  provider_charge_id text,
  provider_refund_id text,
  refunded_amount numeric DEFAULT 0,
  failure_code text,
  failure_reason text,
  idempotency_key text,
  metadata jsonb DEFAULT '{}',
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read payments"
  ON payments FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());

CREATE POLICY "Deny direct write to payments"
  ON payments FOR ALL TO public
  USING (false);

CREATE INDEX idx_payments_reservation_id ON payments(reservation_id);
CREATE INDEX idx_payments_tenant_id ON payments(tenant_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_provider_checkout ON payments(provider_checkout_session_id);

-- 1.2 webhook_events — idempotent webhook event log
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  environment text NOT NULL DEFAULT 'test',
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  processing_status text NOT NULL DEFAULT 'received',
  safe_metadata jsonb DEFAULT '{}',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny direct access to webhook_events"
  ON webhook_events FOR ALL TO public
  USING (false);

CREATE UNIQUE INDEX idx_webhook_events_unique
  ON webhook_events(provider, environment, provider_event_id);
CREATE INDEX idx_webhook_events_status ON webhook_events(processing_status);

-- 1.3 booking_access_tokens — short-lived tokens for guest checkout
CREATE TABLE IF NOT EXISTS booking_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE booking_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny direct access to booking_access_tokens"
  ON booking_access_tokens FOR ALL TO public
  USING (false);

CREATE INDEX idx_booking_access_tokens_hash ON booking_access_tokens(token_hash);
CREATE INDEX idx_booking_access_tokens_reservation ON booking_access_tokens(reservation_id);

-- 1.4 platform_fee_config — platform-wide fee settings
CREATE TABLE IF NOT EXISTS platform_fee_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_type text NOT NULL DEFAULT 'percentage',
  fee_percentage numeric DEFAULT 0,
  fee_fixed_amount numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE platform_fee_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage fee config"
  ON platform_fee_config FOR ALL TO authenticated
  USING (is_super_admin());

CREATE POLICY "Deny non-admin access to fee config"
  ON platform_fee_config FOR ALL TO public
  USING (false);

-- 1.5 notifications — in-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  type text NOT NULL,
  title text NOT NULL,
  message text,
  entity_type text,
  entity_id text,
  priority text DEFAULT 'normal',
  read boolean DEFAULT false,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read notifications"
  ON notifications FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) OR is_super_admin());

CREATE POLICY "Tenant members can update notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (is_tenant_member(tenant_id));

CREATE POLICY "Deny direct insert/delete to notifications"
  ON notifications FOR ALL TO public
  USING (false);

CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX idx_notifications_unread ON notifications(tenant_id, read) WHERE NOT read;

-- 1.6 rate_limit_log — simple IP/identifier rate limiting
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  endpoint text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny direct access to rate_limit_log"
  ON rate_limit_log FOR ALL TO public
  USING (false);

CREATE INDEX idx_rate_limit_log_lookup
  ON rate_limit_log(identifier, endpoint, created_at);

-- ============================================================
-- 2. RPC FUNCTIONS — Booking Flow
-- ============================================================

-- 2.1 check_rate_limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier text,
  p_endpoint text,
  p_max_requests int DEFAULT 30,
  p_window_minutes int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_count int;
  window_start timestamptz;
BEGIN
  window_start := now() - (p_window_minutes || ' minutes')::interval;

  SELECT count(*) INTO request_count
  FROM rate_limit_log
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND created_at > window_start;

  IF request_count >= p_max_requests THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'retry_after_seconds', p_window_minutes * 60);
  END IF;

  INSERT INTO rate_limit_log (identifier, endpoint) VALUES (p_identifier, p_endpoint);

  -- Cleanup old entries (probabilistic, 1% of calls)
  IF random() < 0.01 THEN
    DELETE FROM rate_limit_log WHERE created_at < now() - interval '1 hour';
  END IF;

  RETURN jsonb_build_object('allowed', true, 'remaining', p_max_requests - request_count - 1);
END;
$$;

-- 2.2 get_public_availability
CREATE OR REPLACE FUNCTION public.get_public_availability(
  p_tenant_slug text,
  p_listing_slug text,
  p_pricing_option_id uuid,
  p_date text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing_id uuid;
  v_tenant_id uuid;
  v_timezone text;
  v_date date;
  v_day_of_week int;
  v_duration_minutes int;
  v_buffer_before int;
  v_buffer_after int;
  v_minimum_notice_hours int;
  v_maximum_advance_days int;
  v_slot_interval int;
  v_slots jsonb := '[]'::jsonb;
  v_start_restriction time;
  v_end_restriction time;
  rec record;
BEGIN
  v_date := p_date::date;
  v_day_of_week := extract(isodow from v_date)::int; -- 1=Monday, 7=Sunday

  -- Resolve listing
  SELECT l.id, l.tenant_id, l.timezone,
         coalesce(l.buffer_before_minutes, 0),
         coalesce(l.buffer_after_minutes, 0),
         coalesce(l.minimum_notice_hours, 0),
         coalesce(l.maximum_advance_days, 365),
         coalesce(l.slot_interval_minutes, 30)
  INTO v_listing_id, v_tenant_id, v_timezone,
       v_buffer_before, v_buffer_after,
       v_minimum_notice_hours, v_maximum_advance_days, v_slot_interval
  FROM listings l
  JOIN tenants t ON t.id = l.tenant_id
  WHERE t.slug = p_tenant_slug
    AND l.slug = p_listing_slug
    AND l.is_active = true
    AND l.online_booking_enabled = true;

  IF v_listing_id IS NULL THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'error', 'Listing not found or not available for online booking');
  END IF;

  -- Check date bounds
  IF v_date < current_date THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'error', 'Date is in the past');
  END IF;

  IF v_date > current_date + (v_maximum_advance_days || ' days')::interval THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'error', 'Date is too far in advance');
  END IF;

  -- Get pricing option duration
  SELECT po.duration_minutes, po.start_time_restriction, po.end_time_restriction
  INTO v_duration_minutes, v_start_restriction, v_end_restriction
  FROM listing_pricing_options po
  WHERE po.id = p_pricing_option_id
    AND po.listing_id = v_listing_id
    AND po.is_active = true;

  IF v_duration_minutes IS NULL THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'error', 'Pricing option not found');
  END IF;

  -- Check for fixed start times first
  IF EXISTS (
    SELECT 1 FROM listing_fixed_start_times fst
    WHERE fst.listing_id = v_listing_id
      AND fst.day_of_week = v_day_of_week
      AND fst.is_active = true
      AND (fst.pricing_option_id IS NULL OR fst.pricing_option_id = p_pricing_option_id)
  ) THEN
    -- Use fixed start times
    FOR rec IN
      SELECT fst.start_time
      FROM listing_fixed_start_times fst
      WHERE fst.listing_id = v_listing_id
        AND fst.day_of_week = v_day_of_week
        AND fst.is_active = true
        AND (fst.pricing_option_id IS NULL OR fst.pricing_option_id = p_pricing_option_id)
      ORDER BY fst.start_time
    LOOP
      DECLARE
        v_slot_start timestamptz;
        v_slot_end timestamptz;
        v_is_blocked boolean;
        v_is_booked boolean;
      BEGIN
        v_slot_start := (v_date || ' ' || rec.start_time)::timestamp AT TIME ZONE coalesce(v_timezone, 'America/New_York');
        v_slot_end := v_slot_start + (v_duration_minutes || ' minutes')::interval;

        -- Check minimum notice
        IF v_slot_start < now() + (v_minimum_notice_hours || ' hours')::interval THEN
          CONTINUE;
        END IF;

        -- Check blocks
        SELECT EXISTS (
          SELECT 1 FROM listing_blocks lb
          WHERE lb.listing_id = v_listing_id
            AND lb.start_at < v_slot_end + (v_buffer_after || ' minutes')::interval
            AND lb.end_at > v_slot_start - (v_buffer_before || ' minutes')::interval
        ) INTO v_is_blocked;

        IF v_is_blocked THEN CONTINUE; END IF;

        -- Check existing reservations
        SELECT EXISTS (
          SELECT 1 FROM reservations r
          WHERE r.listing_id = v_listing_id
            AND r.booking_status NOT IN ('cancelled', 'expired', 'no_show')
            AND r.start_at < v_slot_end + (v_buffer_after || ' minutes')::interval
            AND r.end_at > v_slot_start - (v_buffer_before || ' minutes')::interval
        ) INTO v_is_booked;

        IF v_is_booked THEN CONTINUE; END IF;

        v_slots := v_slots || jsonb_build_object(
          'start', to_char(v_slot_start AT TIME ZONE coalesce(v_timezone, 'America/New_York'), 'HH24:MI'),
          'start_utc', to_char(v_slot_start, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'end', to_char(v_slot_end AT TIME ZONE coalesce(v_timezone, 'America/New_York'), 'HH24:MI'),
          'end_utc', to_char(v_slot_end, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        );
      END;
    END LOOP;
  ELSE
    -- Generate slots from operating hours
    FOR rec IN
      SELECT oh.start_time, oh.end_time
      FROM listing_operating_hours oh
      WHERE oh.listing_id = v_listing_id
        AND oh.day_of_week = v_day_of_week
        AND oh.is_active = true
        AND (oh.valid_from IS NULL OR oh.valid_from <= v_date)
        AND (oh.valid_until IS NULL OR oh.valid_until >= v_date)
      ORDER BY oh.start_time
    LOOP
      DECLARE
        v_cursor time;
        v_oh_end time;
        v_slot_start timestamptz;
        v_slot_end timestamptz;
        v_is_blocked boolean;
        v_is_booked boolean;
      BEGIN
        v_cursor := rec.start_time;
        v_oh_end := rec.end_time;

        -- Apply pricing option time restrictions
        IF v_start_restriction IS NOT NULL AND v_cursor < v_start_restriction THEN
          v_cursor := v_start_restriction;
        END IF;

        WHILE v_cursor + (v_duration_minutes || ' minutes')::interval <= v_oh_end LOOP
          v_slot_start := (v_date || ' ' || v_cursor)::timestamp AT TIME ZONE coalesce(v_timezone, 'America/New_York');
          v_slot_end := v_slot_start + (v_duration_minutes || ' minutes')::interval;

          -- Check end restriction
          IF v_end_restriction IS NOT NULL AND v_cursor > v_end_restriction THEN
            EXIT;
          END IF;

          -- Check minimum notice
          IF v_slot_start < now() + (v_minimum_notice_hours || ' hours')::interval THEN
            v_cursor := v_cursor + (v_slot_interval || ' minutes')::interval;
            CONTINUE;
          END IF;

          -- Check blocks
          SELECT EXISTS (
            SELECT 1 FROM listing_blocks lb
            WHERE lb.listing_id = v_listing_id
              AND lb.start_at < v_slot_end + (v_buffer_after || ' minutes')::interval
              AND lb.end_at > v_slot_start - (v_buffer_before || ' minutes')::interval
          ) INTO v_is_blocked;

          IF NOT v_is_blocked THEN
            -- Check reservations
            SELECT EXISTS (
              SELECT 1 FROM reservations r
              WHERE r.listing_id = v_listing_id
                AND r.booking_status NOT IN ('cancelled', 'expired', 'no_show')
                AND r.start_at < v_slot_end + (v_buffer_after || ' minutes')::interval
                AND r.end_at > v_slot_start - (v_buffer_before || ' minutes')::interval
            ) INTO v_is_booked;

            IF NOT v_is_booked THEN
              v_slots := v_slots || jsonb_build_object(
                'start', to_char(v_slot_start AT TIME ZONE coalesce(v_timezone, 'America/New_York'), 'HH24:MI'),
                'start_utc', to_char(v_slot_start, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                'end', to_char(v_slot_end AT TIME ZONE coalesce(v_timezone, 'America/New_York'), 'HH24:MI'),
                'end_utc', to_char(v_slot_end, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
              );
            END IF;
          END IF;

          v_cursor := v_cursor + (v_slot_interval || ' minutes')::interval;
        END LOOP;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('slots', v_slots);
END;
$$;

-- 2.3 calculate_booking_price
CREATE OR REPLACE FUNCTION public.calculate_booking_price(
  p_listing_id uuid,
  p_pricing_option_id uuid,
  p_guest_count int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_option record;
  v_listing record;
  v_base_amount numeric;
  v_guest_adjustment numeric := 0;
  v_subtotal numeric;
  v_service_fee numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric;
  v_deposit_amount numeric := 0;
  v_amount_due_now numeric;
  v_balance_due numeric;
  v_guests int;
BEGIN
  -- Get pricing option
  SELECT * INTO v_option
  FROM listing_pricing_options
  WHERE id = p_pricing_option_id
    AND listing_id = p_listing_id
    AND is_active = true;

  IF v_option IS NULL THEN
    RETURN jsonb_build_object('error', 'Pricing option not found');
  END IF;

  -- Get listing config
  SELECT payment_mode, deposit_type, deposit_percentage, deposit_fixed_amount,
         tax_percentage, service_fee_type, service_fee_percentage, service_fee_fixed_amount,
         currency
  INTO v_listing
  FROM listings
  WHERE id = p_listing_id AND is_active = true;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('error', 'Listing not found');
  END IF;

  v_guests := greatest(p_guest_count, coalesce(v_option.minimum_guests, 1));

  -- Base price
  v_base_amount := v_option.base_price;

  -- Additional guest charges
  IF v_guests > coalesce(v_option.included_guests, 1) AND coalesce(v_option.price_per_additional_guest, 0) > 0 THEN
    v_guest_adjustment := (v_guests - v_option.included_guests) * v_option.price_per_additional_guest;
  END IF;

  v_subtotal := v_base_amount + v_guest_adjustment;

  -- Service fee
  IF v_listing.service_fee_type = 'percentage' AND coalesce(v_listing.service_fee_percentage, 0) > 0 THEN
    v_service_fee := round(v_subtotal * v_listing.service_fee_percentage / 100, 2);
  ELSIF v_listing.service_fee_type = 'fixed' AND coalesce(v_listing.service_fee_fixed_amount, 0) > 0 THEN
    v_service_fee := v_listing.service_fee_fixed_amount;
  END IF;

  -- Tax
  IF coalesce(v_listing.tax_percentage, 0) > 0 THEN
    v_tax_amount := round((v_subtotal + v_service_fee) * v_listing.tax_percentage / 100, 2);
  END IF;

  v_total := v_subtotal + v_service_fee + v_tax_amount;

  -- Deposit calculation
  IF v_listing.payment_mode = 'deposit' THEN
    IF v_listing.deposit_type = 'fixed' THEN
      v_deposit_amount := least(coalesce(v_listing.deposit_fixed_amount, 0), v_total);
    ELSE
      v_deposit_amount := round(v_total * coalesce(v_listing.deposit_percentage, 50) / 100, 2);
    END IF;
    v_amount_due_now := v_deposit_amount;
    v_balance_due := v_total - v_deposit_amount;
  ELSIF v_listing.payment_mode = 'full_payment' THEN
    v_deposit_amount := v_total;
    v_amount_due_now := v_total;
    v_balance_due := 0;
  ELSE
    -- request_only or pay_at_location
    v_deposit_amount := 0;
    v_amount_due_now := 0;
    v_balance_due := v_total;
  END IF;

  RETURN jsonb_build_object(
    'base_amount', v_base_amount,
    'guest_adjustment', v_guest_adjustment,
    'subtotal_amount', v_subtotal,
    'service_fee_amount', v_service_fee,
    'tax_amount', v_tax_amount,
    'total_amount', v_total,
    'deposit_amount', v_deposit_amount,
    'amount_due_now', v_amount_due_now,
    'balance_due', v_balance_due,
    'currency', coalesce(v_listing.currency, 'USD'),
    'pricing_option_name', v_option.name,
    'duration_minutes', v_option.duration_minutes,
    'payment_mode', coalesce(v_listing.payment_mode, 'deposit'),
    'deposit_type', coalesce(v_listing.deposit_type, 'percentage'),
    'deposit_percentage', coalesce(v_listing.deposit_percentage, 50),
    'balance_due_timing', 'before_departure'
  );
END;
$$;

-- 2.4 create_public_booking_hold
CREATE OR REPLACE FUNCTION public.create_public_booking_hold(
  p_tenant_id uuid,
  p_listing_id uuid,
  p_pricing_option_id uuid,
  p_client_name text,
  p_start_at timestamptz,
  p_guest_count int DEFAULT 1,
  p_client_email text DEFAULT NULL,
  p_client_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing record;
  v_option record;
  v_price jsonb;
  v_end_at timestamptz;
  v_booking_ref text;
  v_reservation_id uuid;
  v_hold_minutes int;
  v_booking_status text;
  v_customer_id uuid;
BEGIN
  -- Validate listing
  SELECT l.*, t.slug as tenant_slug
  INTO v_listing
  FROM listings l
  JOIN tenants t ON t.id = l.tenant_id
  WHERE l.id = p_listing_id
    AND l.tenant_id = p_tenant_id
    AND l.is_active = true
    AND l.online_booking_enabled = true;

  IF v_listing IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'Listing not available for online booking');
  END IF;

  -- Get pricing option
  SELECT * INTO v_option
  FROM listing_pricing_options
  WHERE id = p_pricing_option_id
    AND listing_id = p_listing_id
    AND is_active = true;

  IF v_option IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'Pricing option not found');
  END IF;

  -- Calculate price server-side
  v_price := calculate_booking_price(p_listing_id, p_pricing_option_id, p_guest_count);

  IF v_price ? 'error' THEN
    RETURN jsonb_build_object('status', 'error', 'error', v_price->>'error');
  END IF;

  -- Calculate end time
  v_end_at := p_start_at + (v_option.duration_minutes || ' minutes')::interval;

  -- Check availability (double-check for race condition)
  IF EXISTS (
    SELECT 1 FROM reservations r
    WHERE r.listing_id = p_listing_id
      AND r.booking_status NOT IN ('cancelled', 'expired', 'no_show')
      AND r.start_at < v_end_at
      AND r.end_at > p_start_at
  ) THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'This time slot is no longer available');
  END IF;

  -- Generate booking reference
  v_booking_ref := 'BK-' || upper(substr(md5(random()::text), 1, 8));

  -- Determine hold duration and booking status
  v_hold_minutes := coalesce(v_listing.hold_duration_minutes, 30);

  IF v_listing.payment_mode IN ('full_payment', 'deposit') THEN
    v_booking_status := 'awaiting_payment';
  ELSIF v_listing.requires_approval THEN
    v_booking_status := 'pending_approval';
  ELSE
    v_booking_status := 'confirmed';
  END IF;

  -- Find or create customer
  IF p_client_email IS NOT NULL THEN
    SELECT id INTO v_customer_id
    FROM customers
    WHERE tenant_id = p_tenant_id
      AND lower(email) = lower(p_client_email)
    LIMIT 1;
  END IF;

  IF v_customer_id IS NULL THEN
    INSERT INTO customers (tenant_id, full_name, email, phone, source)
    VALUES (p_tenant_id, p_client_name, p_client_email, p_client_phone, 'online_booking')
    RETURNING id INTO v_customer_id;
  END IF;

  -- Create reservation
  INSERT INTO reservations (
    tenant_id, listing_id, customer_id,
    booking_reference, source, title,
    client_name, client_email, client_phone,
    start_at, end_at, timezone, duration_minutes,
    guest_count, total_amount, deposit_amount,
    balance_due, currency,
    booking_status, payment_status,
    notes, expires_at
  ) VALUES (
    p_tenant_id, p_listing_id, v_customer_id,
    v_booking_ref, 'online_booking', v_option.name || ' — ' || p_client_name,
    p_client_name, p_client_email, p_client_phone,
    p_start_at, v_end_at, coalesce(v_listing.timezone, 'America/New_York'), v_option.duration_minutes,
    p_guest_count, (v_price->>'total_amount')::numeric, (v_price->>'deposit_amount')::numeric,
    (v_price->>'balance_due')::numeric, coalesce(v_price->>'currency', 'USD'),
    v_booking_status, 'unpaid',
    p_notes,
    CASE WHEN v_booking_status = 'awaiting_payment'
      THEN now() + (v_hold_minutes || ' minutes')::interval
      ELSE NULL
    END
  )
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'reservation_id', v_reservation_id,
    'booking_reference', v_booking_ref,
    'booking_status', v_booking_status,
    'expires_at', CASE WHEN v_booking_status = 'awaiting_payment'
      THEN to_char(now() + (v_hold_minutes || ' minutes')::interval, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ELSE NULL
    END,
    'price', v_price
  );
END;
$$;

-- 2.5 create_booking_access_token
CREATE OR REPLACE FUNCTION public.create_booking_access_token(
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_token_hash text;
BEGIN
  -- Verify reservation exists and is awaiting payment
  IF NOT EXISTS (
    SELECT 1 FROM reservations
    WHERE id = p_reservation_id
      AND booking_status = 'awaiting_payment'
  ) THEN
    RETURN jsonb_build_object('error', 'Reservation not found or not awaiting payment');
  END IF;

  -- Generate token
  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  -- Insert token record
  INSERT INTO booking_access_tokens (reservation_id, token_hash, expires_at)
  VALUES (p_reservation_id, v_token_hash, now() + interval '1 hour');

  RETURN jsonb_build_object('token', v_token);
END;
$$;

-- ============================================================
-- 3. RPC FUNCTIONS — Payment Processing (Webhook Handlers)
-- ============================================================

-- 3.1 create_booking_checkout
CREATE OR REPLACE FUNCTION public.create_booking_checkout(
  p_reservation_id uuid,
  p_integration_id uuid,
  p_provider text,
  p_environment text,
  p_payment_type text,
  p_amount numeric,
  p_currency text,
  p_idempotency_key text,
  p_platform_fee_amount numeric DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation record;
  v_payment_id uuid;
BEGIN
  -- Validate reservation
  SELECT * INTO v_reservation
  FROM reservations
  WHERE id = p_reservation_id
    AND booking_status = 'awaiting_payment';

  IF v_reservation IS NULL THEN
    RETURN jsonb_build_object('error', 'Reservation not found or not awaiting payment');
  END IF;

  -- Check for existing non-terminal payment
  IF EXISTS (
    SELECT 1 FROM payments
    WHERE reservation_id = p_reservation_id
      AND status IN ('pending', 'processing')
  ) THEN
    RETURN jsonb_build_object('error', 'A payment is already in progress for this reservation');
  END IF;

  -- Create payment record
  INSERT INTO payments (
    tenant_id, reservation_id, integration_id,
    provider, environment, payment_type,
    amount, currency, platform_fee_amount,
    idempotency_key, metadata, status
  ) VALUES (
    v_reservation.tenant_id, p_reservation_id, p_integration_id,
    p_provider, p_environment, p_payment_type,
    p_amount, p_currency, p_platform_fee_amount,
    p_idempotency_key, p_metadata, 'pending'
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object('payment_id', v_payment_id);
END;
$$;

-- 3.2 record_webhook_event
CREATE OR REPLACE FUNCTION public.record_webhook_event(
  p_provider text,
  p_environment text,
  p_provider_event_id text,
  p_event_type text,
  p_safe_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_webhook_id uuid;
BEGIN
  INSERT INTO webhook_events (provider, environment, provider_event_id, event_type, safe_metadata, processing_status)
  VALUES (p_provider, p_environment, p_provider_event_id, p_event_type, p_safe_metadata, 'processing')
  ON CONFLICT (provider, environment, provider_event_id) DO NOTHING
  RETURNING id INTO v_webhook_id;

  IF v_webhook_id IS NULL THEN
    RETURN jsonb_build_object('webhook_id', null, 'already_exists', true);
  END IF;

  RETURN jsonb_build_object('webhook_id', v_webhook_id);
END;
$$;

-- 3.3 confirm_payment_from_webhook
CREATE OR REPLACE FUNCTION public.confirm_payment_from_webhook(
  p_provider text,
  p_environment text,
  p_provider_event_id text,
  p_provider_checkout_id text,
  p_provider_payment_id text DEFAULT NULL,
  p_provider_charge_id text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_payment_type text DEFAULT 'deposit',
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
  v_reservation record;
BEGIN
  -- Find the payment by checkout session
  SELECT * INTO v_payment
  FROM payments
  WHERE provider_checkout_session_id = p_provider_checkout_id
    AND provider = p_provider
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_payment IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found', 'error', 'No payment found for this checkout session');
  END IF;

  IF v_payment.status = 'succeeded' THEN
    RETURN jsonb_build_object('status', 'already_confirmed');
  END IF;

  -- Update payment to succeeded
  UPDATE payments SET
    status = 'succeeded',
    provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
    provider_charge_id = coalesce(p_provider_charge_id, provider_charge_id),
    paid_at = now(),
    updated_at = now()
  WHERE id = v_payment.id;

  -- Update reservation
  SELECT * INTO v_reservation FROM reservations WHERE id = v_payment.reservation_id;

  IF v_reservation IS NOT NULL THEN
    UPDATE reservations SET
      booking_status = 'confirmed',
      payment_status = CASE
        WHEN p_payment_type = 'full_payment' THEN 'paid'
        ELSE 'deposit_paid'
      END,
      amount_paid = coalesce(amount_paid, 0) + coalesce(p_amount, v_payment.amount),
      balance_due = greatest(0, coalesce(total_amount, 0) - coalesce(amount_paid, 0) - coalesce(p_amount, v_payment.amount)),
      deposit_amount = CASE
        WHEN p_payment_type = 'deposit' THEN coalesce(p_amount, v_payment.amount)
        ELSE deposit_amount
      END,
      confirmed_at = now(),
      expires_at = NULL,
      updated_at = now()
    WHERE id = v_payment.reservation_id;
  END IF;

  RETURN jsonb_build_object('status', 'confirmed', 'payment_id', v_payment.id);
END;
$$;

-- 3.4 expire_checkout_session
CREATE OR REPLACE FUNCTION public.expire_checkout_session(
  p_provider_checkout_id text,
  p_provider text DEFAULT 'stripe'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
BEGIN
  SELECT * INTO v_payment
  FROM payments
  WHERE provider_checkout_session_id = p_provider_checkout_id
    AND provider = p_provider
    AND status IN ('pending', 'processing');

  IF v_payment IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  UPDATE payments SET
    status = 'expired',
    updated_at = now()
  WHERE id = v_payment.id;

  RETURN jsonb_build_object('status', 'expired', 'payment_id', v_payment.id);
END;
$$;

-- 3.5 record_payment_failure
CREATE OR REPLACE FUNCTION public.record_payment_failure(
  p_provider text,
  p_environment text,
  p_provider_event_id text,
  p_provider_checkout_id text,
  p_provider_payment_id text DEFAULT NULL,
  p_failure_code text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
BEGIN
  SELECT * INTO v_payment
  FROM payments
  WHERE provider_checkout_session_id = p_provider_checkout_id
    AND provider = p_provider
    AND status IN ('pending', 'processing');

  IF v_payment IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  UPDATE payments SET
    status = 'failed',
    provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
    failure_code = p_failure_code,
    failure_reason = p_failure_reason,
    failed_at = now(),
    updated_at = now()
  WHERE id = v_payment.id;

  RETURN jsonb_build_object('status', 'failed', 'payment_id', v_payment.id);
END;
$$;

-- 3.6 process_refund
CREATE OR REPLACE FUNCTION public.process_refund(
  p_payment_id uuid,
  p_refunded_amount numeric,
  p_reason text DEFAULT NULL,
  p_actor_name text DEFAULT 'system',
  p_provider_refund_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment record;
BEGIN
  SELECT * INTO v_payment
  FROM payments
  WHERE id = p_payment_id
    AND status = 'succeeded';

  IF v_payment IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found', 'error', 'Payment not found or not in succeeded state');
  END IF;

  UPDATE payments SET
    status = CASE
      WHEN p_refunded_amount >= amount THEN 'refunded'
      ELSE 'partially_refunded'
    END,
    refunded_amount = coalesce(refunded_amount, 0) + p_refunded_amount,
    provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
    refunded_at = now(),
    updated_at = now()
  WHERE id = p_payment_id;

  -- Update reservation
  UPDATE reservations SET
    payment_status = CASE
      WHEN p_refunded_amount >= v_payment.amount THEN 'refunded'
      ELSE 'partially_refunded'
    END,
    amount_paid = greatest(0, coalesce(amount_paid, 0) - p_refunded_amount),
    balance_due = coalesce(balance_due, 0) + p_refunded_amount,
    updated_at = now()
  WHERE id = v_payment.reservation_id;

  RETURN jsonb_build_object('status', 'refunded', 'payment_id', p_payment_id, 'refunded_amount', p_refunded_amount);
END;
$$;

-- 3.7 mark_webhook_processed
CREATE OR REPLACE FUNCTION public.mark_webhook_processed(
  p_provider text,
  p_environment text,
  p_provider_event_id text,
  p_success boolean DEFAULT true,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE webhook_events SET
    processing_status = CASE WHEN p_success THEN 'processed' ELSE 'failed' END,
    error_message = p_error_message,
    processed_at = now()
  WHERE provider = p_provider
    AND environment = p_environment
    AND provider_event_id = p_provider_event_id;
END;
$$;

-- 3.8 expire_stale_holds (for the expire-holds edge function)
CREATE OR REPLACE FUNCTION public.expire_stale_holds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE reservations SET
    booking_status = 'expired',
    payment_status = 'expired',
    updated_at = now()
  WHERE booking_status = 'awaiting_payment'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('expired_count', v_count);
END;
$$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
