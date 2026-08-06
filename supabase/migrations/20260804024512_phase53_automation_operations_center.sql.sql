-- ============================================================
-- Phase 5.3: Automation Operations Center
-- Metrics RPC, retry RPC, dead-letter dismissal RPC
-- ============================================================

-- 1) Tenant-scoped automation metrics RPC
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
    'runs_today', (
      SELECT count(*) FROM automation_runs
      WHERE tenant_id = p_tenant_id
        AND started_at >= date_trunc('day', now())
    ),
    'completed_today', (
      SELECT count(*) FROM automation_runs
      WHERE tenant_id = p_tenant_id
        AND status = 'completed'
        AND completed_at >= date_trunc('day', now())
    ),
    'failed_runs_today', (
      SELECT count(*) FROM automation_runs
      WHERE tenant_id = p_tenant_id
        AND status = 'failed'
        AND started_at >= date_trunc('day', now())
    ),
    'action_required_steps', (
      SELECT count(*) FROM automation_step_runs sr
      JOIN automation_runs r ON r.id = sr.automation_run_id
      WHERE r.tenant_id = p_tenant_id AND sr.status = 'action_required'
    ),
    'dead_letter_steps', (
      SELECT count(*) FROM automation_step_runs sr
      JOIN automation_runs r ON r.id = sr.automation_run_id
      WHERE r.tenant_id = p_tenant_id AND sr.status = 'dead_letter'
    ),
    'scheduled_steps', (
      SELECT count(*) FROM automation_step_runs sr
      JOIN automation_runs r ON r.id = sr.automation_run_id
      WHERE r.tenant_id = p_tenant_id AND sr.status = 'scheduled'
    ),
    'queued_messages', (
      SELECT count(*) FROM communication_messages WHERE tenant_id = p_tenant_id AND status = 'queued'
    ),
    'failed_messages', (
      SELECT count(*) FROM communication_messages WHERE tenant_id = p_tenant_id AND status = 'failed'
    ),
    'total_runs', (SELECT count(*) FROM automation_runs WHERE tenant_id = p_tenant_id),
    'total_completed', (SELECT count(*) FROM automation_runs WHERE tenant_id = p_tenant_id AND status = 'completed'),
    'total_failed', (SELECT count(*) FROM automation_runs WHERE tenant_id = p_tenant_id AND status = 'failed'),
    'needs_attention_workflows', (
      SELECT count(DISTINCT w.id) FROM automation_workflows w
      WHERE w.tenant_id = p_tenant_id AND w.status = 'active'
        AND EXISTS (
          SELECT 1 FROM automation_runs r
          WHERE r.workflow_id = w.id
            AND r.status IN ('failed', 'running')
            AND r.started_at >= date_trunc('day', now() - interval '7 days')
        )
    ),
    'disconnected_integrations', (
      SELECT count(*) FROM tenant_integrations
      WHERE tenant_id = p_tenant_id
        AND category = 'communication'
        AND (connection_status != 'connected' OR enabled = false)
    ),
    'worker_stale', (
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM worker_health_log
        WHERE worker_name IN ('process-workflows', 'process-outbox')
          AND invoked_at >= now() - interval '10 minutes'
      ) THEN false ELSE true END
    )
  );
$$;

-- 2) Retry a failed step (service-role only)
CREATE OR REPLACE FUNCTION retry_failed_step(p_step_run_id uuid, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step automation_step_runs%ROWTYPE;
  v_run automation_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_step FROM automation_step_runs WHERE id = p_step_run_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Step not found');
  END IF;

  SELECT * INTO v_run FROM automation_runs WHERE id = v_step.automation_run_id;
  IF v_run.tenant_id != p_tenant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF v_step.status NOT IN ('failed', 'dead_letter', 'action_required') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Step is not in a retryable state');
  END IF;

  UPDATE automation_step_runs
  SET status = 'pending', error_message = null, started_at = null, completed_at = null
  WHERE id = p_step_run_id;

  -- If the parent run was failed/cancelled, reactivate it
  IF v_run.status IN ('failed', 'cancelled') THEN
    UPDATE automation_runs SET status = 'running', error_message = null WHERE id = v_run.id;
  END IF;

  RETURN jsonb_build_object('success', true, 'step_run_id', p_step_run_id);
END;
$$;

-- 3) Dismiss a dead-letter step (preserve history, mark as resolved)
CREATE OR REPLACE FUNCTION dismiss_dead_letter_step(p_step_run_id uuid, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step automation_step_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_step FROM automation_step_runs WHERE id = p_step_run_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Step not found');
  END IF;

  DECLARE
    v_tenant_id uuid;
  BEGIN
    SELECT tenant_id INTO v_tenant_id FROM automation_runs WHERE id = v_step.automation_run_id;
    IF v_tenant_id IS NULL OR v_tenant_id != p_tenant_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;
  END;

  IF v_step.status != 'dead_letter' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Step is not in dead_letter state');
  END IF;

  UPDATE automation_step_runs
  SET status = 'cancelled', error_message = COALESCE(error_message, '') || ' [dismissed by admin]'
  WHERE id = p_step_run_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4) Acknowledge a failed run
CREATE OR REPLACE FUNCTION acknowledge_failed_run(p_run_id uuid, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run automation_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM automation_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run not found');
  END IF;
  IF v_run.tenant_id != p_tenant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF v_run.status != 'failed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Run is not failed');
  END IF;

  UPDATE automation_runs
  SET error_message = COALESCE(error_message, '') || ' [acknowledged]',
      status = 'cancelled'
  WHERE id = p_run_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute to authenticated for all new RPCs
GRANT EXECUTE ON FUNCTION get_automation_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION retry_failed_step TO authenticated;
GRANT EXECUTE ON FUNCTION dismiss_dead_letter_step TO authenticated;
GRANT EXECUTE ON FUNCTION acknowledge_failed_run TO authenticated;

-- Revoke from anon
REVOKE EXECUTE ON FUNCTION get_automation_metrics FROM anon;
REVOKE EXECUTE ON FUNCTION retry_failed_step FROM anon;
REVOKE EXECUTE ON FUNCTION dismiss_dead_letter_step FROM anon;
REVOKE EXECUTE ON FUNCTION acknowledge_failed_run FROM anon;
