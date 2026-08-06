-- ============================================================
-- Phase 4 Migration 5: Final indexes + grants cleanup
-- ============================================================

-- Additional indexes for payment webhook lookups
CREATE INDEX IF NOT EXISTS idx_payments_reservation_status
  ON payments (reservation_id, status);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_status_created
  ON payments (tenant_id, status, created_at DESC);

-- Index for webhook events by reservation
CREATE INDEX IF NOT EXISTS idx_webhook_events_reservation
  ON webhook_events (reservation_id)
  WHERE reservation_id IS NOT NULL;

-- Index for webhook events by payment
CREATE INDEX IF NOT EXISTS idx_webhook_events_payment
  ON webhook_events (payment_id)
  WHERE payment_id IS NOT NULL;

-- Revoke any remaining EXECUTE on sensitive functions from anon
REVOKE EXECUTE ON FUNCTION create_booking_checkout FROM anon;
REVOKE EXECUTE ON FUNCTION confirm_payment_from_webhook FROM anon;
REVOKE EXECUTE ON FUNCTION record_payment_failure FROM anon;
REVOKE EXECUTE ON FUNCTION expire_checkout_session FROM anon;
REVOKE EXECUTE ON FUNCTION process_refund FROM anon;
REVOKE EXECUTE ON FUNCTION sync_opportunity_for_reservation FROM anon;
REVOKE EXECUTE ON FUNCTION process_outbox_batch FROM anon;
REVOKE EXECUTE ON FUNCTION record_webhook_event FROM anon;
REVOKE EXECUTE ON FUNCTION mark_webhook_processed FROM anon;
REVOKE EXECUTE ON FUNCTION get_reservation_timeline FROM anon;
REVOKE EXECUTE ON FUNCTION emit_domain_event FROM anon;
REVOKE EXECUTE ON FUNCTION emit_outbox_entry FROM anon;
REVOKE EXECUTE ON FUNCTION create_booking_access_token FROM anon;

-- Keep get_public_booking_status available to anon (for public payment result pages)
-- Already granted in migration 3

-- Ensure authenticated can still read reservations, payments (SELECT only)
-- and call timeline function
GRANT SELECT ON payments TO authenticated;
GRANT SELECT ON domain_events TO authenticated;
GRANT SELECT ON webhook_events TO authenticated;

-- Ensure authenticated can INSERT into notifications (for outbox processor)
GRANT INSERT ON notifications TO authenticated;
GRANT INSERT ON activity_log TO authenticated;
GRANT INSERT ON opportunities TO authenticated;
