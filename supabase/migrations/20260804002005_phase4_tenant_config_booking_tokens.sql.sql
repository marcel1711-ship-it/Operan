-- ============================================================
-- Phase 4 Migration 3: Tenant Opportunity Config + Booking Access Tokens
-- ============================================================

-- 1. Add opportunity config columns to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS create_opportunity_on_booking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS confirmed_booking_stage_id uuid,
  ADD COLUMN IF NOT EXISTS request_stage_id uuid,
  ADD COLUMN IF NOT EXISTS cancelled_stage_id uuid,
  ADD COLUMN IF NOT EXISTS completed_stage_id uuid;

-- FK constraints for stage IDs (self-referencing within tenant scope)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_confirmed_booking_stage_fkey') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_confirmed_booking_stage_fkey
      FOREIGN KEY (confirmed_booking_stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_request_stage_fkey') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_request_stage_fkey
      FOREIGN KEY (request_stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_cancelled_stage_fkey') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_cancelled_stage_fkey
      FOREIGN KEY (cancelled_stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_completed_stage_fkey') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_completed_stage_fkey
      FOREIGN KEY (completed_stage_id) REFERENCES pipeline_stages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Booking Access Tokens (secure public payment result pages)
CREATE TABLE IF NOT EXISTS booking_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  booking_reference text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE booking_access_tokens ENABLE ROW LEVEL SECURITY;

-- No direct access for authenticated or anon — only via SECURITY DEFINER
CREATE POLICY "booking_tokens_super_admin_select" ON booking_access_tokens FOR SELECT
  TO authenticated USING (is_super_admin());

-- Unique token hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_tokens_hash
  ON booking_access_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_booking_tokens_reservation
  ON booking_access_tokens (reservation_id);

CREATE INDEX IF NOT EXISTS idx_booking_tokens_reference
  ON booking_access_tokens (booking_reference);

-- 3. Helper: create_booking_access_token — SECURITY DEFINER
CREATE OR REPLACE FUNCTION create_booking_access_token(
  p_reservation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_reservation RECORD;
  v_token text;
  v_token_hash text;
  v_expires_at timestamptz;
BEGIN
  SELECT * INTO v_reservation FROM reservations WHERE id = p_reservation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Reservation not found');
  END IF;

  -- Token expires when the hold expires, or 24 hours from now if no hold
  v_expires_at := COALESCE(v_reservation.expires_at, now() + interval '24 hours');

  -- Generate a random token
  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  INSERT INTO booking_access_tokens (token_hash, reservation_id, tenant_id, booking_reference, expires_at)
  VALUES (v_token_hash, p_reservation_id, v_reservation.tenant_id, v_reservation.booking_reference, v_expires_at);

  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires_at);
END;
$$;

GRANT EXECUTE ON FUNCTION create_booking_access_token TO authenticated;

-- 4. Helper: get_public_booking_status — SECURITY DEFINER for safe public reads
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
BEGIN
  v_token_hash := encode(digest(p_access_token, 'sha256'), 'hex');

  SELECT * INTO v_reservation FROM reservations WHERE booking_reference = p_booking_reference;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Booking not found');
  END IF;

  -- Validate token
  SELECT * INTO v_tenant FROM booking_access_tokens
  WHERE token_hash = v_token_hash
    AND reservation_id = v_reservation.id
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired access token');
  END IF;

  SELECT name, timezone INTO v_listing FROM listings WHERE id = v_reservation.listing_id;
  SELECT name, slug, phone, email INTO v_tenant FROM tenants WHERE id = v_reservation.tenant_id;

  -- Get payments (safe summary only)
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

  -- Get customer-facing status labels
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

GRANT EXECUTE ON FUNCTION get_public_booking_status TO anon;
GRANT EXECUTE ON FUNCTION get_public_booking_status TO authenticated;

-- 5. Revoke anon on booking_access_tokens
REVOKE ALL ON booking_access_tokens FROM anon;
