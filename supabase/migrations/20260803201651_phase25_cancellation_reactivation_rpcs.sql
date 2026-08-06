/*
# Phase 2.5 — Reservation Cancellation and Reactivation RPCs

## Overview
Creates three SECURITY DEFINER functions:
1. `cancel_reservation` — Centralized cancellation service
2. `reactivate_reservation` — Centralized reactivation with availability check
3. `check_listing_availability` — Shared availability validation

## cancel_reservation(p_reservation_id, p_cancellation_reason, p_acting_user_id, p_actor_name, p_target_cancelled_stage_id)

### Behavior
1. Validates reservation exists and belongs to caller's tenant
2. If already cancelled, returns success (idempotent)
3. Sets booking_status = 'cancelled', cancelled_at = now(), cancellation_reason
4. Finds linked opportunity (if any) and moves it to a cancelled-type stage
5. If p_target_cancelled_stage_id provided, validates it belongs to same tenant
6. Otherwise finds the default pipeline's cancelled stage by stage_type = 'cancelled'
7. Logs to activity_log (reservation cancellation + opportunity stage change)
8. Returns JSONB with updated reservation and opportunity data

### Security
- SECURITY DEFINER with search_path = public
- Tenant isolation via current_tenant_id() check
- Cross-tenant rejection

## reactivate_reservation(p_reservation_id, p_target_stage_id, p_acting_user_id, p_actor_name)

### Behavior
1. Validates reservation exists, belongs to tenant, and is currently cancelled
2. Validates listing_id, start_at, end_at are present
3. Calls check_listing_availability to verify no overlap
4. If overlap found, returns error with details — reservation unchanged
5. If available: sets booking_status to 'confirmed' (or appropriate status)
6. Clears cancelled_at and cancellation_reason
7. Moves linked opportunity to p_target_stage_id (or default active stage)
8. Logs to activity_log
9. Returns JSONB with updated data

### Security
- SECURITY DEFINER with search_path = public
- Tenant isolation enforced
- Availability check prevents double booking

## check_listing_availability(p_listing_id, p_start_at, p_end_at, p_reservation_id_to_exclude, p_tenant_id)

### Behavior
1. Validates listing exists and belongs to tenant
2. Validates start < end
3. Checks for overlapping listing_blocks
4. Checks for overlapping active reservations (blocking statuses only)
5. Blocking statuses: pending (if expires_at > now), awaiting_payment (if expires_at > now), confirmed, in_progress
6. Non-blocking: inquiry, cancelled, expired, completed, no_show
7. Excludes p_reservation_id_to_exclude (for edits/reactivation)
8. Returns JSONB with available boolean and conflict details

### Concurrency Strategy
This function uses SELECT ... FOR UPDATE on the reservations being checked,
providing row-level locking within the transaction. Combined with the
application-level check, this prevents most race conditions.

For full database-level protection, a GiST exclusion constraint would be
ideal, but it requires a tstzrange column and cannot use volatile expressions
(expires_at > now()) in the index predicate. Instead, we use:
1. This RPC with FOR UPDATE locking for all reservation mutations
2. Application-level validation as a first check
3. The RPC as the authoritative server-side check

This is documented as the chosen concurrency strategy.
*/

-- ── Helper: get blocking status condition ──────────────────────────────
-- A reservation blocks availability if:
-- - booking_status IN ('confirmed', 'in_progress')
-- - booking_status = 'pending' AND expires_at > now()
-- - booking_status = 'awaiting_payment' AND expires_at > now()

-- ── check_listing_availability ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_listing_availability(
  p_listing_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_reservation_id_to_exclude uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Check overlapping active reservations with row lock
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
  FOR UPDATE;

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
$$;

-- ── cancel_reservation ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_reservation(
  p_reservation_id uuid,
  p_cancellation_reason text DEFAULT NULL,
  p_acting_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_target_cancelled_stage_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation RECORD;
  v_tenant_id uuid;
  v_opportunity RECORD;
  v_cancelled_stage RECORD;
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

  -- Idempotent: already cancelled
  IF v_reservation.booking_status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Reservation was already cancelled',
      'reservation_id', p_reservation_id
    );
  END IF;

  -- Update reservation
  UPDATE reservations
  SET booking_status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = p_cancellation_reason,
      updated_at = now()
  WHERE id = p_reservation_id;

  -- Log reservation cancellation
  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_user_id, actor_name, metadata)
  VALUES (
    v_tenant_id,
    'reservation',
    p_reservation_id,
    'cancelled',
    p_acting_user_id,
    p_actor_name,
    jsonb_build_object(
      'booking_reference', v_reservation.booking_reference,
      'cancellation_reason', p_cancellation_reason,
      'previous_status', v_reservation.booking_status
    )
  );

  -- Handle linked opportunity
  IF v_reservation.opportunity_id IS NOT NULL THEN
    SELECT * INTO v_opportunity FROM opportunities WHERE id = v_reservation.opportunity_id FOR UPDATE;
    IF FOUND AND v_opportunity.tenant_id = v_tenant_id THEN
      -- Find the cancelled stage
      IF p_target_cancelled_stage_id IS NOT NULL THEN
        SELECT * INTO v_cancelled_stage FROM pipeline_stages WHERE id = p_target_cancelled_stage_id;
        IF NOT FOUND OR v_cancelled_stage.tenant_id != v_tenant_id THEN
          v_cancelled_stage := NULL;
        END IF;
      END IF;

      IF v_cancelled_stage IS NULL THEN
        -- Find default pipeline's cancelled stage
        SELECT ps.* INTO v_cancelled_stage
        FROM pipeline_stages ps
        JOIN pipelines p ON p.id = ps.pipeline_id
        WHERE ps.tenant_id = v_tenant_id
          AND ps.stage_type = 'cancelled'
          AND ps.is_active = true
          AND ps.archived_at IS NULL
          AND p.is_default = true
        LIMIT 1;
      END IF;

      IF v_cancelled_stage IS NULL THEN
        -- Fallback: any cancelled stage in tenant
        SELECT * INTO v_cancelled_stage
        FROM pipeline_stages
        WHERE tenant_id = v_tenant_id
          AND stage_type = 'cancelled'
          AND is_active = true
          AND archived_at IS NULL
        LIMIT 1;
      END IF;

      IF v_cancelled_stage IS NOT NULL THEN
        IF v_opportunity.stage_id IS NOT NULL THEN
          SELECT name INTO v_old_stage_name FROM pipeline_stages WHERE id = v_opportunity.stage_id;
        END IF;
        v_new_stage_name := v_cancelled_stage.name;

        UPDATE opportunities
        SET stage_id = v_cancelled_stage.id,
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
            'to_stage_type', 'cancelled',
            'reason', 'reservation_cancelled',
            'reservation_id', p_reservation_id
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'booking_status', 'cancelled',
    'cancelled_at', now()
  );
END;
$$;

-- ── reactivate_reservation ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reactivate_reservation(
  p_reservation_id uuid,
  p_target_stage_id uuid DEFAULT NULL,
  p_acting_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        -- Find default pipeline's first active non-terminal stage
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
$$;

-- ── Grant execution ─────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION cancel_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION reactivate_reservation TO authenticated;
GRANT EXECUTE ON FUNCTION check_listing_availability TO authenticated;
