-- ============================================================
-- Phase 5.4 Part 3: Step navigation helpers
-- ============================================================

-- create_next_steps: creates next step runs for a completed step
CREATE OR REPLACE FUNCTION create_next_steps(
  p_step_id uuid, p_tenant_id uuid, p_run_id uuid, p_node_id text,
  p_nodes jsonb, p_edges jsonb, p_input jsonb, p_scheduled_for timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edge jsonb;
  v_next_node jsonb;
  v_next_node_id text;
  v_next_action_type text;
  v_next_config jsonb;
  v_sched_suffix text := '';
BEGIN
  IF p_scheduled_for IS NOT NULL THEN
    v_sched_suffix := '-sched-' || extract(epoch from p_scheduled_for)::int::text;
  END IF;

  FOR v_edge IN SELECT * FROM jsonb_array_elements(p_edges) WHERE e->>'source' = p_node_id AND (e->>'source_handle' IS NULL OR e->>'source_handle' = '')
  LOOP
    v_next_node_id := v_edge->>'target';
    SELECT node INTO v_next_node FROM jsonb_array_elements(p_nodes) AS node WHERE node->>'node_id' = v_next_node_id LIMIT 1;

    IF v_next_node IS NOT NULL THEN
      v_next_action_type := v_next_node->>'action_type';
      v_next_config := COALESCE(v_next_node->'configuration', '{}'::jsonb);

      INSERT INTO automation_step_runs (tenant_id, automation_run_id, node_id, action_type, status, scheduled_for, input, idempotency_key)
      VALUES (
        p_tenant_id, p_run_id,
        v_next_node_id, v_next_action_type,
        CASE WHEN p_scheduled_for IS NOT NULL THEN 'scheduled' ELSE 'pending' END,
        p_scheduled_for,
        jsonb_set(p_input, '{config}', v_next_config, true),
        'step-' || v_next_node_id || '-' || p_run_id::text || v_sched_suffix
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- If no next edges, mark run as completed
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_edges) e WHERE e->>'source' = p_node_id AND (e->>'source_handle' IS NULL OR e->>'source_handle' = '')) THEN
    UPDATE automation_runs SET status = 'completed', completed_at = now() WHERE id = p_run_id AND status = 'running';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_next_steps(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;

-- create_next_steps_with_branch: for condition/if_else nodes
CREATE OR REPLACE FUNCTION create_next_steps_with_branch(
  p_step_id uuid, p_tenant_id uuid, p_run_id uuid, p_node_id text,
  p_nodes jsonb, p_edges jsonb, p_input jsonb, p_branch text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edge jsonb;
  v_next_node jsonb;
  v_next_node_id text;
  v_next_action_type text;
  v_next_config jsonb;
BEGIN
  FOR v_edge IN SELECT * FROM jsonb_array_elements(p_edges)
    WHERE e->>'source' = p_node_id AND (e->>'source_handle' IS NULL OR e->>'source_handle' = '' OR e->>'source_handle' = p_branch)
  LOOP
    v_next_node_id := v_edge->>'target';
    SELECT node INTO v_next_node FROM jsonb_array_elements(p_nodes) AS node WHERE node->>'node_id' = v_next_node_id LIMIT 1;

    IF v_next_node IS NOT NULL THEN
      v_next_action_type := v_next_node->>'action_type';
      v_next_config := COALESCE(v_next_node->'configuration', '{}'::jsonb);

      INSERT INTO automation_step_runs (tenant_id, automation_run_id, node_id, action_type, status, input, idempotency_key)
      VALUES (
        p_tenant_id, p_run_id,
        v_next_node_id, v_next_action_type, 'pending',
        jsonb_set(p_input, '{config}', v_next_config, true),
        'step-' || v_next_node_id || '-' || p_run_id::text
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- If no next edges, mark run as completed
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_edges) e WHERE e->>'source' = p_node_id) THEN
    UPDATE automation_runs SET status = 'completed', completed_at = now() WHERE id = p_run_id AND status = 'running';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_next_steps_with_branch(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
