/*
# Phase 2.6 — Concurrency-Safe Reservation Creation and Reactivation

## Summary

This migration replaces the standalone `check_listing_availability` RPC with
a new `create_reservation` RPC that performs availability checking and
reservation insertion atomically within a single transaction, using
`pg_advisory_xact_lock` on the listing_id to serialize concurrent attempts
for the same listing. It also updates `reactivate_reservation` to use the
same advisory lock pattern.

## Problem Solved

The previous `check_listing_availability` function used `SELECT ... FOR UPDATE`
on conflicting reservation rows. However, when no conflicting reservation
row exists yet (the common case for a new booking), two concurrent
transactions can both pass the availability check and both insert
overlapping reservations — a classic TOCTOU race condition.

## Solution: pg_advisory_xact_lock

`pg_advisory_xact_lock(hashtext(p_listing_id::text))` acquires a
transaction-scoped advisory lock keyed on the listing_id. This serializes
all concurrent reservation creation/reactivation attempts for the same
listing within the same transaction. The lock is automatically released on
transaction commit or rollback — no cleanup needed.

This approach:
- Works even when no existing reservation row exists (unlike FOR UPDATE)
- Is transaction-scoped (auto-released, no leak risk)
- Does not require GiST exclusion constraints (which cannot use volatile
  expressions like `expires_at > now()`)
- Serializes only per-listing, not globally (other listings are unaffected)

## Changes

1. `create_reservation` — NEW SECURITY DEFINER RPC
   - Acquires `pg_advisory_xact_lock` on listing_id
   - Validates listing belongs to tenant
   - Checks listing blocks
   - Checks overlapping active reservations (same logic as before)
   - Inserts reservation if available
   - Returns success with reservation_id and booking_reference, or conflict

2. `reactivate_reservation` — UPDATED to use advisory lock
   - Acquires `pg_advisory_xact_lock` on listing_id before availability check
   - This prevents concurrent reactivation + creation from overlapping

3. `check_listing_availability` — UPDATED to use advisory lock
   - Acquires `pg_advisory_xact_lock` for read-only availability checks
   - Ensures consistent results within a transaction

## Security
- All functions are SECURITY DEFINER with search_path = 'public'
- All functions validate tenant ownership
- No new tables or columns

## Important Notes
- The advisory lock key uses `hashtext(listing_id::text)` which maps UUIDs
  to int32 keys. Hash collisions are possible but extremely rare and
  harmless — they only cause unnecessary serialization, not data issues.
- The lock is acquired BEFORE any availability checks.
- Manual reservation creation, reactivation, and future public booking
  must all call `create_reservation` or `reactivate_reservation` — never
  check availability and insert separately.
*/

