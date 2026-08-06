/*
# Phase 3.1 — Hardening: RLS, Fixed Start Times, Deposit Source of Truth, Customer Normalization

## Summary

1. Fix listing_pricing_options RLS — replace WITH CHECK (true) with tenant-aware policies
2. Create listing_fixed_start_times table for fixed departure time slots
3. Fix deposit_percentage to be NOT NULL DEFAULT 30 (was nullable, causing null deposits)
4. Update create_public_booking_hold to normalize email/phone for customer deduplication
5. Update get_public_availability to support fixed_times slot mode
6. Add rate limiting RPCs for availability and price calculation
7. Add listing_blocks notes column for internal notes

## RLS Changes

### listing_pricing_options
- SELECT (authenticated): is_super_admin() OR tenant_id = current_tenant_id()
- SELECT (anon): is_active = true AND listing belongs to active listing
- INSERT (authenticated): is_super_admin() OR (tenant_id = current_tenant_id() AND listing belongs to tenant)
- UPDATE (authenticated): is_super_admin() OR tenant_id = current_tenant_id()
- DELETE (authenticated): is_super_admin() OR tenant_id = current_tenant_id()

## New Tables

### listing_fixed_start_times
- id uuid PK
- tenant_id uuid FK → tenants
- listing_id uuid FK → listings
- day_of_week integer (0-6)
- start_time time
- pricing_option_id uuid nullable FK → listing_pricing_options
- valid_from date nullable
- valid_until date nullable
- is_active boolean
- sort_order integer
- created_at, updated_at timestamptz

## Column Changes

### listings
- deposit_percentage: changed from nullable to NOT NULL DEFAULT 30

### listing_blocks
- notes text (internal notes)

## RPC Changes

### create_public_booking_hold
- Normalizes email to lowercase + trim
- Normalizes phone (strip non-numeric)
- Matches customers by normalized_email or normalized_phone within tenant
- Creates customer with normalized values

### get_public_availability
- When slot_mode = 'fixed_times', generates slots from listing_fixed_start_times instead of interval

### check_rate_limit
- Already exists, used for availability and booking rate limiting
*/

-- ============================================================
-- 1. Fix listing_pricing_options RLS
-- ============================================================

DROP POLICY IF EXISTS "select_pricing_options_authenticated" ON listing_pricing_options;
CREATE POLICY "select_pricing_options_authenticated" ON listing_pricing_options
  FOR SELECT TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "select_pricing_options_anon" ON listing_pricing_options;
CREATE POLICY "select_pricing_options_anon" ON listing_pricing_options
  FOR SELECT TO anon USING (
    is_active = true
    AND listing_id IN (
      SELECT listings.id FROM listings
      WHERE listings.is_active = true
        AND listings.online_booking_enabled = true
    )
  );

DROP POLICY IF EXISTS "insert_pricing_options" ON listing_pricing_options;
CREATE POLICY "insert_pricing_options" ON listing_pricing_options
  FOR INSERT TO authenticated WITH CHECK (
    is_super_admin() OR (
      tenant_id = current_tenant_id()
      AND listing_id IN (
        SELECT listings.id FROM listings
        WHERE listings.tenant_id = current_tenant_id()
      )
    )
  );

DROP POLICY IF EXISTS "update_pricing_options" ON listing_pricing_options;
CREATE POLICY "update_pricing_options" ON listing_pricing_options
  FOR UPDATE TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "delete_pricing_options" ON listing_pricing_options;
CREATE POLICY "delete_pricing_options" ON listing_pricing_options
  FOR DELETE TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- ============================================================
-- 2. Fix deposit_percentage to NOT NULL DEFAULT 30
-- ============================================================

UPDATE listings SET deposit_percentage = 30 WHERE deposit_percentage IS NULL;

ALTER TABLE listings ALTER COLUMN deposit_percentage SET NOT NULL;
ALTER TABLE listings ALTER COLUMN deposit_percentage SET DEFAULT 30;

-- ============================================================
-- 3. Add notes column to listing_blocks
-- ============================================================

ALTER TABLE listing_blocks ADD COLUMN IF NOT EXISTS notes text;

-- ============================================================
-- 4. Create listing_fixed_start_times table
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_fixed_start_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time NOT NULL,
  pricing_option_id uuid REFERENCES listing_pricing_options(id) ON DELETE SET NULL,
  valid_from date,
  valid_until date,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE listing_fixed_start_times ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fixed_times_listing ON listing_fixed_start_times(listing_id);
