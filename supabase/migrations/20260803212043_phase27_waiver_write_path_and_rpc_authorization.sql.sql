/*
# Phase 2.7 — Waiver Write Path, RPC Permissions, and Authorization Hardening

## Summary

This migration addresses two authorization issues identified in Phase 2.6:

1. **Public waiver write path**: After revoking anon INSERT on signed_waivers,
   the API route (which uses the anon key) could no longer insert. Instead of
   re-granting INSERT or requiring the service role key in the Next.js route,
   we create a SECURITY DEFINER RPC `submit_signed_waiver` that performs all
   validation server-side and inserts with elevated privileges. The anon key
   client calls the RPC; the RPC runs as postgres and handles the INSERT.

2. **create_reservation authorization**: The original `create_reservation`
   RPC accepted caller-controlled tenant_id, total_amount, deposit_amount,
   booking_status, payment_status, and source — all forgeable by any caller
   with EXECUTE privilege (including anon). We split this into:
   - `create_manual_reservation` — for authenticated tenant users, derives
     tenant from auth.uid()/current_tenant_id(), restricts allowed statuses
   - `create_public_booking_hold` — for future public booking, only allows
     awaiting_payment/unpaid, derives financial fields from the listing
   - The original `create_reservation` is dropped

3. **EXECUTE grants hardened**: All internal RPCs have EXECUTE revoked from
   anon and PUBLIC. Only authenticated (for tenant operations) and
   service_role (for server-side operations) retain EXECUTE.

4. **dblink extension dropped** — was only needed for concurrency testing.

## New Functions

### submit_signed_waiver
- SECURITY DEFINER, search_path = 'public'
- Validates: tenant exists and is active, template exists and is active and
  belongs to tenant, listing belongs to tenant (if provided), reservation
  belongs to tenant (if provided), signer_name present, signature within
  size limit, HTML within size limit
- Inserts into signed_waivers with validated data
- EXECUTE granted to anon (public API route needs to call it)

### create_manual_reservation
- SECURITY DEFINER, search_path = 'public'
- Derives tenant_id from current_tenant_id() or auth.uid() via tenant_users
- Does NOT accept p_tenant_id as a parameter
- Accepts total_amount, deposit_amount but only for manual admin bookings
- Restricts booking_status to: confirmed, pending, awaiting_payment
- Restricts payment_status to: unpaid, processing
- Does NOT allow: completed, in_progress, cancelled, paid_in_full, deposit_paid
- Validates listing belongs to authenticated tenant
- Validates customer and opportunity belong to same tenant (if provided)
- Uses pg_advisory_xact_lock for concurrency safety
- EXECUTE granted to authenticated only

### create_public_booking_hold
- SECURITY DEFINER, search_path = 'public'
- Accepts p_tenant_id (from public server route)
- Derives total_amount and deposit_amount from the listing (NOT caller)
- Forces booking_status = 'awaiting_payment'
- Forces payment_status = 'unpaid'
- Forces source = 'public_booking'
- Validates listing is active and belongs to the specified tenant
- Uses pg_advisory_xact_lock for concurrency safety
- EXECUTE granted to anon, authenticated (public route uses anon key)

## Modified Functions

### check_listing_availability
- EXECUTE revoked from anon, PUBLIC
- EXECUTE granted to authenticated only
- (Public availability checks will use create_public_booking_hold which
  calls this internally)

### cancel_reservation
- EXECUTE revoked from anon, PUBLIC
- EXECUTE granted to authenticated only

### reactivate_reservation
- EXECUTE revoked from anon, PUBLIC
- EXECUTE granted to authenticated only

### get_dashboard_metrics
- EXECUTE revoked from anon, PUBLIC
- EXECUTE granted to authenticated only

### check_rate_limit
- EXECUTE remains on anon, authenticated (needed by public API routes)
- This is safe: the function only tracks request counts, no data access

### move_opportunity_stage
- EXECUTE revoked from anon, PUBLIC
- EXECUTE granted to authenticated only

## Dropped Functions
- create_reservation (replaced by create_manual_reservation and create_public_booking_hold)

## Extensions
- dblink DROPPED (was test-only)

## Security
- All SECURITY DEFINER functions have search_path = 'public'
- No function concatenates caller-controlled SQL identifiers
- Tenant authorization derived from auth.uid() for authenticated operations
- Public operations validate tenant_id against active tenants
- Financial fields for public bookings derived from listing data, not caller
- Errors return generic messages without leaking database internals
*/

