-- Revoke EXECUTE from PUBLIC and anon on all security-sensitive functions
REVOKE EXECUTE ON FUNCTION get_automation_metrics FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_automation_metrics FROM anon;
REVOKE EXECUTE ON FUNCTION retry_failed_step FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION retry_failed_step FROM anon;
REVOKE EXECUTE ON FUNCTION dismiss_dead_letter_step FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION dismiss_dead_letter_step FROM anon;
REVOKE EXECUTE ON FUNCTION acknowledge_failed_run FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION acknowledge_failed_run FROM anon;
REVOKE EXECUTE ON FUNCTION cron_process_workflows FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cron_process_workflows FROM anon;
REVOKE EXECUTE ON FUNCTION cron_process_workflows FROM authenticated;
REVOKE EXECUTE ON FUNCTION cron_process_outbox FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cron_process_outbox FROM anon;
REVOKE EXECUTE ON FUNCTION cron_process_outbox FROM authenticated;
REVOKE EXECUTE ON FUNCTION invoke_edge_function FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION invoke_edge_function FROM anon;
REVOKE EXECUTE ON FUNCTION invoke_edge_function FROM authenticated;
