/*
# Phase 3 — Listing Configuration, Pricing Options, and Booking Engine

## Summary
Adds listing_pricing_options table, payment/deposit config columns to listings,
calculate_booking_price RPC, get_public_availability RPC, updated create_public_booking_hold
with server-side pricing, expire_stale_holds RPC, approve/decline_booking_request RPCs.

## Changes
1. New columns on listings for payment, deposit, slot, and booking rule config
2. New table: listing_pricing_options
3. New RPCs: calculate_booking_price, get_public_availability, expire_stale_holds, approve_booking_request, decline_booking_request
4. Updated RPC: create_public_booking_hold (new signature with pricing_option_id, server-side pricing)
5. Dropped old create_public_booking_hold signature
6. RLS, indexes, grants
*/

-- ============================================================
-- 1. Add payment/booking config columns to listings
-- ============================================================

ALTER TABLE listings 
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'deposit' CHECK (payment_mode IN ('deposit', 'full_payment', 'request_only', 'pay_at_location')),
  ADD COLUMN IF NOT EXISTS deposit_type text NOT NULL DEFAULT 'percentage' CHECK (deposit_type IN ('percentage', 'fixed', 'none')),
  ADD COLUMN IF NOT EXISTS deposit_percentage numeric(5,2) NOT NULL DEFAULT 30 CHECK (deposit_percentage >= 0 AND deposit_percentage <= 100),
  ADD COLUMN IF NOT EXISTS deposit_fixed_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (deposit_fixed_amount >= 0),
  ADD COLUMN IF NOT EXISTS require_full_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_pay_at_location boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS balance_due_timing text NOT NULL DEFAULT 'before_service' CHECK (balance_due_timing IN ('at_location', 'before_service', 'immediately', 'custom_days_before')),
  ADD COLUMN IF NOT EXISTS balance_due_days_before integer,
  ADD COLUMN IF NOT EXISTS online_booking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS request_to_book_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS request_blocks_availability boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS request_expiration_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS hold_duration_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS tax_percentage numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_percentage >= 0 AND tax_percentage <= 100),
  ADD COLUMN IF NOT EXISTS service_fee_type text NOT NULL DEFAULT 'none' CHECK (service_fee_type IN ('none', 'percentage', 'fixed')),
  ADD COLUMN IF NOT EXISTS service_fee_percentage numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee_fixed_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slot_mode text NOT NULL DEFAULT 'interval' CHECK (slot_mode IN ('interval', 'fixed_times', 'request_any_time')),
  ADD COLUMN IF NOT EXISTS slot_interval_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS full_description text,
  ADD COLUMN IF NOT EXISTS minimum_guests integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS meeting_instructions text,
  ADD COLUMN IF NOT EXISTS customer_instructions text,
  ADD COLUMN IF NOT EXISTS cancellation_policy_text text,
  ADD COLUMN IF NOT EXISTS terms_summary text;

