/*
# Phase 3 fix — Use full_name instead of name for customers table

The create_public_booking_hold RPC was inserting into customers.name
but the customers table uses full_name, first_name, last_name.
This migration updates the RPC to use the correct column.
*/

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

  -- Find or create customer (using full_name, not name)
  SELECT id INTO v_customer_id FROM customers
  WHERE tenant_id = p_tenant_id
    AND (email = p_client_email OR (p_client_email IS NULL AND phone = p_client_phone))
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO customers (tenant_id, full_name, email, phone)
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
