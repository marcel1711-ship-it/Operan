/*
  Phase 5 — Booking Flow RPCs & Dependencies

  Prerequisites for the end-to-end booking flow:
    1. current_tenant_id() helper function
    2. pipeline_stages.stage_type column
    3. reservations.created_by column
    4. signed_waivers table
    5. Six RPC functions: get_public_booking_status, check_listing_availability,
       create_manual_reservation, cancel_reservation, reactivate_reservation,
       submit_signed_waiver
*/

-- ============================================================
-- 1. current_tenant_id() helper
-- ============================================================

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM tenant_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION current_tenant_id TO authenticated;

-- ============================================================
-- 2. pipeline_stages.stage_type column
-- ============================================================

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS stage_type text DEFAULT 'active';

-- ============================================================
-- 3. reservations.created_by column
-- ============================================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- 4. signed_waivers table
-- ============================================================

CREATE TABLE IF NOT EXISTS signed_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES waiver_templates(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  signer_name text NOT NULL,
  signer_email text,
  signature_data_url text NOT NULL,
  html_snapshot text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE signed_waivers ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_signed_waivers_tenant ON signed_waivers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_signed_waivers_template ON signed_waivers(template_id);
CREATE INDEX IF NOT EXISTS idx_signed_waivers_reservation ON signed_waivers(reservation_id);

DROP POLICY IF EXISTS "select_signed_waivers" ON signed_waivers;
CREATE POLICY "select_signed_waivers" ON signed_waivers FOR SELECT
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "insert_signed_waivers" ON signed_waivers;
CREATE POLICY "insert_signed_waivers" ON signed_waivers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_signed_waivers" ON signed_waivers;
CREATE POLICY "delete_signed_waivers" ON signed_waivers FOR DELETE
  TO authenticated USING (is_super_admin() OR is_tenant_member(tenant_id));

-- ============================================================
-- 5. get_public_booking_status
-- ============================================================

CREATE OR REPLACE FUNCTION get_public_booking_status(
  p_booking_reference text,
  p_access_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_token_hash text;
  v_reservation RECORD;
  v_listing RECORD;
  v_tenant RECORD;
  v_payments jsonb;
  v_labels jsonb;
  v_token_record RECORD;
BEGIN
  v_token_hash := encode(digest(p_access_token, 'sha256'), 'hex');

  SELECT * INTO v_reservation FROM reservations WHERE booking_reference = p_booking_reference;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Booking not found');
  END IF;

  SELECT * INTO v_token_record FROM booking_access_tokens
  WHERE token_hash = v_token_hash
    AND reservation_id = v_reservation.id
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired access token');
  END IF;

  SELECT name, timezone INTO v_listing FROM listings WHERE id = v_reservation.listing_id;
  SELECT name, slug, phone, email INTO v_tenant FROM tenants WHERE id = v_reservation.tenant_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'payment_type', p.payment_type,
    'amount', p.amount,
    'currency', p.currency,
    'status', p.status,
    'paid_at', p.paid_at,
    'failed_at', p.failed_at,
    'failure_reason', p.failure_reason
  )), '[]'::jsonb) INTO v_payments
  FROM payments p
  WHERE p.reservation_id = v_reservation.id
  ORDER BY p.created_at DESC;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'status_key', rsl.status_key,
    'display_label', rsl.display_label,
    'color', rsl.color
  )), '[]'::jsonb) INTO v_labels
  FROM reservation_status_labels rsl
  WHERE rsl.tenant_id = v_reservation.tenant_id
    AND rsl.is_visible_to_customer = true;

  RETURN jsonb_build_object(
    'booking_reference', v_reservation.booking_reference,
    'booking_status', v_reservation.booking_status,
    'payment_status', v_reservation.payment_status,
    'reservation_id', v_reservation.id,
    'listing_name', v_listing.name,
    'start_at', v_reservation.start_at,
    'end_at', v_reservation.end_at,
    'timezone', v_listing.timezone,
    'total_amount', v_reservation.total_amount,
    'amount_paid', v_reservation.amount_paid,
    'balance_due', v_reservation.balance_due,
    'currency', v_reservation.currency,
    'expires_at', v_reservation.expires_at,
    'confirmed_at', v_reservation.confirmed_at,
    'tenant_name', v_tenant.name,
    'tenant_phone', v_tenant.phone,
    'tenant_email', v_tenant.email,
    'payments', v_payments,
    'status_labels', v_labels
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_booking_status TO anon, authenticated;

-- ============================================================
-- 6. check_listing_availability
-- ============================================================

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
SET search_path TO public
AS $$
DECLARE
  v_tenant_id uuid;
  v_listing RECORD;
  v_conflict RECORD;
  v_block RECORD;
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
$$;

GRANT EXECUTE ON FUNCTION check_listing_availability TO authenticated;

-- ============================================================
-- 7. create_manual_reservation
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
-- 8. cancel_reservation
-- ============================================================

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
    SELECT tenant_id INTO v_tenant_id FROM tenant_users WHERE user_id = p_acting_user_id LIMIT 1;
  END IF;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unable to determine tenant');
  END IF;

  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Reservation not found');
  END IF;

  IF v_reservation.tenant_id != v_tenant_id THEN
    RETURN jsonb_build_object('error', 'Cross-tenant access denied');
  END IF;

  IF v_reservation.booking_status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Reservation was already cancelled',
      'reservation_id', p_reservation_id
    );
  END IF;

  UPDATE reservations
  SET booking_status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = p_cancellation_reason,
      updated_at = now()
  WHERE id = p_reservation_id;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_user_id, actor_name, metadata)
  VALUES (
    v_tenant_id, 'reservation', p_reservation_id, 'cancelled',
    p_acting_user_id, p_actor_name,
    jsonb_build_object(
      'booking_reference', v_reservation.booking_reference,
      'cancellation_reason', p_cancellation_reason,
      'previous_status', v_reservation.booking_status
    )
  );

  IF v_reservation.opportunity_id IS NOT NULL THEN
    SELECT * INTO v_opportunity FROM opportunities WHERE id = v_reservation.opportunity_id FOR UPDATE;
    IF FOUND AND v_opportunity.tenant_id = v_tenant_id THEN
      IF p_target_cancelled_stage_id IS NOT NULL THEN
        SELECT * INTO v_cancelled_stage FROM pipeline_stages WHERE id = p_target_cancelled_stage_id;
        IF NOT FOUND OR v_cancelled_stage.tenant_id != v_tenant_id THEN
          v_cancelled_stage := NULL;
        END IF;
      END IF;

      IF v_cancelled_stage IS NULL THEN
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
          v_tenant_id, 'opportunity', v_opportunity.id, 'stage_moved',
          p_acting_user_id, p_actor_name,
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