-- ============================================================
-- 2. Create listing_pricing_options table
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_pricing_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  base_price numeric(10,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  pricing_type text NOT NULL DEFAULT 'flat' CHECK (pricing_type IN ('flat', 'per_person', 'flat_plus_additional_guest', 'hourly', 'custom_package')),
  minimum_guests integer DEFAULT 1,
  maximum_guests integer,
  price_per_additional_guest numeric(10,2) DEFAULT 0,
  included_guests integer DEFAULT 0,
  start_time_restriction time,
  end_time_restriction time,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE listing_pricing_options ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pricing_options_listing ON listing_pricing_options(listing_id);
CREATE INDEX IF NOT EXISTS idx_pricing_options_tenant ON listing_pricing_options(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pricing_options_active ON listing_pricing_options(listing_id, is_active) WHERE is_active = true;

DROP POLICY IF EXISTS "select_pricing_options_authenticated" ON listing_pricing_options;
CREATE POLICY "select_pricing_options_authenticated" ON listing_pricing_options
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "select_pricing_options_anon" ON listing_pricing_options;
CREATE POLICY "select_pricing_options_anon" ON listing_pricing_options
  FOR SELECT TO anon USING (is_active = true);

DROP POLICY IF EXISTS "insert_pricing_options" ON listing_pricing_options;
CREATE POLICY "insert_pricing_options" ON listing_pricing_options
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_pricing_options" ON listing_pricing_options;
CREATE POLICY "update_pricing_options" ON listing_pricing_options
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_pricing_options" ON listing_pricing_options;
CREATE POLICY "delete_pricing_options" ON listing_pricing_options
  FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 3. Drop old create_public_booking_hold (old signature)
-- ============================================================

DROP FUNCTION IF EXISTS public.create_public_booking_hold(
  uuid, uuid, text, timestamptz, timestamptz, text, text, integer
);

-- ============================================================
-- 4. calculate_booking_price RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_booking_price(
  p_listing_id uuid,
  p_pricing_option_id uuid,
  p_guest_count integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_listing RECORD;
  v_option RECORD;
  v_base_amount numeric(10,2) := 0;
  v_guest_adjustment numeric(10,2) := 0;
  v_subtotal numeric(10,2) := 0;
  v_service_fee numeric(10,2) := 0;
  v_tax numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_deposit numeric(10,2) := 0;
  v_amount_due_now numeric(10,2) := 0;
  v_balance_due numeric(10,2) := 0;
  v_guests int := COALESCE(p_guest_count, 1);
BEGIN
  SELECT * INTO v_listing FROM listings WHERE id = p_listing_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Listing not available');
  END IF;

  SELECT * INTO v_option FROM listing_pricing_options
  WHERE id = p_pricing_option_id AND listing_id = p_listing_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid pricing option');
  END IF;

  IF v_guests < COALESCE(v_listing.minimum_guests, 1) THEN
    RETURN jsonb_build_object('error', 'Minimum guests not met');
  END IF;
  IF v_guests > COALESCE(v_listing.capacity, 1) THEN
    RETURN jsonb_build_object('error', 'Exceeds capacity');
  END IF;
  IF v_option.minimum_guests IS NOT NULL AND v_guests < v_option.minimum_guests THEN
    RETURN jsonb_build_object('error', 'Minimum guests for this option not met');
  END IF;
  IF v_option.maximum_guests IS NOT NULL AND v_guests > v_option.maximum_guests THEN
    RETURN jsonb_build_object('error', 'Exceeds maximum guests for this option');
  END IF;

  v_base_amount := v_option.base_price;

  IF v_option.pricing_type = 'per_person' THEN
    v_base_amount := v_option.base_price * v_guests;
    v_guest_adjustment := 0;
  ELSIF v_option.pricing_type = 'flat_plus_additional_guest' THEN
    v_guest_adjustment := 0;
    IF v_guests > COALESCE(v_option.included_guests, 0) THEN
      v_guest_adjustment := (v_guests - COALESCE(v_option.included_guests, 0)) * COALESCE(v_option.price_per_additional_guest, 0);
    END IF;
  ELSIF v_option.pricing_type = 'hourly' THEN
    v_base_amount := v_option.base_price * (v_option.duration_minutes / 60.0);
  END IF;

  v_subtotal := v_base_amount + v_guest_adjustment;

  IF v_listing.service_fee_type = 'percentage' THEN
    v_service_fee := ROUND(v_subtotal * (v_listing.service_fee_percentage / 100.0), 2);
  ELSIF v_listing.service_fee_type = 'fixed' THEN
    v_service_fee := v_listing.service_fee_fixed_amount;
  END IF;

  IF v_listing.tax_percentage > 0 THEN
    v_tax := ROUND((v_subtotal + v_service_fee) * (v_listing.tax_percentage / 100.0), 2);
  END IF;

  v_total := v_subtotal + v_service_fee + v_tax;

  IF v_listing.payment_mode = 'full_payment' THEN
    v_deposit := v_total;
  ELSIF v_listing.payment_mode IN ('request_only', 'pay_at_location') THEN
    v_deposit := 0;
  ELSIF v_listing.deposit_type = 'percentage' THEN
    v_deposit := ROUND(v_total * (v_listing.deposit_percentage / 100.0), 2);
  ELSIF v_listing.deposit_type = 'fixed' THEN
    v_deposit := LEAST(v_listing.deposit_fixed_amount, v_total);
  ELSIF v_listing.deposit_type = 'none' THEN
    v_deposit := 0;
  END IF;

  v_amount_due_now := v_deposit;
  v_balance_due := v_total - v_deposit;

  RETURN jsonb_build_object(
    'base_amount', v_base_amount,
    'guest_adjustment', v_guest_adjustment,
    'subtotal_amount', v_subtotal,
    'service_fee_amount', v_service_fee,
    'tax_amount', v_tax,
    'total_amount', v_total,
    'deposit_amount', v_deposit,
    'amount_due_now', v_amount_due_now,
    'balance_due', v_balance_due,
    'currency', COALESCE(v_listing.currency, 'USD'),
    'pricing_option_name', v_option.name,
    'duration_minutes', v_option.duration_minutes,
    'payment_mode', v_listing.payment_mode,
    'deposit_type', v_listing.deposit_type,
    'deposit_percentage', v_listing.deposit_percentage,
    'balance_due_timing', v_listing.balance_due_timing
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calculate_booking_price TO anon, authenticated;

-- ============================================================
-- 5. get_public_availability RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_public_availability(
  p_tenant_slug text,
  p_listing_slug text,
  p_pricing_option_id uuid,
  p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant RECORD;
  v_listing RECORD;
  v_option RECORD;
  v_day_of_week int;
  v_result jsonb[] := ARRAY[]::jsonb[];
  v_slot_start timestamptz;
  v_slot_end timestamptz;
  v_buffer_before int;
  v_buffer_after int;
  v_min_notice timestamptz;
  v_now timestamptz := now();
  v_tz text;
  v_conflict_count int;
  v_block_count int;
  v_operating RECORD;
  v_period_start time;
  v_period_end time;
  v_current_time timestamptz;
  v_interval_minutes int;
  v_period_end_ts timestamptz;
  v_max_advance date;
BEGIN
  SELECT * INTO v_tenant FROM tenants WHERE slug = p_tenant_slug AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Not found');
  END IF;

  SELECT * INTO v_listing FROM listings
  WHERE slug = p_listing_slug AND tenant_id = v_tenant.id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Not found');
  END IF;

  IF v_listing.online_booking_enabled = false THEN
    RETURN jsonb_build_object('error', 'Online booking not available');
  END IF;

  SELECT * INTO v_option FROM listing_pricing_options
  WHERE id = p_pricing_option_id AND listing_id = v_listing.id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid option');
  END IF;

  v_tz := COALESCE(v_listing.timezone, 'America/New_York');
  v_buffer_before := COALESCE(v_listing.buffer_before_minutes, 0);
  v_buffer_after := COALESCE(v_listing.buffer_after_minutes, 0);
  v_interval_minutes := COALESCE(v_listing.slot_interval_minutes, 60);

  v_min_notice := v_now + (COALESCE(v_listing.minimum_notice_hours, 0) || ' hours')::interval;

  IF v_listing.maximum_advance_days IS NOT NULL THEN
    v_max_advance := (v_now::date + v_listing.maximum_advance_days);
    IF p_date > v_max_advance THEN
      RETURN jsonb_build_object('error', 'Date too far in advance');
    END IF;
  END IF;

  v_day_of_week := EXTRACT(DOW FROM p_date)::int;

  IF NOT EXISTS(
    SELECT 1 FROM listing_operating_hours
    WHERE listing_id = v_listing.id
      AND day_of_week = v_day_of_week
      AND is_active = true
      AND (valid_from IS NULL OR p_date >= valid_from)
      AND (valid_until IS NULL OR p_date <= valid_until)
  ) THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'available', false, 'reason', 'Closed');
  END IF;

  FOR v_operating IN
    SELECT * FROM listing_operating_hours
    WHERE listing_id = v_listing.id
      AND day_of_week = v_day_of_week
      AND is_active = true
      AND (valid_from IS NULL OR p_date >= valid_from)
      AND (valid_until IS NULL OR p_date <= valid_until)
    ORDER BY start_time
  LOOP
    v_period_start := COALESCE(v_option.start_time_restriction, v_operating.start_time);
    v_period_end := COALESCE(v_option.end_time_restriction, v_operating.end_time);

    v_slot_start := (p_date::text || ' ' || v_period_start::text || ' ' || v_tz)::timestamptz;
    v_period_end_ts := (p_date::text || ' ' || v_period_end::text || ' ' || v_tz)::timestamptz;
    v_current_time := v_slot_start;

    WHILE v_current_time < v_period_end_ts LOOP
      v_slot_end := v_current_time + (v_option.duration_minutes || ' minutes')::interval;

      IF v_slot_end > v_period_end_ts THEN
        EXIT;
      END IF;

      IF v_current_time < v_min_notice THEN
        v_current_time := v_current_time + (v_interval_minutes || ' minutes')::interval;
        CONTINUE;
      END IF;

      SELECT COUNT(*) INTO v_block_count
      FROM listing_blocks
      WHERE listing_id = v_listing.id
        AND start_at < v_slot_end + (v_buffer_after || ' minutes')::interval
        AND end_at > v_current_time - (v_buffer_before || ' minutes')::interval;

      IF v_block_count > 0 THEN
        v_current_time := v_current_time + (v_interval_minutes || ' minutes')::interval;
        CONTINUE;
      END IF;

      SELECT COUNT(*) INTO v_conflict_count
      FROM reservations
      WHERE listing_id = v_listing.id
        AND start_at IS NOT NULL AND end_at IS NOT NULL
        AND start_at < v_slot_end + (v_buffer_after || ' minutes')::interval
        AND end_at > v_current_time - (v_buffer_before || ' minutes')::interval
        AND (
          booking_status IN ('confirmed', 'in_progress')
          OR (booking_status IN ('pending', 'awaiting_payment') AND expires_at IS NOT NULL AND expires_at > v_now)
        );

      IF v_conflict_count > 0 THEN
        v_current_time := v_current_time + (v_interval_minutes || ' minutes')::interval;
        CONTINUE;
      END IF;

      IF v_listing.request_blocks_availability = true THEN
        SELECT COUNT(*) INTO v_conflict_count
        FROM reservations
        WHERE listing_id = v_listing.id
          AND start_at IS NOT NULL AND end_at IS NOT NULL
          AND start_at < v_slot_end
          AND end_at > v_current_time
          AND booking_status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at > v_now;

        IF v_conflict_count > 0 THEN
          v_current_time := v_current_time + (v_interval_minutes || ' minutes')::interval;
          CONTINUE;
        END IF;
      END IF;

      v_result := array_append(v_result, jsonb_build_object(
        'start', to_char(v_current_time AT TIME ZONE v_tz, 'HH24:MI'),
        'start_utc', v_current_time,
        'end', to_char(v_slot_end AT TIME ZONE v_tz, 'HH24:MI'),
        'end_utc', v_slot_end
      ));

      v_current_time := v_current_time + (v_interval_minutes || ' minutes')::interval;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('slots', to_jsonb(v_result), 'available', array_length(v_result, 1) > 0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_public_availability TO anon, authenticated;

-- ============================================================
-- 6. Updated create_public_booking_hold RPC (new signature)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_public_booking_hold(
  p_tenant_id uuid,
  p_listing_id uuid,
  p_pricing_option_id uuid,
  p_client_name text,
  p_start_at timestamptz,
  p_guest_count integer DEFAULT 1,
  p_client_email text DEFAULT NULL,
  p_client_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant RECORD;
  v_listing RECORD;
  v_option RECORD;
  v_conflict RECORD;
  v_block RECORD;
  v_reservation_id uuid;
  v_booking_reference text;
  v_price jsonb;
  v_end_at timestamptz;
  v_expires_at timestamptz;
  v_customer_id uuid;
  v_booking_status text;
  v_payment_status text;
  v_source text;
  v_now timestamptz := now();
BEGIN
  IF p_tenant_id IS NULL OR p_listing_id IS NULL OR p_pricing_option_id IS NULL OR p_client_name IS NULL OR btrim(p_client_name) = '' OR p_start_at IS NULL THEN
    RETURN jsonb_build_object('error', 'Missing required fields');
  END IF;
  IF p_guest_count IS NULL OR p_guest_count < 1 THEN
    RETURN jsonb_build_object('error', 'Invalid guest count');
  END IF;

  SELECT id INTO v_tenant FROM tenants WHERE id = p_tenant_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid tenant');
  END IF;

  SELECT * INTO v_listing FROM listings
  WHERE id = p_listing_id AND tenant_id = p_tenant_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Listing not available');
  END IF;

  SELECT * INTO v_option FROM listing_pricing_options
  WHERE id = p_pricing_option_id AND listing_id = p_listing_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid pricing option');
  END IF;

  IF p_guest_count > COALESCE(v_listing.capacity, 1) THEN
    RETURN jsonb_build_object('error', 'Exceeds capacity');
  END IF;
  IF p_guest_count < COALESCE(v_listing.minimum_guests, 1) THEN
    RETURN jsonb_build_object('error', 'Minimum guests not met');
  END IF;

  v_end_at := p_start_at + (v_option.duration_minutes || ' minutes')::interval;

  v_price := calculate_booking_price(p_listing_id, p_pricing_option_id, p_guest_count);
  IF (v_price->>'error') IS NOT NULL THEN
    RETURN v_price;
  END IF;

  IF v_listing.payment_mode = 'request_only' THEN
    v_booking_status := 'pending';
    v_payment_status := 'unpaid';
    v_source := 'public_request';
    v_expires_at := v_now + (COALESCE(v_listing.request_expiration_hours, 48) || ' hours')::interval;
  ELSE
    v_booking_status := 'awaiting_payment';
    v_payment_status := 'unpaid';
    v_source := 'public_booking';
    v_expires_at := v_now + (COALESCE(v_listing.hold_duration_minutes, 15) || ' minutes')::interval;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_listing_id::text));

  SELECT * INTO v_block FROM listing_blocks
  WHERE listing_id = p_listing_id
    AND start_at < v_end_at + (COALESCE(v_listing.buffer_after_minutes, 0) || ' minutes')::interval
    AND end_at > p_start_at - (COALESCE(v_listing.buffer_before_minutes, 0) || ' minutes')::interval
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('error', 'Listing is blocked for this time period');
  END IF;

  SELECT * INTO v_conflict FROM reservations
  WHERE listing_id = p_listing_id
    AND start_at IS NOT NULL AND end_at IS NOT NULL
    AND start_at < v_end_at + (COALESCE(v_listing.buffer_after_minutes, 0) || ' minutes')::interval
    AND end_at > p_start_at - (COALESCE(v_listing.buffer_before_minutes, 0) || ' minutes')::interval
    AND (
      booking_status IN ('confirmed', 'in_progress')
      OR (booking_status IN ('pending', 'awaiting_payment') AND expires_at IS NOT NULL AND expires_at > v_now)
    )
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('error', 'Time slot conflicts with an existing reservation');
  END IF;

  IF v_listing.request_blocks_availability = true THEN
    SELECT * INTO v_conflict FROM reservations
    WHERE listing_id = p_listing_id
      AND start_at IS NOT NULL AND end_at IS NOT NULL
      AND start_at < v_end_at
      AND end_at > p_start_at
      AND booking_status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at > v_now
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('error', 'Time slot has a pending request');
    END IF;
  END IF;

  SELECT id INTO v_customer_id FROM customers
  WHERE tenant_id = p_tenant_id
    AND (email = p_client_email OR (p_client_email IS NULL AND phone = p_client_phone))
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO customers (tenant_id, name, email, phone)
    VALUES (p_tenant_id, p_client_name, p_client_email, p_client_phone)
    RETURNING id INTO v_customer_id;
  END IF;

  INSERT INTO reservations (
    tenant_id, listing_id, customer_id,
    title, client_name, client_email, client_phone,
    start_at, end_at, timezone,
    guest_count, duration_minutes,
    subtotal_amount, tax_amount, service_fee_amount,
    total_amount, deposit_amount, balance_due,
    currency, booking_status, payment_status,
    source, notes, expires_at,
    vessel, charter_date, charter_end, monetary_value, status
  )
  VALUES (
    p_tenant_id, p_listing_id, v_customer_id,
    COALESCE(v_listing.name, p_client_name), p_client_name, p_client_email, p_client_phone,
    p_start_at, v_end_at, COALESCE(v_listing.timezone, 'America/New_York'),
    p_guest_count, v_option.duration_minutes,
    (v_price->>'subtotal_amount')::numeric, (v_price->>'tax_amount')::numeric, (v_price->>'service_fee_amount')::numeric,
    (v_price->>'total_amount')::numeric, (v_price->>'deposit_amount')::numeric, (v_price->>'balance_due')::numeric,
    COALESCE(v_listing.currency, 'USD'), v_booking_status, v_payment_status,
    v_source, p_notes, v_expires_at,
    v_listing.name, p_start_at, v_end_at, (v_price->>'total_amount')::numeric, v_booking_status
  )
  RETURNING id, booking_reference INTO v_reservation_id, v_booking_reference;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, metadata)
  VALUES (
    p_tenant_id, 'reservation', v_reservation_id, 'created',
    jsonb_build_object(
      'booking_reference', v_booking_reference,
      'client_name', p_client_name,
      'listing_name', v_listing.name,
      'source', v_source,
      'expires_at', v_expires_at,
      'total_amount', v_price->>'total_amount',
      'deposit_amount', v_price->>'deposit_amount'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'booking_reference', v_booking_reference,
    'expires_at', v_expires_at,
    'booking_status', v_booking_status,
    'price', v_price
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_public_booking_hold TO anon, authenticated;

-- ============================================================
-- 7. expire_stale_holds RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.expire_stale_holds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  UPDATE reservations
  SET booking_status = 'expired',
      updated_at = now()
  WHERE booking_status = 'awaiting_payment'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'expired_count', v_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.expire_stale_holds TO authenticated, service_role;

-- ============================================================
-- 8. approve_booking_request RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.approve_booking_request(
  p_reservation_id uuid,
  p_acting_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reservation RECORD;
  v_tenant_id uuid;
  v_conflict RECORD;
BEGIN
  v_tenant_id := current_tenant_id();
  IF v_tenant_id IS NULL AND p_acting_user_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM tenant_users
    WHERE user_id = p_acting_user_id AND role = 'tenant_admin' LIMIT 1;
  END IF;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unable to determine tenant');
  END IF;

  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Reservation not found');
  END IF;
  IF v_reservation.tenant_id != v_tenant_id THEN
    RETURN jsonb_build_object('error', 'Not found');
  END IF;
  IF v_reservation.booking_status != 'pending' THEN
    RETURN jsonb_build_object('error', 'Reservation is not pending');
  END IF;

  SELECT * INTO v_conflict FROM reservations
  WHERE listing_id = v_reservation.listing_id
    AND id != p_reservation_id
    AND start_at IS NOT NULL AND end_at IS NOT NULL
    AND start_at < v_reservation.end_at
    AND end_at > v_reservation.start_at
    AND (
      booking_status IN ('confirmed', 'in_progress')
      OR (booking_status IN ('pending', 'awaiting_payment') AND expires_at IS NOT NULL AND expires_at > now())
    )
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('error', 'Time slot is no longer available');
  END IF;

  IF v_reservation.deposit_amount > 0 OR v_reservation.total_amount > 0 THEN
    UPDATE reservations
    SET booking_status = 'awaiting_payment',
        confirmed_at = now(),
        expires_at = now() + (COALESCE(
          (SELECT hold_duration_minutes FROM listings WHERE id = v_reservation.listing_id), 15
        ) || ' minutes')::interval,
        updated_at = now()
    WHERE id = p_reservation_id;
  ELSE
    UPDATE reservations
    SET booking_status = 'confirmed',
        confirmed_at = now(),
        updated_at = now()
    WHERE id = p_reservation_id;
  END IF;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_user_id, actor_name, metadata)
  VALUES (v_tenant_id, 'reservation', p_reservation_id, 'approved',
          p_acting_user_id, p_actor_name,
          jsonb_build_object('booking_reference', v_reservation.booking_reference));

  RETURN jsonb_build_object('success', true, 'reservation_id', p_reservation_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.approve_booking_request TO authenticated;

-- ============================================================
-- 9. decline_booking_request RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.decline_booking_request(
  p_reservation_id uuid,
  p_acting_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reservation RECORD;
  v_tenant_id uuid;
BEGIN
  v_tenant_id := current_tenant_id();
  IF v_tenant_id IS NULL AND p_acting_user_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM tenant_users
    WHERE user_id = p_acting_user_id AND role = 'tenant_admin' LIMIT 1;
  END IF;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unable to determine tenant');
  END IF;

  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Reservation not found');
  END IF;
  IF v_reservation.tenant_id != v_tenant_id THEN
    RETURN jsonb_build_object('error', 'Not found');
  END IF;
  IF v_reservation.booking_status != 'pending' THEN
    RETURN jsonb_build_object('error', 'Reservation is not pending');
  END IF;

  UPDATE reservations
  SET booking_status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = COALESCE(p_reason, 'Declined by operator'),
      updated_at = now()
  WHERE id = p_reservation_id;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_user_id, actor_name, metadata)
  VALUES (v_tenant_id, 'reservation', p_reservation_id, 'declined',
          p_acting_user_id, p_actor_name,
          jsonb_build_object('booking_reference', v_reservation.booking_reference, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'reservation_id', p_reservation_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.decline_booking_request TO authenticated;

-- ============================================================
-- 10. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_reservations_listing_status
  ON reservations(listing_id, booking_status, start_at, end_at)
  WHERE booking_status IN ('confirmed', 'in_progress', 'pending', 'awaiting_payment');

CREATE INDEX IF NOT EXISTS idx_listing_blocks_listing_dates
  ON listing_blocks(listing_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_listings_tenant_slug
  ON listings(tenant_id, slug)
  WHERE is_active = true;
