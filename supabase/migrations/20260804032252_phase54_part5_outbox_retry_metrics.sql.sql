-- ============================================================
-- Phase 5.4 Part 5: cron_process_outbox, retry RPCs, metrics, cron reschedule
-- ============================================================

-- cron_process_outbox — sole outbox owner
CREATE OR REPLACE FUNCTION cron_process_outbox()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamp := clock_timestamp();
  v_duration_ms int;
  v_invocation_id text := 'inv-' || extract(epoch from now())::int::text || '-' || md5(random()::text);
  v_result jsonb;
  v_processed int := 0;
  v_failed int := 0;
BEGIN
  UPDATE event_outbox
  SET status = 'pending', locked_at = null, locked_by = null, updated_at = now()
  WHERE status = 'processing' AND locked_at < now() - interval '5 minutes';

  SELECT process_outbox_batch(20, 'cron-' || v_invocation_id) INTO v_result;
  v_processed := COALESCE((v_result->>'processed')::int, 0);
  v_failed := COALESCE((v_result->>'failed')::int, 0);

  INSERT INTO notifications (tenant_id, type, title, message, entity_type, priority)
  SELECT o.tenant_id, 'webhook_processing_failed', 'Background Processing Failed',
    'A background task (' || o.topic || ') failed after ' || o.attempt_count || ' attempts: ' || COALESCE(o.last_error, 'Unknown error'),
    'system', 'high'
  FROM event_outbox o
  WHERE o.status = 'dead_letter'
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.tenant_id = o.tenant_id AND n.type = 'webhook_processing_failed'
        AND n.message LIKE '%' || o.id::text || '%'
    )
  LIMIT 5;

  v_duration_ms := extract(epoch from (clock_timestamp() - v_start)) * 1000;
  INSERT INTO worker_health_log (
    worker_name, invoked_at, success, processed_count, failed_count, dead_letter_count,
    duration_ms, error_message, invocation_type, invocation_id, started_at, completed_at, scheduler_job_id
  ) VALUES (
    'process-outbox', now(), true, v_processed, v_failed, 0,
    v_duration_ms, null, 'scheduled_cron', v_invocation_id, v_start, clock_timestamp(), 'process-outbox-cron'
  );

  RETURN jsonb_build_object('success', true, 'processed', v_processed, 'failed', v_failed, 'duration_ms', v_duration_ms, 'invocation_id', v_invocation_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION cron_process_outbox FROM PUBLIC, anon, authenticated;

-- ============================================================
-- retry_failed_step(uuid) — derives tenant from auth, safe retry by action type
-- ============================================================
CREATE OR REPLACE FUNCTION retry_failed_step(p_step_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step automation_step_runs%ROWTYPE;
  v_run automation_runs%ROWTYPE;
  v_tenant_id uuid;
  v_action_type text;
  v_retry_category text;
  v_existing_count int;
BEGIN
  v_tenant_id := current_tenant_id();
  IF v_tenant_id IS NULL AND NOT is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_step FROM automation_step_runs WHERE id = p_step_run_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Step not found');
  END IF;

  SELECT * INTO v_run FROM automation_runs WHERE id = v_step.automation_run_id;
  IF v_tenant_id IS NOT NULL AND v_run.tenant_id != v_tenant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF v_step.status NOT IN ('failed', 'dead_letter', 'action_required') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Step is not in a retryable state');
  END IF;

  v_action_type := v_step.action_type;
  v_retry_category := CASE
    WHEN v_action_type IN ('add_customer_tag', 'update_customer_field', 'update_opportunity_stage',
                           'create_in_app_notification', 'add_reservation_note') THEN 'idempotent'
    WHEN v_action_type IN ('send_email', 'send_sms', 'send_whatsapp') THEN 'provider_idempotent'
    WHEN v_action_type IN ('call_webhook', 'create_task', 'create_opportunity') THEN 'manual_review'
    ELSE 'manual_review'
  END;

  IF v_retry_category = 'manual_review' THEN
    UPDATE automation_step_runs SET
      error_message = 'Manual review required — external outcome unknown for action: ' || v_action_type,
      last_retry_reason = 'manual_review_required',
      last_retry_actor = auth.uid(),
      last_retry_at = now()
    WHERE id = p_step_run_id;

    INSERT INTO notifications (tenant_id, type, title, message, entity_type, entity_id, priority)
    VALUES (v_run.tenant_id, 'retry_manual_review', 'Retry requires manual review',
      'Step "' || v_step.node_id || '" (action: ' || v_action_type || ') cannot be automatically retried. External outcome is unknown.',
      'workflow', v_run.workflow_id, 'high');

    INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_name, metadata)
    VALUES (v_run.tenant_id, 'automation_step_run', p_step_run_id, 'retry_manual_review',
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
      jsonb_build_object('action_type', v_action_type, 'reason', 'manual_review_required'));

    RETURN jsonb_build_object('success', false, 'error', 'Manual review required', 'category', v_retry_category);
  END IF;

  IF v_retry_category = 'idempotent' AND v_action_type = 'add_customer_tag' THEN
    SELECT CASE WHEN tags @> ARRAY[(v_step.input->'config'->>'tag')] THEN 1 ELSE 0 END
    INTO v_existing_count
    FROM customers WHERE id = (v_step.input->>'customer_id')::uuid;
    IF COALESCE(v_existing_count, 0) = 1 THEN
      UPDATE automation_step_runs SET status = 'completed', completed_at = now(),
        error_message = null, output = jsonb_build_object('status', 'already_applied')
      WHERE id = p_step_run_id;
      RETURN jsonb_build_object('success', true, 'status', 'already_applied');
    END IF;
  END IF;

  IF v_retry_category = 'provider_idempotent' THEN
    SELECT count(*) INTO v_existing_count FROM communication_messages
    WHERE idempotency_key = 'msg-' || p_step_run_id::text
      AND status IN ('sent', 'delivered', 'sending');
    IF v_existing_count > 0 THEN
      UPDATE automation_step_runs SET status = 'completed', completed_at = now(),
        error_message = null, output = jsonb_build_object('status', 'already_sent')
      WHERE id = p_step_run_id;
      RETURN jsonb_build_object('success', true, 'status', 'already_sent');
    END IF;
  END IF;

  IF v_step.retry_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Retry limit exceeded');
  END IF;

  IF v_step.original_error IS NULL THEN
    UPDATE automation_step_runs SET original_error = v_step.error_message WHERE id = p_step_run_id;
  END IF;

  UPDATE automation_step_runs SET
    status = 'pending',
    error_message = null,
    started_at = null,
    completed_at = null,
    retry_count = retry_count + 1,
    last_retry_reason = 'manual_retry',
    last_retry_actor = auth.uid(),
    last_retry_at = now()
  WHERE id = p_step_run_id;

  IF v_run.status IN ('failed', 'cancelled') THEN
    UPDATE automation_runs SET status = 'running', error_message = null WHERE id = v_run.id;
  END IF;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_name, metadata)
  VALUES (v_run.tenant_id, 'automation_step_run', p_step_run_id, 'retry_step',
    COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
    jsonb_build_object('action_type', v_action_type, 'retry_category', v_retry_category, 'retry_count', v_step.retry_count + 1));

  RETURN jsonb_build_object('success', true, 'step_run_id', p_step_run_id, 'category', v_retry_category);
