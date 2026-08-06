-- Phase 4.1: Revoke anon EXECUTE on functions that should not be public

-- Tenant-admin only (should require authentication)
REVOKE EXECUTE ON FUNCTION public.approve_booking_request(uuid,uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decline_booking_request(uuid,uuid,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_booking_access_token(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_reservation_timeline(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tenant_integration_status(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tenant_payment_connection(uuid) FROM anon;

-- Super admin only
REVOKE EXECUTE ON FUNCTION public.get_platform_integration_status(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_payment_status() FROM anon, authenticated;

-- Internal/cron only (should not be callable by anon or authenticated)
REVOKE EXECUTE ON FUNCTION public.expire_stale_holds() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_booking_checkout(uuid,uuid,text,text,text,numeric,text,text,text,numeric,jsonb) FROM anon, authenticated;

-- Note: These remain anon-executable (intentionally public):
-- check_rate_limit, create_public_booking_hold, get_public_availability,
-- get_public_booking_status, calculate_booking_price, submit_signed_waiver,
-- generate_booking_reference, current_tenant_id, current_tenant_slug, is_super_admin