-- ============================================================
-- 1. Update check_listing_availability to use advisory lock
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_listing_availability(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_reservation_id_to_exclude uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_listing RECORD;
  v_conflict RECORD;
  v_block RECORD;
BEGIN
  -- Resolve tenant
  IF p_tenant_id IS NOT NULL THEN
    v_tenant_id := p_tenant_id;
  ELSE
    v_tenant_id := current_tenant_id();
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('available', false, 'error', 'Unable to determine tenant');
  END IF;

  -- Acquire advisory lock on this listing to serialize concurrent checks
  PERFORM pg_advisory_xact_lock(hashtext(p_listing_id::text));

  -- Validate listing
  SELECT * INTO v_listing FROM listings WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('available', false, 'error', 'Listing not found');
  END IF;

  IF v_listing.tenant_id != v_tenant_id THEN
    RETURN jsonb_build_object('available', false, 'error', 'Listing does not belong to tenant');
  END IF;

  -- Validate times
  IF p_start_at IS NULL OR p_end_at IS NULL THEN
    RETURN jsonb_build_object('available', false, 'error', 'Start and end times are required');
  END IF;

  IF p_start_at >= p_end_at THEN
    RETURN jsonb_build_object('available', false, 'error', 'Start time must be before end time');
  END IF;

  -- Check listing blocks
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

  -- Check overlapping active reservations
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
END;
$function$;


-- ============================================================
-- 2. Create create_reservation RPC (atomic check + insert)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_reservation(
  p_tenant_id uuid,
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
  p_created_by uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_listing RECORD;
  v_conflict RECORD;
  v_block RECORD;
  v_reservation_id uuid;
  v_booking_reference text;
  v_tenant_id uuid;
BEGIN
  -- Resolve tenant
  v_tenant_id := COALESCE(p_tenant_id, current_tenant_id());
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unable to determine tenant');
  END IF;

  -- Acquire advisory lock on this listing BEFORE any checks
  -- This serializes all concurrent reservation creation for the same listing
  PERFORM pg_advisory_xact_lock(hashtext(p_listing_id::text));

  -- Validate listing belongs to tenant
  SELECT * INTO v_listing FROM listings WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Listing not found');
  END IF;

  IF v_listing.tenant_id != v_tenant_id THEN
    RETURN jsonb_build_object('error', 'Listing does not belong to tenant');
  END IF;

  -- Validate times
  IF p_start_at IS NULL OR p_end_at IS NULL THEN
    RETURN jsonb_build_object('error', 'Start and end times are required');
  END IF;

  IF p_start_at >= p_end_at THEN
    RETURN jsonb_build_object('error', 'Start time must be before end time');
  END IF;

  -- Check listing blocks
  SELECT * INTO v_block
  FROM listing_blocks
  WHERE listing_id = p_listing_id
    AND tenant_id = v_tenant_id
    AND start_at < p_end_at
    AND end_at > p_start_at
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'error', 'Listing is blocked for this time period',
      'conflict_type', 'listing_block',
      'conflict_id', v_block.id
    );
  END IF;

  -- Check overlapping active reservations
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

  -- Insert the reservation
  -- booking_reference is auto-generated by the BEFORE INSERT trigger
  INSERT INTO reservations (
    tenant_id, listing_id, customer_id, opportunity_id,
    title, client_name, client_email, client_phone,
    start_at, end_at, timezone,
    guest_count, total_amount, deposit_amount,
    currency, booking_status, payment_status,
    source, notes, created_by,
    -- Legacy fields for backward compatibility
    vessel, charter_date, charter_end, monetary_value, status
  )
  VALUES (
    v_tenant_id, p_listing_id, p_customer_id, p_opportunity_id,
    COALESCE(v_listing.name, p_client_name), p_client_name, p_client_email, p_client_phone,
    p_start_at, p_end_at, COALESCE(v_listing.timezone, 'America/New_York'),
    p_guest_count, p_total_amount, p_deposit_amount,
    COALESCE(v_listing.currency, 'USD'), p_booking_status, p_payment_status,
    p_source, p_notes, p_created_by,
    -- Legacy field mapping
    v_listing.name, p_start_at, p_end_at, p_total_amount, p_booking_status
  )
  RETURNING id, booking_reference INTO v_reservation_id, v_booking_reference;

  -- Log activity
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_user_id, actor_name, metadata)
  VALUES (
    v_tenant_id,
    'reservation',
    v_reservation_id,
    'created',
    p_created_by,
    p_actor_name,
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
$function$;


-- ============================================================
-- 3. Update reactivate_reservation to use advisory lock
-- ============================================================

CREATE OR REPLACE FUNCTION public.reactivate_reservation(
  p_reservation_id uuid,
  p_target_stage_id uuid DEFAULT NULL,
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
  v_availability jsonb;
  v_opportunity RECORD;
  v_target_stage RECORD;
  v_old_stage_name text;
  v_new_stage_name text;
BEGIN
  v_tenant_id := current_tenant_id();
  IF v_tenant_id IS NULL AND p_acting_user_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM tenant_users WHERE user_id = p_acting_user_id AND role = 'tenant_admin' LIMIT 1;
  END IF;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unable to determine tenant');
  END IF;

  -- Get reservation with row lock
  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Reservation not found');
  END IF;

  IF v_reservation.tenant_id != v_tenant_id THEN
    RETURN jsonb_build_object('error', 'Cross-tenant access denied');
  END IF;

  IF v_reservation.booking_status != 'cancelled' THEN
    RETURN jsonb_build_object('error', 'Reservation is not cancelled');
  END IF;

  -- Validate required fields
  IF v_reservation.listing_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Cannot reactivate: listing_id is missing');
  END IF;
  IF v_reservation.start_at IS NULL THEN
    RETURN jsonb_build_object('error', 'Cannot reactivate: start_at is missing');
  END IF;
  IF v_reservation.end_at IS NULL THEN
    RETURN jsonb_build_object('error', 'Cannot reactivate: end_at is missing');
  END IF;

  -- Acquire advisory lock on the listing BEFORE availability check
  -- This prevents concurrent reactivation + creation from overlapping
  PERFORM pg_advisory_xact_lock(hashtext(v_reservation.listing_id::text));

  -- Check availability (excluding this reservation)
  SELECT * INTO v_availability FROM check_listing_availability(
    v_reservation.listing_id,
    v_reservation.start_at,
    v_reservation.end_at,
    p_reservation_id_to_exclude := p_reservation_id,
    p_tenant_id := v_tenant_id
  );

  IF (v_availability->>'available') != 'true' THEN
    RETURN jsonb_build_object(
      'error', 'Cannot reactivate: ' || COALESCE(v_availability->>'error', 'time slot is no longer available'),
      'availability', v_availability
    );
  END IF;

  -- Restore booking status
  UPDATE reservations
  SET booking_status = 'confirmed',
      cancelled_at = NULL,
      cancellation_reason = NULL,
      confirmed_at = COALESCE(confirmed_at, now()),
      updated_at = now()
  WHERE id = p_reservation_id;

  -- Log reactivation
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_user_id, actor_name, metadata)
  VALUES (
    v_tenant_id,
    'reservation',
    p_reservation_id,
    'reactivated',
    p_acting_user_id,
    p_actor_name,
    jsonb_build_object(
      'booking_reference', v_reservation.booking_reference,
      'previous_cancellation_reason', v_reservation.cancellation_reason
    )
  );

  -- Handle linked opportunity
  IF v_reservation.opportunity_id IS NOT NULL THEN
    SELECT * INTO v_opportunity FROM opportunities WHERE id = v_reservation.opportunity_id FOR UPDATE;
    IF FOUND AND v_opportunity.tenant_id = v_tenant_id THEN
      -- Resolve target stage
      IF p_target_stage_id IS NOT NULL THEN
        SELECT * INTO v_target_stage FROM pipeline_stages WHERE id = p_target_stage_id;
        IF NOT FOUND OR v_target_stage.tenant_id != v_tenant_id THEN
          v_target_stage := NULL;
        END IF;
      END IF;

      IF v_target_stage IS NULL THEN
        SELECT ps.* INTO v_target_stage
        FROM pipeline_stages ps
        JOIN pipelines p ON p.id = ps.pipeline_id
        WHERE ps.tenant_id = v_tenant_id
          AND ps.stage_type NOT IN ('cancelled', 'lost', 'completed')
          AND ps.is_active = true
          AND ps.archived_at IS NULL
          AND p.is_default = true
        ORDER BY ps.stage_order ASC
        LIMIT 1;
      END IF;

      IF v_target_stage IS NOT NULL THEN
        IF v_opportunity.stage_id IS NOT NULL THEN
          SELECT name INTO v_old_stage_name FROM pipeline_stages WHERE id = v_opportunity.stage_id;
        END IF;
        v_new_stage_name := v_target_stage.name;

        UPDATE opportunities
        SET stage_id = v_target_stage.id,
            last_status_change_at = now(),
            updated_at = now()
        WHERE id = v_opportunity.id;

        INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_user_id, actor_name, metadata)
        VALUES (
          v_tenant_id,
          'opportunity',
          v_opportunity.id,
          'stage_moved',
          p_acting_user_id,
          p_actor_name,
          jsonb_build_object(
            'from_stage', v_old_stage_name,
            'to_stage', v_new_stage_name,
            'to_stage_type', v_target_stage.stage_type,
            'reason', 'reservation_reactivated'
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'booking_status', 'confirmed'
  );
END;
$function$;


-- ============================================================
-- 4. Revoke anon INSERT on signed_waivers
-- ============================================================

REVOKE INSERT ON signed_waivers FROM anon;