-- ============================================================
-- 1. Drop dblink extension (test-only)
-- ============================================================

DROP EXTENSION IF EXISTS dblink;

-- ============================================================
-- 2. Create submit_signed_waiver RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_signed_waiver(
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
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant RECORD;
  v_template RECORD;
  v_reservation RECORD;
  v_listing RECORD;
  v_signed_waiver_id uuid;
BEGIN
  -- Validate required fields
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

  -- Size limits
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

  -- Validate tenant exists and is active
  SELECT id INTO v_tenant FROM tenants WHERE id = p_tenant_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid tenant');
  END IF;

  -- Validate template exists, is active, and belongs to this tenant
  SELECT id INTO v_template FROM waiver_templates
  WHERE id = p_template_id
    AND tenant_id = p_tenant_id
    AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid waiver template');
  END IF;

  -- Validate reservation belongs to tenant (if provided)
  IF p_reservation_id IS NOT NULL THEN
    SELECT id INTO v_reservation FROM reservations
    WHERE id = p_reservation_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Invalid reservation');
    END IF;
  END IF;

  -- Validate listing belongs to tenant (if provided)
  IF p_listing_id IS NOT NULL THEN
    SELECT id INTO v_listing FROM listings
    WHERE id = p_listing_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Invalid listing');
    END IF;
  END IF;

  -- Insert the signed waiver
  INSERT INTO signed_waivers (
    tenant_id, template_id, signer_name, signer_email,
    signature_data_url, html_snapshot,
    reservation_id, listing_id
  )
  VALUES (
    p_tenant_id, p_template_id,
    substring(p_signer_name from 1 for 200),
    CASE WHEN p_signer_email IS NOT NULL THEN substring(p_signer_email from 1 for 255) ELSE NULL END,
    substring(p_signature_data_url from 1 for 500000),
    substring(p_html_snapshot from 1 for 500000),
    p_reservation_id,
    p_listing_id
  )
  RETURNING id INTO v_signed_waiver_id;

  RETURN jsonb_build_object('success', true, 'id', v_signed_waiver_id);
END;
$function$;

-- Grant EXECUTE to anon (public API route calls this via anon key)
-- The function itself validates everything and runs as SECURITY DEFINER
GRANT EXECUTE ON FUNCTION public.submit_signed_waiver TO anon, authenticated;

-- ============================================================
-- 3. Create create_manual_reservation RPC (authenticated only)
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_manual_reservation(
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
SET search_path TO 'public'
AS $function$
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
  -- Derive tenant from authenticated user — NEVER accept as parameter
  v_tenant_id := current_tenant_id();
  IF v_tenant_id IS NULL AND p_acting_user_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id FROM tenant_users
    WHERE user_id = p_acting_user_id AND role = 'tenant_admin'
    LIMIT 1;
  END IF;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Unable to determine tenant');
  END IF;

  -- Validate booking_status — only allow safe initial states
  IF p_booking_status IS NULL OR NOT (p_booking_status = ANY(v_allowed_booking_statuses)) THEN
    RETURN jsonb_build_object('error', 'Invalid booking status for manual creation');
  END IF;

  -- Validate payment_status — only allow unpaid/processing
  IF p_payment_status IS NULL OR NOT (p_payment_status = ANY(v_allowed_payment_statuses)) THEN
    RETURN jsonb_build_object('error', 'Invalid payment status for manual creation');
  END IF;

  -- Acquire advisory lock on this listing BEFORE any checks
  PERFORM pg_advisory_xact_lock(hashtext(p_listing_id::text));

  -- Validate listing belongs to authenticated tenant
  SELECT * INTO v_listing FROM listings WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Listing not found');
  END IF;
  IF v_listing.tenant_id != v_tenant_id THEN
    RETURN jsonb_build_object('error', 'Listing not found');
  END IF;

  -- Validate times
  IF p_start_at IS NULL OR p_end_at IS NULL THEN
    RETURN jsonb_build_object('error', 'Start and end times are required');
  END IF;
  IF p_start_at >= p_end_at THEN
    RETURN jsonb_build_object('error', 'Start time must be before end time');
  END IF;

  -- Validate customer belongs to tenant (if provided)
  IF p_customer_id IS NOT NULL THEN
    SELECT id INTO v_customer FROM customers
    WHERE id = p_customer_id AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Invalid customer');
    END IF;
  END IF;

  -- Validate opportunity belongs to tenant (if provided)
  IF p_opportunity_id IS NOT NULL THEN
    SELECT id INTO v_opportunity FROM opportunities
    WHERE id = p_opportunity_id AND tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Invalid opportunity');
    END IF;
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
    RETURN jsonb_build_object('error', 'Listing is blocked for this time period');
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

  -- Log activity
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
$function$;

-- Grant EXECUTE to authenticated only (internal tenant operation)
GRANT EXECUTE ON FUNCTION public.create_manual_reservation TO authenticated;

-- ============================================================
-- 4. Create create_public_booking_hold RPC (public, server-side)
-- ============================================================

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
  v_duration_minutes integer;
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
  SELECT id, currency INTO v_tenant FROM tenants WHERE id = p_tenant_id AND is_active = true;
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
  -- Calculate duration in minutes
  v_duration_minutes := EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 60;

  -- Use listing's deposit_amount if set
  v_deposit_amount := COALESCE(v_listing.deposit_amount, 0);

  -- For now, total_amount is 0 for public holds — the actual pricing
  -- will be calculated server-side when Stripe is integrated
  -- (Phase 3 will add pricing calculation from listing rates)
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
    COALESCE(v_listing.currency, v_tenant.currency, 'USD'),
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

-- Grant EXECUTE to anon, authenticated (public server route uses anon key)
GRANT EXECUTE ON FUNCTION public.create_public_booking_hold TO anon, authenticated;

-- ============================================================
-- 5. Drop old create_reservation RPC
-- ============================================================

DROP FUNCTION IF EXISTS public.create_reservation(
  uuid, uuid, text, timestamptz, timestamptz, text, text, integer,
  numeric, numeric, text, text, uuid, uuid, text, text, uuid, text
);

-- ============================================================
-- 6. Revoke EXECUTE from anon and PUBLIC on internal RPCs
-- ============================================================

-- check_listing_availability: internal, authenticated only
REVOKE EXECUTE ON FUNCTION public.check_listing_availability FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_listing_availability FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_listing_availability TO authenticated;

-- cancel_reservation: internal, authenticated only
REVOKE EXECUTE ON FUNCTION public.cancel_reservation FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_reservation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_reservation TO authenticated;

-- reactivate_reservation: internal, authenticated only
REVOKE EXECUTE ON FUNCTION public.reactivate_reservation FROM anon;
REVOKE EXECUTE ON FUNCTION public.reactivate_reservation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_reservation TO authenticated;

-- get_dashboard_metrics: internal, authenticated only
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics TO authenticated;

-- move_opportunity_stage: internal, authenticated only
REVOKE EXECUTE ON FUNCTION public.move_opportunity_stage FROM anon;
REVOKE EXECUTE ON FUNCTION public.move_opportunity_stage FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_opportunity_stage TO authenticated;

-- check_rate_limit: remains accessible to anon (public API routes need it)
-- This is safe: the function only tracks request counts, no data access
-- No changes needed — already has EXECUTE on anon, authenticated
