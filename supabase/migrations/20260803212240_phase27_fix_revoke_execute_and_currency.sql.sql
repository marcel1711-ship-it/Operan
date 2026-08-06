/*
# Phase 2.7 fix — Revoke EXECUTE from anon/PUBLIC on internal RPCs + fix currency

## Problem
1. PostgreSQL grants EXECUTE to PUBLIC by default when a function is created.
   The previous migration only GRANTed to authenticated but didn't REVOKE
   from anon/PUBLIC first. So anon could still call create_manual_reservation.

2. The tenants table has no "currency" column, but create_public_booking_hold
   referenced v_tenant.currency. This caused a "column does not exist" error.

## Fix
1. Explicitly REVOKE EXECUTE from anon and PUBLIC on all internal RPCs.
2. Fix create_public_booking_hold to not reference tenants.currency.
*/

-- Revoke EXECUTE from anon and PUBLIC on all internal RPCs
REVOKE EXECUTE ON FUNCTION public.create_manual_reservation FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_manual_reservation FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.check_listing_availability FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_listing_availability FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.cancel_reservation FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_reservation FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.reactivate_reservation FROM anon;
REVOKE EXECUTE ON FUNCTION public.reactivate_reservation FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.move_opportunity_stage FROM anon;
REVOKE EXECUTE ON FUNCTION public.move_opportunity_stage FROM PUBLIC;

-- Fix create_public_booking_hold: remove reference to tenants.currency
CREATE OR REPLACE FUNCTION public.create_public_booking_hold(
  p_tenant_id uuid,
  p_listing_id uuid,
  p_client_name text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_client_email text DEFAULT NULL,
  p_client_phone text DEFAULT NULL,
  p_guest_count integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant RECORD;
  v_listing RECORD;
  v_conflict RECORD;
  v_block RECORD;
  v_reservation_id uuid;
  v_booking_reference text;
  v_total_amount numeric := 0;
  v_deposit_amount numeric := 0;
BEGIN
  -- Validate required fields
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Tenant is required');
  END IF;
  IF p_listing_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Listing is required');
  END IF;
  IF p_client_name IS NULL OR btrim(p_client_name) = '' THEN
    RETURN jsonb_build_object('error', 'Client name is required');
  END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL THEN
    RETURN jsonb_build_object('error', 'Start and end times are required');
  END IF;
  IF p_start_at >= p_end_at THEN
    RETURN jsonb_build_object('error', 'Start time must be before end time');
  END IF;

  -- Validate tenant exists and is active
  SELECT id INTO v_tenant FROM tenants WHERE id = p_tenant_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid tenant');
  END IF;

  -- Acquire advisory lock on this listing BEFORE any checks
  PERFORM pg_advisory_xact_lock(hashtext(p_listing_id::text));

  -- Validate listing belongs to tenant and is active
  SELECT * INTO v_listing FROM listings
  WHERE id = p_listing_id
    AND tenant_id = p_tenant_id
    AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Listing not available');
  END IF;

  -- Check listing blocks
  SELECT * INTO v_block
  FROM listing_blocks
  WHERE listing_id = p_listing_id
    AND tenant_id = p_tenant_id
    AND start_at < p_end_at
    AND end_at > p_start_at
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('error', 'Listing is blocked for this time period');
  END IF;

  -- Check overlapping active reservations
  SELECT * INTO v_conflict
  FROM reservations
  WHERE listing_id = p_listing_id
    AND tenant_id = p_tenant_id
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

  -- Derive financial fields from listing — NEVER accept from caller
  v_deposit_amount := COALESCE(v_listing.deposit_amount, 0);
  v_total_amount := 0;

  -- Insert the reservation with FORCED safe initial state
  INSERT INTO reservations (
    tenant_id, listing_id,
    title, client_name, client_email, client_phone,
    start_at, end_at, timezone,
    guest_count, total_amount, deposit_amount,
    currency, booking_status, payment_status,
    source, notes,
    vessel, charter_date, charter_end, monetary_value, status
  )
  VALUES (
    p_tenant_id, p_listing_id,
    COALESCE(v_listing.name, p_client_name), p_client_name, p_client_email, p_client_phone,
    p_start_at, p_end_at, COALESCE(v_listing.timezone, 'America/New_York'),
    p_guest_count, v_total_amount, v_deposit_amount,
    COALESCE(v_listing.currency, 'USD'),
    'awaiting_payment', 'unpaid',
    'public_booking', NULL,
    v_listing.name, p_start_at, p_end_at, v_total_amount, 'awaiting_payment'
  )
  RETURNING id, booking_reference INTO v_reservation_id, v_booking_reference;

  -- Log activity
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, metadata)
  VALUES (
    p_tenant_id, 'reservation', v_reservation_id, 'created',
    jsonb_build_object(
      'booking_reference', v_booking_reference,
      'client_name', p_client_name,
      'listing_name', v_listing.name,
      'source', 'public_booking'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'booking_reference', v_booking_reference
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_public_booking_hold TO anon, authenticated;