END;
$$;

GRANT EXECUTE ON FUNCTION retry_failed_step(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION retry_failed_step(uuid) FROM anon, PUBLIC;

-- ============================================================
-- dismiss_dead_letter_step(uuid) — derives tenant from auth
-- ============================================================
CREATE OR REPLACE FUNCTION dismiss_dead_letter_step(p_step_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step automation_step_runs%ROWTYPE;
  v_tenant_id uuid;
  v_run_tenant_id uuid;
BEGIN
  v_tenant_id := current_tenant_id();
  IF v_tenant_id IS NULL AND NOT is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_step FROM automation_step_runs WHERE id = p_step_run_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Step not found');
  END IF;

  SELECT tenant_id INTO v_run_tenant_id FROM automation_runs WHERE id = v_step.automation_run_id;
  IF v_tenant_id IS NOT NULL AND v_run_tenant_id != v_tenant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF v_step.status != 'dead_letter' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Step is not in dead_letter state');
  END IF;

  UPDATE automation_step_runs
  SET status = 'cancelled', error_message = COALESCE(error_message, '') || ' [dismissed by admin]',
      last_retry_actor = auth.uid(), last_retry_at = now()
  WHERE id = p_step_run_id;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_name, metadata)
  VALUES (v_run_tenant_id, 'automation_step_run', p_step_run_id, 'dismiss_dead_letter',
    COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
    jsonb_build_object('node_id', v_step.node_id, 'action_type', v_step.action_type));

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION dismiss_dead_letter_step(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION dismiss_dead_letter_step(uuid) FROM anon, PUBLIC;

-- ============================================================
-- acknowledge_failed_run(uuid) — derives tenant from auth
-- ============================================================
CREATE OR REPLACE FUNCTION acknowledge_failed_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run automation_runs%ROWTYPE;
  v_tenant_id uuid;
BEGIN
  v_tenant_id := current_tenant_id();
  IF v_tenant_id IS NULL AND NOT is_super_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT * INTO v_run FROM automation_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run not found');
  END IF;
  IF v_tenant_id IS NOT NULL AND v_run.tenant_id != v_tenant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF v_run.status != 'failed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run is not failed');
  END IF;

  UPDATE automation_runs
  SET error_message = COALESCE(error_message, '') || ' [acknowledged]',
      status = 'cancelled',
      acknowledged_by = auth.uid(),
      acknowledged_at = now()
  WHERE id = p_run_id;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_name, metadata)
  VALUES (v_run.tenant_id, 'automation_run', p_run_id, 'acknowledge_failed_run',
    COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), 'system'),
    jsonb_build_object('workflow_id', v_run.workflow_id));

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION acknowledge_failed_run(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION acknowledge_failed_run(uuid) FROM anon, PUBLIC;

-- ============================================================
-- get_automation_metrics — updated with new alert types
-- ============================================================
CREATE OR REPLACE FUNCTION get_automation_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'active_workflows', (SELECT count(*) FROM automation_workflows WHERE tenant_id = p_tenant_id AND status = 'active'),
    'draft_workflows', (SELECT count(*) FROM automation_workflows WHERE tenant_id = p_tenant_id AND status = 'draft'),
    'paused_workflows', (SELECT count(*) FROM automation_workflows WHERE tenant_id = p_tenant_id AND status = 'paused'),
    'runs_today', (SELECT count(*) FROM automation_runs WHERE tenant_id = p_tenant_id AND started_at >= date_trunc('day', now())),
    'completed_today', (SELECT count(*) FROM automation_runs WHERE tenant_id = p_tenant_id AND status = 'completed' AND completed_at >= date_trunc('day', now())),
    'failed_runs_today', (SELECT count(*) FROM automation_runs WHERE tenant_id = p_tenant_id AND status = 'failed' AND started_at >= date_trunc('day', now())),
    'action_required_steps', (SELECT count(*) FROM automation_step_runs sr JOIN automation_runs r ON r.id = sr.automation_run_id WHERE r.tenant_id = p_tenant_id AND sr.status = 'action_required'),
    'dead_letter_steps', (SELECT count(*) FROM automation_step_runs sr JOIN automation_runs r ON r.id = sr.automation_run_id WHERE r.tenant_id = p_tenant_id AND sr.status = 'dead_letter'),
    'scheduled_steps', (SELECT count(*) FROM automation_step_runs sr JOIN automation_runs r ON r.id = sr.automation_run_id WHERE r.tenant_id = p_tenant_id AND sr.status = 'scheduled'),
    'queued_messages', (SELECT count(*) FROM communication_messages WHERE tenant_id = p_tenant_id AND status = 'queued'),
    'failed_messages', (SELECT count(*) FROM communication_messages WHERE tenant_id = p_tenant_id AND status = 'failed'),
    'total_runs', (SELECT count(*) FROM automation_runs WHERE tenant_id = p_tenant_id),
    'total_completed', (SELECT count(*) FROM automation_runs WHERE tenant_id = p_tenant_id AND status = 'completed'),
    'total_failed', (SELECT count(*) FROM automation_runs WHERE tenant_id = p_tenant_id AND status = 'failed'),
    'needs_attention_workflows', (
      SELECT count(DISTINCT w.id) FROM automation_workflows w
      WHERE w.tenant_id = p_tenant_id AND w.status = 'active'
        AND EXISTS (SELECT 1 FROM automation_runs r WHERE r.workflow_id = w.id AND r.status IN ('failed', 'running') AND r.started_at >= date_trunc('day', now() - interval '7 days'))
    ),
    'disconnected_integrations', (
      SELECT count(*) FROM tenant_integrations WHERE tenant_id = p_tenant_id AND category = 'communication' AND (connection_status != 'connected' OR enabled = false)
    ),
    'worker_stale', (
      SELECT CASE WHEN EXISTS (SELECT 1 FROM worker_health_log WHERE worker_name IN ('process-workflows', 'process-outbox') AND invoked_at >= now() - interval '10 minutes') THEN false ELSE true END
    ),
    'manual_review_required', (
      SELECT count(*) FROM automation_step_runs sr JOIN automation_runs r ON r.id = sr.automation_run_id
      WHERE r.tenant_id = p_tenant_id AND sr.status = 'action_required' AND sr.error_message LIKE '%manual review%'
    ),
    'scheduler_auth_failures', (
      SELECT count(*) FROM worker_health_log WHERE invocation_type = 'auth_failed' AND invoked_at >= now() - interval '24 hours'
    ),
    'repeated_provider_failures', (
      SELECT count(*) FROM communication_messages WHERE tenant_id = p_tenant_id AND status = 'failed' AND failure_code IN ('NO_ADAPTER', 'NO_PROVIDER') AND updated_at >= now() - interval '24 hours'
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_automation_metrics(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION get_automation_metrics(uuid) FROM anon, PUBLIC;

-- ============================================================
-- Reschedule cron — DB-only, no edge function invocation
-- ============================================================
SELECT cron.unschedule('process-workflows-cron');
SELECT cron.unschedule('process-outbox-cron');

SELECT cron.schedule('process-workflows-cron', '* * * * *', $$SELECT cron_process_workflows()$$);
SELECT cron.schedule('process-outbox-cron', '*/2 * * * *', $$SELECT cron_process_outbox()$$);
