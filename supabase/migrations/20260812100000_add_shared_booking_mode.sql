/*
  Add shared booking mode to listings.

  booking_mode: 'private' (default) blocks the entire slot per booking.
                'shared' allows multiple bookings per slot up to capacity.

  Updates availability and booking RPCs to sum guest_count for shared listings
  instead of binary overlap detection.
*/

-- ============================================================
-- 1. Add booking_mode column to listings
-- ============================================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS booking_mode text NOT NULL DEFAULT 'private';

-- ============================================================
-- 2. Replace get_public_availability to support shared mode
-- ============================================================

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
  v_booking_mode text;
  v_capacity int;
  rec record;
BEGIN
  v_date := p_date::date;
  v_day_of_week := extract(isodow from v_date)::int;

  SELECT l.id, l.tenant_id, l.timezone,
         coalesce(l.buffer_before_minutes, 0),
         coalesce(l.buffer_after_minutes, 0),
         coalesce(l.minimum_notice_hours, 0),
         coalesce(l.maximum_advance_days, 365),
         coalesce(l.slot_interval_minutes, 30),
         coalesce(l.booking_mode, 'private'),
         coalesce(l.capacity, 1)
  INTO v_listing_id, v_tenant_id, v_timezone,
       v_buffer_before, v_buffer_after,
       v_minimum_notice_hours, v_maximum_advance_days, v_slot_interval,
       v_booking_mode, v_capacity
  FROM listings l
  JOIN tenants t ON t.id = l.tenant_id
  WHERE t.slug = p_tenant_slug
    AND l.slug = p_listing_slug
    AND l.is_active = true
    AND l.online_booking_enabled = true;

  IF v_listing_id IS NULL THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'error', 'Listing not found or not available for online booking');
  END IF;

  IF v_date < current_date THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'error', 'Date is in the past');
  END IF;

  IF v_date > current_date + (v_maximum_advance_days || ' days')::interval THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'error', 'Date is too far in advance');
  END IF;

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
        v_booked_guests int;
        v_remaining_seats int;
      BEGIN
        v_slot_start := (v_date || ' ' || rec.start_time)::timestamp AT TIME ZONE coalesce(v_timezone, 'America/New_York');
        v_slot_end := v_slot_start + (v_duration_minutes || ' minutes')::interval;

        IF v_slot_start < now() + (v_minimum_notice_hours || ' hours')::interval THEN
          CONTINUE;
        END IF;

        SELECT EXISTS (
          SELECT 1 FROM listing_blocks lb
          WHERE lb.listing_id = v_listing_id
            AND lb.start_at < v_slot_end + (v_buffer_after || ' minutes')::interval
            AND lb.end_at > v_slot_start - (v_buffer_before || ' minutes')::interval
        ) INTO v_is_blocked;

        IF v_is_blocked THEN CONTINUE; END IF;

        IF v_booking_mode = 'shared' THEN
          -- Sum booked guests for this slot
          SELECT coalesce(sum(coalesce(r.guest_count, 1)), 0)
          INTO v_booked_guests
          FROM reservations r
          WHERE r.listing_id = v_listing_id
            AND r.booking_status NOT IN ('cancelled', 'expired', 'no_show')
            AND r.start_at = v_slot_start
            AND r.end_at = v_slot_end;

          v_remaining_seats := v_capacity - v_booked_guests;

          IF v_remaining_seats > 0 THEN
            v_slots := v_slots || jsonb_build_object(
              'start', to_char(v_slot_start AT TIME ZONE coalesce(v_timezone, 'America/New_York'), 'HH24:MI'),
              'start_utc', to_char(v_slot_start, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'end', to_char(v_slot_end AT TIME ZONE coalesce(v_timezone, 'America/New_York'), 'HH24:MI'),
              'end_utc', to_char(v_slot_end, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
              'remaining_seats', v_remaining_seats,
              'total_capacity', v_capacity
            );
          END IF;
        ELSE
          -- Private mode: binary check
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
        v_booked_guests int;
        v_remaining_seats int;
      BEGIN
        v_cursor := rec.start_time;
        v_oh_end := rec.end_time;

        IF v_start_restriction IS NOT NULL AND v_cursor < v_start_restriction THEN
          v_cursor := v_start_restriction;
        END IF;

        WHILE v_cursor + (v_duration_minutes || ' minutes')::interval <= v_oh_end LOOP
          v_slot_start := (v_date || ' ' || v_cursor)::timestamp AT TIME ZONE coalesce(v_timezone, 'America/New_York');
          v_slot_end := v_slot_start + (v_duration_minutes || ' minutes')::interval;

          IF v_end_restriction IS NOT NULL AND v_cursor > v_end_restriction THEN
            EXIT;
          END IF;

          IF v_slot_start < now() + (v_minimum_notice_hours || ' hours')::interval THEN
            v_cursor := v_cursor + (v_slot_interval || ' minutes')::interval;
            CONTINUE;
          END IF;

          SELECT EXISTS (
            SELECT 1 FROM listing_blocks lb
            WHERE lb.listing_id = v_listing_id
              AND lb.start_at < v_slot_end + (v_buffer_after || ' minutes')::interval
              AND lb.end_at > v_slot_start - (v_buffer_before || ' minutes')::interval
          ) INTO v_is_blocked;

          IF NOT v_is_blocked THEN
            IF v_booking_mode = 'shared' THEN
              SELECT coalesce(sum(coalesce(r.guest_count, 1)), 0)
              INTO v_booked_guests
              FROM reservations r
              WHERE r.listing_id = v_listing_id
                AND r.booking_status NOT IN ('cancelled', 'expired', 'no_show')
                AND r.start_at = v_slot_start
                AND r.end_at = v_slot_end;

              v_remaining_seats := v_capacity - v_booked_guests;

              IF v_remaining_seats > 0 THEN
                v_slots := v_slots || jsonb_build_object(
                  'start', to_char(v_slot_start AT TIME ZONE coalesce(v_timezone, 'America/New_York'), 'HH24:MI'),
                  'start_utc', to_char(v_slot_start, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                  'end', to_char(v_slot_end AT TIME ZONE coalesce(v_timezone, 'America/New_York'), 'HH24:MI'),
                  'end_utc', to_char(v_slot_end, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                  'remaining_seats', v_remaining_seats,
                  'total_capacity', v_capacity
                );
              END IF;
            ELSE
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
          END IF;

          v_cursor := v_cursor + (v_slot_interval || ' minutes')::interval;
        END LOOP;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'slots', v_slots,
    'booking_mode', v_booking_mode,
    'capacity', v_capacity
  );
END;
$$;

-- ============================================================
-- 3. Replace check_listing_availability for shared mode
-- ============================================================

DROP FUNCTION IF EXISTS check_listing_availability(uuid, timestamptz, timestamptz, uuid, uuid);

CREATE OR REPLACE FUNCTION check_listing_availability(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_reservation_id_to_exclude uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_guest_count int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant_id uuid;
  v_listing RECORD;
  v_conflict RECORD;
  v_block RECORD;
  v_booked_guests int;
  v_remaining int;
BEGIN
  IF p_tenant_id IS NOT NULL THEN
    v_tenant_id := p_tenant_id;
  ELSE
    v_tenant_id := current_tenant_id();
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('available', false, 'error', 'Unable to determine tenant');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_listing_id::text));

  SELECT * INTO v_listing FROM listings WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('available', false, 'error', 'Listing not found');
  END IF;

  IF v_listing.tenant_id != v_tenant_id THEN
    RETURN jsonb_build_object('available', false, 'error', 'Listing does not belong to tenant');
  END IF;

  IF p_start_at IS NULL OR p_end_at IS NULL THEN
    RETURN jsonb_build_object('available', false, 'error', 'Start and end times are required');
  END IF;

  IF p_start_at >= p_end_at THEN
    RETURN jsonb_build_object('available', false, 'error', 'Start time must be before end time');
  END IF;

  -- Check blocks
  SELECT * INTO v_block
  FROM listing_blocks
  WHERE listing_id = p_listing_id
    AND tenant_id = v_tenant_id
    AND start_at < p_end_at
    AND end_at > p_start_at
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'error', 'Listing is blocked for this time period',
      'conflict_type', 'listing_block',
      'conflict_id', v_block.id
    );
  END IF;

  IF coalesce(v_listing.booking_mode, 'private') = 'shared' THEN
    -- Shared mode: sum guests and check capacity
    SELECT coalesce(sum(coalesce(r.guest_count, 1)), 0)
    INTO v_booked_guests
    FROM reservations r
    WHERE r.listing_id = p_listing_id
      AND r.tenant_id = v_tenant_id
      AND (p_reservation_id_to_exclude IS NULL OR r.id != p_reservation_id_to_exclude)
      AND r.start_at = p_start_at
      AND r.end_at = p_end_at
      AND (
        r.booking_status IN ('confirmed', 'in_progress')
        OR (
          r.booking_status IN ('pending', 'awaiting_payment')
          AND r.expires_at IS NOT NULL
          AND r.expires_at > now()
        )
      );

    v_remaining := coalesce(v_listing.capacity, 1) - v_booked_guests;

    IF p_guest_count > v_remaining THEN
      RETURN jsonb_build_object(
        'available', false,
        'error', CASE WHEN v_remaining <= 0
          THEN 'This departure is fully booked'
          ELSE 'Only ' || v_remaining || ' seats remaining for this departure'
        END,
        'remaining_seats', greatest(v_remaining, 0),
        'total_capacity', coalesce(v_listing.capacity, 1)
      );
    END IF;

    RETURN jsonb_build_object(
      'available', true,
      'remaining_seats', v_remaining - p_guest_count,
      'total_capacity', coalesce(v_listing.capacity, 1)
    );
  ELSE
    -- Private mode: binary overlap check (original behavior)
    SELECT * INTO v_conflict
    FROM reservations
    WHERE listing_id = p_listing_id
      AND tenant_id = v_tenant_id
      AND (p_reservation_id_to_exclude IS NULL OR id != p_reservation_id_to_exclude)
      AND start_at IS NOT NULL
      AND end_at IS NOT NULL
      AND start_at < p_end_at
      AND end_at > p_start_at
      AND (
        booking_status IN ('confirmed', 'in_progress')
        OR (
          booking_status IN ('pending', 'awaiting_payment')
          AND expires_at IS NOT NULL
          AND expires_at > now()
        )
      )
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'available', false,
        'error', 'Time slot conflicts with an existing reservation',
        'conflict_type', 'reservation',
        'conflict_id', v_conflict.id,
        'conflict_reference', v_conflict.booking_reference
      );
    END IF;

    RETURN jsonb_build_object('available', true);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION check_listing_availability TO authenticated;