GRANT EXECUTE ON FUNCTION cancel_reservation TO authenticated;

-- ============================================================
-- 9. reactivate_reservation
-- ============================================================

CREATE OR REPLACE FUNCTION reactivate_reservation(
  p_reservation_id uuid,
  p_target_stage_id uuid DEFAULT NULL,
  p_acting_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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
    SELECT tenant_id INTO v_tenant_id FROM tenant_users WHERE user_id = p_acting_user_id LIMIT 1;
  END IF;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unable to determine tenant');
  END IF;

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

  IF v_reservation.listing_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Cannot reactivate: listing_id is missing');
  END IF;
  IF v_reservation.start_at IS NULL THEN
    RETURN jsonb_build_object('error', 'Cannot reactivate: start_at is missing');
  END IF;
  IF v_reservation.end_at IS NULL THEN
    RETURN jsonb_build_object('error', 'Cannot reactivate: end_at is missing');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_reservation.listing_id::text));

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

  UPDATE reservations
  SET booking_status = 'confirmed',
      cancelled_at = NULL,
      cancellation_reason = NULL,
      confirmed_at = COALESCE(confirmed_at, now()),
      updated_at = now()
  WHERE id = p_reservation_id;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_user_id, actor_name, metadata)
  VALUES (
    v_tenant_id, 'reservation', p_reservation_id, 'reactivated',
    p_acting_user_id, p_actor_name,
    jsonb_build_object(
      'booking_reference', v_reservation.booking_reference,
      'previous_cancellation_reason', v_reservation.cancellation_reason
    )
  );

  IF v_reservation.opportunity_id IS NOT NULL THEN
    SELECT * INTO v_opportunity FROM opportunities WHERE id = v_reservation.opportunity_id FOR UPDATE;
    IF FOUND AND v_opportunity.tenant_id = v_tenant_id THEN
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
          v_tenant_id, 'opportunity', v_opportunity.id, 'stage_moved',
          p_acting_user_id, p_actor_name,
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