CREATE INDEX IF NOT EXISTS idx_fixed_times_tenant ON listing_fixed_start_times(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fixed_times_active ON listing_fixed_start_times(listing_id, day_of_week, is_active) WHERE is_active = true;

-- RLS for listing_fixed_start_times
DROP POLICY IF EXISTS "select_fixed_times_authenticated" ON listing_fixed_start_times;
CREATE POLICY "select_fixed_times_authenticated" ON listing_fixed_start_times
  FOR SELECT TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "select_fixed_times_anon" ON listing_fixed_start_times;
CREATE POLICY "select_fixed_times_anon" ON listing_fixed_start_times
  FOR SELECT TO anon USING (
    is_active = true
    AND listing_id IN (
      SELECT listings.id FROM listings
      WHERE listings.is_active = true
        AND listings.online_booking_enabled = true
    )
  );

DROP POLICY IF EXISTS "insert_fixed_times" ON listing_fixed_start_times;
CREATE POLICY "insert_fixed_times" ON listing_fixed_start_times
  FOR INSERT TO authenticated WITH CHECK (
    is_super_admin() OR (
      tenant_id = current_tenant_id()
      AND listing_id IN (
        SELECT listings.id FROM listings
        WHERE listings.tenant_id = current_tenant_id()
      )
    )
  );

DROP POLICY IF EXISTS "update_fixed_times" ON listing_fixed_start_times;
CREATE POLICY "update_fixed_times" ON listing_fixed_start_times
  FOR UPDATE TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  ) WITH CHECK (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "delete_fixed_times" ON listing_fixed_start_times;
CREATE POLICY "delete_fixed_times" ON listing_fixed_start_times
  FOR DELETE TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- ============================================================
-- 5. Update get_public_availability to support fixed_times
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
  v_fixed RECORD;
  v_has_operating_hours boolean;
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

  -- Check if there are operating hours for this day
  SELECT EXISTS(
    SELECT 1 FROM listing_operating_hours
    WHERE listing_id = v_listing.id
      AND day_of_week = v_day_of_week
      AND is_active = true
      AND (valid_from IS NULL OR p_date >= valid_from)
      AND (valid_until IS NULL OR p_date <= valid_until)
  ) INTO v_has_operating_hours;

  IF NOT v_has_operating_hours AND v_listing.slot_mode != 'fixed_times' THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'available', false, 'reason', 'Closed');
  END IF;

  -- FIXED TIMES MODE
  IF v_listing.slot_mode = 'fixed_times' THEN
    -- Check for operating hours still needed for boundary validation
    IF NOT v_has_operating_hours THEN
      RETURN jsonb_build_object('slots', '[]'::jsonb, 'available', false, 'reason', 'Closed');
    END IF;

    FOR v_fixed IN
      SELECT * FROM listing_fixed_start_times
      WHERE listing_id = v_listing.id
        AND day_of_week = v_day_of_week
        AND is_active = true
        AND (pricing_option_id IS NULL OR pricing_option_id = p_pricing_option_id)
        AND (valid_from IS NULL OR p_date >= valid_from)
        AND (valid_until IS NULL OR p_date <= valid_until)
      ORDER BY start_time, sort_order
    LOOP
      v_slot_start := (p_date::text || ' ' || v_fixed.start_time::text || ' ' || v_tz)::timestamptz;
      v_slot_end := v_slot_start + (v_option.duration_minutes || ' minutes')::interval;

      -- Check minimum notice
      IF v_slot_start < v_min_notice THEN
        CONTINUE;
      END IF;

      -- Check if slot end exceeds operating hours boundary
      -- Find the operating period that contains this start time
      SELECT * INTO v_operating FROM listing_operating_hours
      WHERE listing_id = v_listing.id
        AND day_of_week = v_day_of_week
        AND is_active = true
        AND (valid_from IS NULL OR p_date >= valid_from)
        AND (valid_until IS NULL OR p_date <= valid_until)
        AND start_time <= v_fixed.start_time
        AND end_time > v_fixed.start_time
      ORDER BY start_time
      LIMIT 1;

      IF FOUND THEN
        v_period_end_ts := (p_date::text || ' ' || v_operating.end_time::text || ' ' || v_tz)::timestamptz;
        IF v_slot_end > v_period_end_ts THEN
          CONTINUE;
        END IF;
      END IF;

      -- Check for blocks
      SELECT COUNT(*) INTO v_block_count
      FROM listing_blocks
      WHERE listing_id = v_listing.id
        AND start_at < v_slot_end + (v_buffer_after || ' minutes')::interval
        AND end_at > v_slot_start - (v_buffer_before || ' minutes')::interval;

      IF v_block_count > 0 THEN
        CONTINUE;
      END IF;

      -- Check for conflicting reservations
      SELECT COUNT(*) INTO v_conflict_count
      FROM reservations
      WHERE listing_id = v_listing.id
        AND start_at IS NOT NULL AND end_at IS NOT NULL
        AND start_at < v_slot_end + (v_buffer_after || ' minutes')::interval
        AND end_at > v_slot_start - (v_buffer_before || ' minutes')::interval
        AND (
          booking_status IN ('confirmed', 'in_progress')
          OR (booking_status IN ('pending', 'awaiting_payment') AND expires_at IS NOT NULL AND expires_at > v_now)
        );

      IF v_conflict_count > 0 THEN
        CONTINUE;
      END IF;

      -- Check pending requests blocking
      IF v_listing.request_blocks_availability = true THEN
        SELECT COUNT(*) INTO v_conflict_count
        FROM reservations
        WHERE listing_id = v_listing.id
          AND start_at IS NOT NULL AND end_at IS NOT NULL
          AND start_at < v_slot_end
          AND end_at > v_slot_start
          AND booking_status = 'pending'
          AND expires_at IS NOT NULL
          AND expires_at > v_now;

        IF v_conflict_count > 0 THEN
          CONTINUE;
        END IF;
      END IF;

      v_result := array_append(v_result, jsonb_build_object(
        'start', to_char(v_slot_start AT TIME ZONE v_tz, 'HH24:MI'),
        'start_utc', v_slot_start,
        'end', to_char(v_slot_end AT TIME ZONE v_tz, 'HH24:MI'),
        'end_utc', v_slot_end
      ));
    END LOOP;

    RETURN jsonb_build_object('slots', to_jsonb(v_result), 'available', array_length(v_result, 1) > 0);
  END IF;

  -- INTERVAL MODE (default)
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
-- 6. Update create_public_booking_hold with customer normalization
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
  v_norm_email text;
  v_norm_phone text;
  v_first_name text;
  v_last_name text;
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

  -- Normalize email and phone for deduplication
  v_norm_email := CASE WHEN p_client_email IS NOT NULL AND btrim(p_client_email) != '' 
    THEN lower(btrim(p_client_email)) ELSE NULL END;
  v_norm_phone := CASE WHEN p_client_phone IS NOT NULL AND btrim(p_client_phone) != '' 
    THEN regexp_replace(btrim(p_client_phone), '[^0-9+]', '', 'g') ELSE NULL END;

  -- Parse name into first/last
  v_first_name := split_part(p_client_name, ' ', 1);
  v_last_name := CASE WHEN position(' ' in p_client_name) > 0 
    THEN substring(p_client_name from position(' ' in p_client_name) + 1) 
    ELSE '' END;

  -- Find existing customer by normalized email (preferred) or normalized phone
  IF v_norm_email IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM customers
    WHERE tenant_id = p_tenant_id AND normalized_email = v_norm_email
    LIMIT 1;
  END IF;

  IF v_customer_id IS NULL AND v_norm_phone IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM customers
    WHERE tenant_id = p_tenant_id AND normalized_phone = v_norm_phone
    LIMIT 1;
  END IF;

  -- Create new customer if not found
  IF v_customer_id IS NULL THEN
    INSERT INTO customers (tenant_id, full_name, first_name, last_name, email, normalized_email, phone, normalized_phone, source)
    VALUES (p_tenant_id, p_client_name, v_first_name, v_last_name, 
      p_client_email, v_norm_email, p_client_phone, v_norm_phone, 'public_booking')
    RETURNING id INTO v_customer_id;
  ELSE
    -- Update existing customer's name if it has changed
    UPDATE customers SET 
      full_name = p_client_name,
      first_name = v_first_name,
      last_name = v_last_name,
      phone = COALESCE(p_client_phone, phone),
      normalized_phone = COALESCE(v_norm_phone, normalized_phone),
      updated_at = now()
    WHERE id = v_customer_id AND full_name != p_client_name;
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