-- ============================================================
-- 4. Replace create_public_booking_hold for shared capacity
-- ============================================================

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
  v_booked_guests int;
  v_remaining int;
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

  -- Validate guest count against capacity
  IF p_guest_count > coalesce(v_listing.capacity, 999) THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'Guest count exceeds listing capacity');
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

  -- Acquire advisory lock for concurrency safety
  PERFORM pg_advisory_xact_lock(hashtext(p_listing_id::text));

  -- Check blocks
  IF EXISTS (
    SELECT 1 FROM listing_blocks lb
    WHERE lb.listing_id = p_listing_id
      AND lb.start_at < v_end_at
      AND lb.end_at > p_start_at
  ) THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'This time slot is blocked');
  END IF;

  -- Check availability based on booking mode
  IF coalesce(v_listing.booking_mode, 'private') = 'shared' THEN
    -- Shared mode: check remaining capacity
    SELECT coalesce(sum(coalesce(r.guest_count, 1)), 0)
    INTO v_booked_guests
    FROM reservations r
    WHERE r.listing_id = p_listing_id
      AND r.booking_status NOT IN ('cancelled', 'expired', 'no_show')
      AND r.start_at = p_start_at
      AND r.end_at = v_end_at;

    v_remaining := coalesce(v_listing.capacity, 1) - v_booked_guests;

    IF p_guest_count > v_remaining THEN
      RETURN jsonb_build_object(
        'status', 'error',
        'error', CASE WHEN v_remaining <= 0
          THEN 'This departure is fully booked'
          ELSE 'Only ' || v_remaining || ' seats remaining'
        END
      );
    END IF;
  ELSE
    -- Private mode: binary overlap check
    IF EXISTS (
      SELECT 1 FROM reservations r
      WHERE r.listing_id = p_listing_id
        AND r.booking_status NOT IN ('cancelled', 'expired', 'no_show')
        AND r.start_at < v_end_at
        AND r.end_at > p_start_at
    ) THEN
      RETURN jsonb_build_object('status', 'error', 'error', 'This time slot is no longer available');
    END IF;
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

