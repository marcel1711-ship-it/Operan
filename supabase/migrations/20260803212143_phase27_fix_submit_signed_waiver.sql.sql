/*
# Phase 2.7 fix — Remove listing_id from submit_signed_waiver

The signed_waivers table does not have a listing_id column.
The submit_signed_waiver RPC was trying to insert it, causing an error.
This migration updates the RPC to validate listing_id (if provided)
but not insert it (since the column doesn't exist).
*/

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
  -- Note: signed_waivers table does not have a listing_id column,
  -- but we still validate it to prevent cross-tenant references
  IF p_listing_id IS NOT NULL THEN
    SELECT id INTO v_listing FROM listings
    WHERE id = p_listing_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'Invalid listing');
    END IF;
  END IF;

  -- Insert the signed waiver (no listing_id column in table)
  INSERT INTO signed_waivers (
    tenant_id, template_id, signer_name, signer_email,
    signature_data_url, html_snapshot,
    reservation_id
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
$function$;

GRANT EXECUTE ON FUNCTION public.submit_signed_waiver TO anon, authenticated;
