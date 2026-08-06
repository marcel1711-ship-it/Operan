-- ============================================================
-- Phase 5.3: Direct DB-based worker invocation
-- ============================================================

CREATE OR REPLACE FUNCTION cron_process_workflows()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed int := 0;
  v_failed int := 0;
  v_dead_letter int := 0;
  v_start timestamp := clock_timestamp();
  v_duration_ms int;
BEGIN
  -- Recover stuck step runs (running > 5 min)
  UPDATE automation_step_runs
  SET status = 'pending', started_at = null
  WHERE status = 'running'
    AND started_at < now() - interval '5 minutes';

  -- Create first step for running runs that have no steps yet
  INSERT INTO automation_step_runs (tenant_id, automation_run_id, node_id, action_type, status, input, idempotency_key)
  SELECT r.tenant_id, r.id, n.node_id, n.action_type, 'pending',
    jsonb_build_object(
      'config', n.configuration,
      'tenant_id', r.tenant_id,
      'workflow_id', r.workflow_id,
      'workflow_version_id', r.workflow_version_id,
      'reservation_id', r.reservation_id,
      'customer_id', r.customer_id,
      'opportunity_id', r.opportunity_id,
      'entity_type', r.entity_type,
      'entity_id', r.entity_id,
      'payload', COALESCE(r.context->'payload', '{}'::jsonb),
      'node_id', n.node_id
    ),
    'step-' || n.node_id || '-' || r.id
  FROM automation_runs r
  JOIN automation_workflow_versions v ON v.id = r.workflow_version_id
  CROSS JOIN LATERAL jsonb_array_elements(v.definition->'nodes') AS n(node)
  CROSS JOIN LATERAL jsonb_array_elements(v.definition->'nodes') AS trig(node)
  WHERE r.status = 'running'
    AND n.node->>'action_type' != 'trigger'
    AND trig.node->>'action_type' = 'trigger'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v.definition->'edges') e
      WHERE e->>'source' = trig.node->>'node_id' AND e->>'target' = n.node->>'node_id'
    )
    AND NOT EXISTS (
      SELECT 1 FROM automation_step_runs sr WHERE sr.automation_run_id = r.id
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_processed = ROW_COUNT;

  -- Mark due scheduled steps as pending
  UPDATE automation_step_runs
  SET status = 'pending'
  WHERE status = 'scheduled'
    AND scheduled_for <= now();

  -- Log the invocation
  v_duration_ms := extract(epoch from (clock_timestamp() - v_start)) * 1000;
  
  INSERT INTO worker_health_log (
    worker_name, invoked_at, success, processed_count, failed_count, dead_letter_count, duration_ms, error_message
  ) VALUES (
    'process-workflows', now(), true, v_processed, v_failed, v_dead_letter, v_duration_ms, null
  );

  RETURN jsonb_build_object(
    'success', true,
    'runs_processed', v_processed,
    'failed', v_failed,
    'dead_letter', v_dead_letter,
    'duration_ms', v_duration_ms,
    'timestamp', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION cron_process_outbox()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamp := clock_timestamp();
  v_duration_ms int;
BEGIN
  -- Recover stuck outbox items
  UPDATE event_outbox
  SET status = 'pending', locked_at = null, locked_by = null, updated_at = now()
  WHERE status = 'processing' AND locked_at < now() - interval '5 minutes';

  -- Process outbox batch
  PERFORM process_outbox_batch(20, 'cron-' || extract(epoch from now())::text);

  v_duration_ms := extract(epoch from (clock_timestamp() - v_start)) * 1000;

  INSERT INTO worker_health_log (
    worker_name, invoked_at, success, processed_count, failed_count, dead_letter_count, duration_ms, error_message
  ) VALUES (
    'process-outbox', now(), true, 0, 0, 0, v_duration_ms, null
  );

  RETURN jsonb_build_object('success', true, 'duration_ms', v_duration_ms, 'timestamp', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION cron_process_workflows FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION cron_process_outbox FROM anon, authenticated;

-- Reschedule with DB functions
SELECT cron.unschedule('process-workflows-cron');
SELECT cron.unschedule('process-outbox-cron');

SELECT cron.schedule(
  'process-workflows-cron',
  '* * * * *',
  $$SELECT cron_process_workflows()$$
);

SELECT cron.schedule(
  'process-outbox-cron',
  '*/2 * * * *',
  $$SELECT cron_process_outbox()$$
);
