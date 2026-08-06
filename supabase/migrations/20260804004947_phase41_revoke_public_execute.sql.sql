-- Phase 4.1: Revoke PUBLIC EXECUTE on non-public SECURITY DEFINER functions
-- This is the formal migration recording the changes made via execute_sql above.

-- Tenant-admin functions: revoke from PUBLIC (anon inherits), keep for authenticated
REVOKE EXECUTE ON FUNCTION public.approve_booking_request(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decline_booking_request(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_booking_access_token(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_reservation_timeline(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tenant_integration_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tenant_payment_connection(uuid) FROM PUBLIC;

-- Internal/system functions: revoke from PUBLIC and authenticated
REVOKE EXECUTE ON FUNCTION public.get_platform_integration_status(text) FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_platform_payment_status() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_holds() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_booking_checkout(uuid, uuid, text, text, text, numeric, text, text, text, numeric, jsonb) FROM PUBLIC, authenticated;

-- Re-grant to authenticated for tenant-admin functions
GRANT EXECUTE ON FUNCTION public.approve_booking_request(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_booking_request(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_access_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reservation_timeline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_integration_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_payment_connection(uuid) TO authenticated;