-- ============================================================
-- 5. Replace create_manual_reservation for shared capacity
-- ============================================================

CREATE OR REPLACE FUNCTION create_manual_reservation(
  p_listing_id uuid,
  p_client_name text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_client_email text DEFAULT NULL,
  p_client_phone text DEFAULT NULL,
  p_guest_count integer DEFAULT NULL,
  p_total_amount numeric DEFAULT 0,
  p_deposit_amount numeric DEFAULT 0,
  p_source text DEFAULT 'manual',
  p_notes text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_opportunity_id uuid DEFAULT NULL,
  p_booking_status text DEFAULT 'confirmed',
  p_payment_status text DEFAULT 'unpaid',
  p_acting_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant_id uuid;
  v_listing RECORD;
  v_conflict RECORD;
  v_block RECORD;
  v_reservation_id uuid;
  v_booking_reference text;
  v_customer RECORD;
  v_opportunity RECORD;
  v_allowed_booking_statuses text[] := ARRAY['confirmed', 'pending', 'awaiting_payment'];
  v_allowed_payment_statuses text[] := ARRAY['unpaid', 'processing'];
  v_booked_guests int;
  v_remaining int;
BEGIN
  v_tenant_id := current_tenant_id();
  IF v_tenant_id IS NULL AND p_acting_user_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM tenant_users
    WHERE user_id = p_acting_user_id AND role = 'tenant_admin'
    LIMIT 1;
  END IF;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unable to determine tenant');
  END IF;

  IF p_booking_status IS NULL OR NOT (p_booking_status = ANY(v_allowed_booking_statuses)) THEN
    RETURN jsonb_build_object('error', 'Invalid booking status for manual creation');
  END IF;

  IF p_payment_status IS NULL OR NOT (p_payment_status = ANY(v_allowed_payment_statuses)) THEN
    RETURN jsonb_build_object('error', 'Invalid payment status for manual creation');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_listing_id::text));

  SELECT * INTO v_listing FROM listings WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Listing not found');
  END IF;
  IF v_listing.tenant_id != v_tenant_id THEN
    RETURN jsonb_build_object('error', 'Listing not found');
  END IF;

  IF p_start_at IS NULL OR p_end_at IS NULL THEN
    RETURN jsonb_build_object('error', 'Start and end times are required');
  END IF;
  IF p_start_at >= p_end_at THEN
    RETURN jsonb_build_object('error', 'Start time must be before end time');
  END IF;

  IF p_customer_id IS NOT NULL THEN
    SELECT id INTO v_customer FROM customers
    WHERE id = p_customer_id AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Invalid customer');
    END IF;
  END IF;

  IF p_opportunity_id IS NOT NULL THEN
    SELECT id INTO v_opportunity FROM opportunities
    WHERE id = p_opportunity_id AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Invalid opportunity');
    END IF;
  END IF;

  -- Check blocks
  SELECT * INTO v_block
  FROM listing_blocks
  WHERE listing_id = p_listing_id
    AND tenant_id = v_tenant_id
    AND start_at < p_end_at
    AND end_at > p_start_at
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('error', 'Listing is blocked for this time period');
  END IF;

  -- Check availability based on booking mode
  IF coalesce(v_listing.booking_mode, 'private') = 'shared' THEN
    SELECT coalesce(sum(coalesce(r.guest_count, 1)), 0)
    INTO v_booked_guests
    FROM reservations r
    WHERE r.listing_id = p_listing_id
      AND r.tenant_id = v_tenant_id
      AND r.start_at = p_start_at
      AND r.end_at = p_end_at
      AND (
        r.booking_status IN ('confirmed', 'in_progress')
        OR (
          r.booking_status IN ('pending', 'awaiting_payment')
          AND r.expires_at IS NOT NULL
          AND r.expires_at > now()
        )
      );

    v_remaining := coalesce(v_listing.capacity, 1) - v_booked_guests;

    IF coalesce(p_guest_count, 1) > v_remaining THEN
      RETURN jsonb_build_object(
        'error', CASE WHEN v_remaining <= 0
          THEN 'This departure is fully booked'
          ELSE 'Only ' || v_remaining || ' seats remaining for this departure'
        END,
        'remaining_seats', greatest(v_remaining, 0)
      );
    END IF;
  ELSE
    SELECT * INTO v_conflict
    FROM reservations
    WHERE listing_id = p_listing_id
      AND tenant_id = v_tenant_id
      AND start_at IS NOT NULL
      AND end_at IS NOT NULL
      AND start_at < p_end_at
      AND end_at > p_start_at
      AND (
        booking_status IN ('confirmed', 'in_progress')
        OR (
          booking_status IN ('pending', 'awaiting_payment')
          AND expires_at IS NOT NULL
          AND expires_at > now()
        )
      )
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'error', 'Time slot conflicts with an existing reservation',
        'conflict_type', 'reservation',
        'conflict_id', v_conflict.id,
        'conflict_reference', v_conflict.booking_reference
      );
    END IF;
  END IF;

  INSERT INTO reservations (
    tenant_id, listing_id, customer_id, opportunity_id,
    title, client_name, client_email, client_phone,
    start_at, end_at, timezone,
    guest_count, total_amount, deposit_amount,
    currency, booking_status, payment_status,
    source, notes, created_by,
    vessel, charter_date, charter_end, monetary_value, status
  )
  VALUES (
    v_tenant_id, p_listing_id, p_customer_id, p_opportunity_id,
    COALESCE(v_listing.name, p_client_name), p_client_name, p_client_email, p_client_phone,
    p_start_at, p_end_at, COALESCE(v_listing.timezone, 'America/New_York'),
    p_guest_count, p_total_amount, p_deposit_amount,
    COALESCE(v_listing.currency, 'USD'), p_booking_status, p_payment_status,
    p_source, p_notes, p_acting_user_id,
    v_listing.name, p_start_at, p_end_at, p_total_amount, p_booking_status
  )
  RETURNING id, booking_reference INTO v_reservation_id, v_booking_reference;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_user_id, actor_name, metadata)
  VALUES (
    v_tenant_id, 'reservation', v_reservation_id, 'created',
    p_acting_user_id, p_actor_name,
    jsonb_build_object(
      'booking_reference', v_booking_reference,
      'client_name', p_client_name,
      'listing_name', v_listing.name,
      'source', p_source
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'booking_reference', v_booking_reference
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_manual_reservation TO authenticated;

-- ============================================================
-- 6. Helper RPC: get_departure_manifest
-- ============================================================

CREATE OR REPLACE FUNCTION get_departure_manifest(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant_id uuid;
  v_listing record;
  v_passengers jsonb;
  v_total_guests int;
BEGIN
  v_tenant_id := current_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unable to determine tenant');
  END IF;

  SELECT id, name, capacity, booking_mode
  INTO v_listing
  FROM listings
  WHERE id = p_listing_id AND tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Listing not found');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'reservation_id', r.id,
    'booking_reference', r.booking_reference,
    'client_name', r.client_name,
    'client_email', r.client_email,
    'client_phone', r.client_phone,
    'guest_count', coalesce(r.guest_count, 1),
    'booking_status', r.booking_status,
    'payment_status', r.payment_status,
    'total_amount', r.total_amount,
    'notes', r.notes
  ) ORDER BY r.created_at),
  coalesce(sum(coalesce(r.guest_count, 1)), 0)
  INTO v_passengers, v_total_guests
  FROM reservations r
  WHERE r.listing_id = p_listing_id
    AND r.tenant_id = v_tenant_id
    AND r.start_at = p_start_at
    AND r.end_at = p_end_at
    AND r.booking_status NOT IN ('cancelled', 'expired', 'no_show');

  RETURN jsonb_build_object(
    'listing_name', v_listing.name,
    'capacity', coalesce(v_listing.capacity, 0),
    'total_guests', coalesce(v_total_guests, 0),
    'remaining_seats', coalesce(v_listing.capacity, 0) - coalesce(v_total_guests, 0),
    'passengers', coalesce(v_passengers, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_departure_manifest TO authenticated;