GRANT EXECUTE ON FUNCTION reactivate_reservation TO authenticated;

-- ============================================================
-- 10. submit_signed_waiver
-- ============================================================

CREATE OR REPLACE FUNCTION submit_signed_waiver(
  p_tenant_id uuid,
  p_template_id uuid,
  p_signer_name text,
  p_signature_data_url text,
  p_html_snapshot text,
  p_signer_email text DEFAULT NULL,
  p_reservation_id uuid DEFAULT NULL,
  p_listing_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_tenant RECORD;
  v_template RECORD;
  v_reservation RECORD;
  v_listing RECORD;
  v_signed_waiver_id uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Tenant is required');
  END IF;
  IF p_template_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Waiver template is required');
  END IF;
  IF p_signer_name IS NULL OR btrim(p_signer_name) = '' THEN
    RETURN jsonb_build_object('error', 'Signer name is required');
  END IF;
  IF p_signature_data_url IS NULL OR p_signature_data_url = '' THEN
    RETURN jsonb_build_object('error', 'Signature is required');
  END IF;
  IF p_html_snapshot IS NULL OR p_html_snapshot = '' THEN
    RETURN jsonb_build_object('error', 'Document content is required');
  END IF;

  IF length(p_signature_data_url) > 500000 THEN
    RETURN jsonb_build_object('error', 'Signature is too large');
  END IF;
  IF length(p_html_snapshot) > 500000 THEN
    RETURN jsonb_build_object('error', 'Document is too large');
  END IF;
  IF length(p_signer_name) > 200 THEN
    RETURN jsonb_build_object('error', 'Signer name is too long');
  END IF;
  IF p_signer_email IS NOT NULL AND length(p_signer_email) > 255 THEN
    RETURN jsonb_build_object('error', 'Email is too long');
  END IF;

  SELECT id INTO v_tenant FROM tenants WHERE id = p_tenant_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid tenant');
  END IF;

  SELECT id INTO v_template FROM waiver_templates
  WHERE id = p_template_id AND tenant_id = p_tenant_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid waiver template');
  END IF;

  IF p_reservation_id IS NOT NULL THEN
    SELECT id INTO v_reservation FROM reservations
    WHERE id = p_reservation_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Invalid reservation');
    END IF;
  END IF;

  IF p_listing_id IS NOT NULL THEN
    SELECT id INTO v_listing FROM listings
    WHERE id = p_listing_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Invalid listing');
    END IF;
  END IF;

  INSERT INTO signed_waivers (
    tenant_id, template_id, signer_name, signer_email,
    signature_data_url, html_snapshot, reservation_id
  )
  VALUES (
    p_tenant_id, p_template_id,
    substring(p_signer_name from 1 for 200),
    CASE WHEN p_signer_email IS NOT NULL THEN substring(p_signer_email from 1 for 255) ELSE NULL END,
    substring(p_signature_data_url from 1 for 500000),
    substring(p_html_snapshot from 1 for 500000),
    p_reservation_id
  )
  RETURNING id INTO v_signed_waiver_id;

  RETURN jsonb_build_object('success', true, 'id', v_signed_waiver_id);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_signed_waiver TO anon, authenticated;

-- ============================================================
-- Reload PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';
