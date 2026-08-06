-- ============================================================
-- Phase 4.1: Authorization Hardening
-- ============================================================

-- 1. REVOKE EXECUTE on internal-only RPCs from PUBLIC, anon, authenticated
REVOKE EXECUTE ON FUNCTION public.confirm_payment_from_webhook(text,text,text,text,text,text,numeric,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_webhook_event(text,text,text,text,text,jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_webhook_processed(text,text,text,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_outbox_batch(integer,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.emit_domain_event(uuid,text,text,uuid,jsonb,uuid,uuid,uuid,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.emit_outbox_entry(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_payment_failure(text,text,text,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_checkout_session(text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_opportunity_for_reservation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_refund(uuid,numeric,text,uuid,text,text,numeric) FROM PUBLIC, anon, authenticated;

-- 2. Remove domain_events INSERT policy for authenticated
DROP POLICY IF EXISTS domain_events_insert ON domain_events;

-- 3. Remove direct table grants on sensitive tables for authenticated (keep SELECT where needed)
REVOKE INSERT, UPDATE, DELETE ON domain_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON domain_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON event_outbox FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON event_outbox FROM anon;
REVOKE INSERT, UPDATE, DELETE ON webhook_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON webhook_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON booking_access_tokens FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON booking_access_tokens FROM anon;
REVOKE INSERT, UPDATE, DELETE ON payments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON payments FROM anon;

-- 4. Lock down rate_limits: remove ALL direct access from anon and authenticated
REVOKE ALL ON rate_limits FROM anon, authenticated;

-- 5. Fix search_path on functions with mutable search_path
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_payment_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (NEW.status IS DISTINCT FROM OLD.status) THEN
      NEW.status_changed_at = now();
    END IF;
    IF (NEW.payment_status IS DISTINCT FROM OLD.payment_status) THEN
      NEW.payment_changed_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Create private storage bucket for sensitive files
INSERT INTO storage.buckets (id, name, public)
VALUES ('private-documents', 'private-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Helper: get current tenant slug for storage path scoping
CREATE OR REPLACE FUNCTION public.current_tenant_slug()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.slug FROM tenants t WHERE t.id = current_tenant_id();
$$;

-- 7. Storage policies for private-documents bucket (tenant-scoped, no public access)
CREATE POLICY "tenant_read_private_documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'private-documents'
    AND (is_super_admin() OR (storage.foldername(objects.name))[1] = public.current_tenant_slug())
  );

CREATE POLICY "tenant_upload_private_documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'private-documents'
    AND (is_super_admin() OR (storage.foldername(objects.name))[1] = public.current_tenant_slug())
  );

CREATE POLICY "tenant_update_private_documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'private-documents'
    AND (is_super_admin() OR (storage.foldername(objects.name))[1] = public.current_tenant_slug())
  )
  WITH CHECK (
    bucket_id = 'private-documents'
    AND (is_super_admin() OR (storage.foldername(objects.name))[1] = public.current_tenant_slug())
  );

CREATE POLICY "tenant_delete_private_documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'private-documents'
    AND (is_super_admin() OR (storage.foldername(objects.name))[1] = public.current_tenant_slug())
  );

-- 8. Tighten listing-photos bucket: restrict uploads/updates/deletes to tenant-scoped paths
DROP POLICY IF EXISTS auth_delete_listing_photos ON storage.objects;
DROP POLICY IF EXISTS auth_update_listing_photos ON storage.objects;
DROP POLICY IF EXISTS auth_upload_listing_photos ON storage.objects;

CREATE POLICY "tenant_upload_listing_photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'listing-photos'
    AND (is_super_admin() OR (storage.foldername(objects.name))[1] = public.current_tenant_slug())
  );

CREATE POLICY "tenant_update_listing_photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND (is_super_admin() OR (storage.foldername(objects.name))[1] = public.current_tenant_slug())
  )
  WITH CHECK (
    bucket_id = 'listing-photos'
    AND (is_super_admin() OR (storage.foldername(objects.name))[1] = public.current_tenant_slug())
  );

CREATE POLICY "tenant_delete_listing_photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND (is_super_admin() OR (storage.foldername(objects.name))[1] = public.current_tenant_slug())
  );

-- public_read_listing_photos remains as-is (public marketing images)
