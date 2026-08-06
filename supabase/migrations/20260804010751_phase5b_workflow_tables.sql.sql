-- ============================================================
-- Phase 5B: Workflow Automation Tables
-- ============================================================

-- 1. Automation workflows
CREATE TABLE IF NOT EXISTS automation_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger_type text NOT NULL,
  trigger_configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  active_version integer,
  is_template boolean NOT NULL DEFAULT false,
  created_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX idx_wf_tenant ON automation_workflows(tenant_id);
CREATE INDEX idx_wf_tenant_status ON automation_workflows(tenant_id, status);
CREATE INDEX idx_wf_trigger ON automation_workflows(trigger_type) WHERE status = 'active';

-- 2. Workflow versions (immutable after publication)
CREATE TABLE IF NOT EXISTS automation_workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  definition jsonb NOT NULL,
  trigger_type text NOT NULL,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, version_number)
);

CREATE INDEX idx_wf_ver_workflow ON automation_workflow_versions(workflow_id);
CREATE INDEX idx_wf_ver_tenant ON automation_workflow_versions(tenant_id);

-- 3. Workflow steps (nodes)
CREATE TABLE IF NOT EXISTS automation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_version_id uuid NOT NULL REFERENCES automation_workflow_versions(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  action_type text NOT NULL,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  position_x real NOT NULL DEFAULT 0,
  position_y real NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_version_id, node_id)
);

CREATE INDEX idx_wf_steps_ver ON automation_steps(workflow_version_id);
CREATE INDEX idx_wf_steps_tenant ON automation_steps(tenant_id);

-- 4. Workflow connections (edges)
CREATE TABLE IF NOT EXISTS automation_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_version_id uuid NOT NULL REFERENCES automation_workflow_versions(id) ON DELETE CASCADE,
  source_node_id text NOT NULL,
  target_node_id text NOT NULL,
  source_handle text,
  condition_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wf_conn_ver ON automation_connections(workflow_version_id);
CREATE INDEX idx_wf_conn_tenant ON automation_connections(tenant_id);

-- 5. Automation runs
CREATE TABLE IF NOT EXISTS automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES automation_workflows(id) ON DELETE CASCADE,
  workflow_version_id uuid NOT NULL REFERENCES automation_workflow_versions(id) ON DELETE CASCADE,
  trigger_event_id uuid,
  entity_type text,
  entity_id uuid,
  reservation_id uuid,
  customer_id uuid,
  opportunity_id uuid,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),
  current_node_id text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, tenant_id)
);

CREATE INDEX idx_wf_run_tenant ON automation_runs(tenant_id);
CREATE INDEX idx_wf_run_status ON automation_runs(status) WHERE status = 'running';
CREATE INDEX idx_wf_run_reservation ON automation_runs(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX idx_wf_run_workflow ON automation_runs(workflow_id);

-- 6. Automation step runs
CREATE TABLE IF NOT EXISTS automation_step_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  automation_run_id uuid NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','scheduled','running','completed','failed','cancelled','skipped','dead_letter')),
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  input jsonb,
  output jsonb,
  error_message text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, tenant_id)
);

CREATE INDEX idx_wf_step_run_run ON automation_step_runs(automation_run_id);
CREATE INDEX idx_wf_step_run_status ON automation_step_runs(status) WHERE status IN ('pending','scheduled');
CREATE INDEX idx_wf_step_run_scheduled ON automation_step_runs(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_wf_step_run_tenant ON automation_step_runs(tenant_id);

-- 7. Enable RLS on all workflow tables
ALTER TABLE automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_step_runs ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies: automation_workflows (tenant-scoped CRUD)
CREATE POLICY "wf_select_tenant" ON automation_workflows
  FOR SELECT TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());
CREATE POLICY "wf_insert_tenant" ON automation_workflows
  FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());
CREATE POLICY "wf_update_tenant" ON automation_workflows
  FOR UPDATE TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());
CREATE POLICY "wf_delete_tenant" ON automation_workflows
  FOR DELETE TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- 9. RLS Policies: automation_workflow_versions (tenant-scoped SELECT + INSERT, no UPDATE/DELETE)
CREATE POLICY "wf_ver_select_tenant" ON automation_workflow_versions
  FOR SELECT TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());
CREATE POLICY "wf_ver_insert_tenant" ON automation_workflow_versions
  FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

-- 10. RLS Policies: automation_steps (tenant-scoped CRUD)
CREATE POLICY "wf_steps_select_tenant" ON automation_steps
  FOR SELECT TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());
CREATE POLICY "wf_steps_insert_tenant" ON automation_steps
  FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());
CREATE POLICY "wf_steps_update_tenant" ON automation_steps
  FOR UPDATE TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());
CREATE POLICY "wf_steps_delete_tenant" ON automation_steps
  FOR DELETE TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- 11. RLS Policies: automation_connections (tenant-scoped CRUD)
CREATE POLICY "wf_conn_select_tenant" ON automation_connections
  FOR SELECT TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());
CREATE POLICY "wf_conn_insert_tenant" ON automation_connections
  FOR INSERT TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());
CREATE POLICY "wf_conn_update_tenant" ON automation_connections
  FOR UPDATE TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());
CREATE POLICY "wf_conn_delete_tenant" ON automation_connections
  FOR DELETE TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- 12. RLS Policies: automation_runs (tenant-scoped SELECT only, no direct writes)
CREATE POLICY "wf_run_select_tenant" ON automation_runs
  FOR SELECT TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- 13. RLS Policies: automation_step_runs (tenant-scoped SELECT only, no direct writes)
CREATE POLICY "wf_step_run_select_tenant" ON automation_step_runs
  FOR SELECT TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- 14. Revoke direct table grants on run tables from anon and authenticated
REVOKE INSERT, UPDATE, DELETE ON automation_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON automation_step_runs FROM anon, authenticated;
REVOKE ALL ON automation_workflows FROM anon;
REVOKE ALL ON automation_workflow_versions FROM anon;
REVOKE ALL ON automation_steps FROM anon;
REVOKE ALL ON automation_connections FROM anon;

-- 15. Updated_at triggers
CREATE TRIGGER trg_wf_updated_at
  BEFORE UPDATE ON automation_workflows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_wf_steps_updated_at
  BEFORE UPDATE ON automation_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_wf_run_updated_at
  BEFORE UPDATE ON automation_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_wf_step_run_updated_at
  BEFORE UPDATE ON automation_step_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 16. RPC: Dispatch workflow from domain event (service-role only)
CREATE OR REPLACE FUNCTION public.dispatch_workflow_from_event(
  p_domain_event_id uuid,
  p_tenant_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_reservation_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_opportunity_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow RECORD;
  v_run_id uuid;
  v_idem text;
  v_created_count int := 0;
BEGIN
  FOR v_workflow IN
    SELECT w.id, w.active_version, w.trigger_configuration
    FROM automation_workflows w
    WHERE w.tenant_id = p_tenant_id
    AND w.status = 'active'
    AND w.active_version IS NOT NULL
    AND w.trigger_type = p_event_type
  LOOP
    v_idem := 'wf-' || v_workflow.id || '-' || p_domain_event_id::text;

    INSERT INTO automation_runs (
      tenant_id, workflow_id, workflow_version_id,
      trigger_event_id, entity_type, entity_id,
      reservation_id, customer_id, opportunity_id,
      status, context, idempotency_key
    )
    SELECT
      p_tenant_id, v_workflow.id,
      (SELECT id FROM automation_workflow_versions WHERE workflow_id = v_workflow.id AND version_number = v_workflow.active_version),
      p_domain_event_id, p_entity_type, p_entity_id,
      p_reservation_id, p_customer_id, p_opportunity_id,
      'running', jsonb_build_object('payload', p_payload, 'trigger_type', p_event_type), v_idem
    ON CONFLICT (idempotency_key, tenant_id) DO NOTHING
    RETURNING id INTO v_run_id;

    IF v_run_id IS NOT NULL THEN
      v_created_count := v_created_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('dispatched', v_created_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_workflow_from_event(
  uuid, uuid, text, text, uuid, uuid, uuid, uuid, jsonb
) FROM PUBLIC, anon, authenticated;

-- 17. RPC: Create workflow step run (service-role only)
CREATE OR REPLACE FUNCTION public.create_workflow_step_run(
  p_tenant_id uuid,
  p_automation_run_id uuid,
  p_node_id text,
  p_action_type text,
  p_scheduled_for timestamptz DEFAULT NULL,
  p_input jsonb DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_idem text;
  v_status text;
BEGIN
  v_idem := COALESCE(p_idempotency_key, 'step-' || p_automation_run_id::text || '-' || p_node_id);
  v_status := CASE WHEN p_scheduled_for IS NOT NULL THEN 'scheduled' ELSE 'pending' END;

  INSERT INTO automation_step_runs (
    tenant_id, automation_run_id, node_id, action_type,
    status, scheduled_for, input, idempotency_key
  ) VALUES (
    p_tenant_id, p_automation_run_id, p_node_id, p_action_type,
    v_status, p_scheduled_for, p_input, v_idem
  )
  ON CONFLICT (idempotency_key, tenant_id) DO NOTHING
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('step_run_id', v_id, 'status', v_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_workflow_step_run(
  uuid, uuid, text, text, timestamptz, jsonb, text
) FROM PUBLIC, anon, authenticated;

-- 18. RPC: Update workflow run status (service-role only)
CREATE OR REPLACE FUNCTION public.update_workflow_run_status(
  p_run_id uuid,
  p_status text,
  p_current_node_id text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE automation_runs SET
    status = p_status,
    current_node_id = COALESCE(p_current_node_id, current_node_id),
    error_message = COALESCE(p_error_message, error_message),
    completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END,
    failed_at = CASE WHEN p_status = 'failed' THEN now() ELSE failed_at END
  WHERE id = p_run_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_workflow_run_status(
  uuid, text, text, text
) FROM PUBLIC, anon, authenticated;

-- 19. RPC: Update step run status (service-role only)
CREATE OR REPLACE FUNCTION public.update_step_run_status(
  p_step_run_id uuid,
  p_status text,
  p_output jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE automation_step_runs SET
    status = p_status,
    output = COALESCE(p_output, output),
    error_message = COALESCE(p_error_message, error_message),
    started_at = CASE WHEN p_status = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
    completed_at = CASE WHEN p_status IN ('completed','failed','cancelled','skipped','dead_letter') THEN now() ELSE completed_at END,
    attempt_count = CASE WHEN p_status = 'failed' THEN attempt_count + 1 ELSE attempt_count END
  WHERE id = p_step_run_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_step_run_status(
  uuid, text, jsonb, text
) FROM PUBLIC, anon, authenticated;

-- 20. RPC: Cancel future scheduled steps for a reservation (service-role only)
CREATE OR REPLACE FUNCTION public.cancel_future_workflow_steps(
  p_reservation_id uuid,
  p_reason text DEFAULT 'reservation_cancelled'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE automation_step_runs SET
    status = 'cancelled',
    error_message = p_reason,
    completed_at = now()
  WHERE status IN ('pending', 'scheduled')
  AND automation_run_id IN (
    SELECT id FROM automation_runs WHERE reservation_id = p_reservation_id
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('cancelled_count', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_future_workflow_steps(uuid, text) FROM PUBLIC, anon, authenticated;

-- 21. RPC: Publish workflow version (tenant-admin callable)
CREATE OR REPLACE FUNCTION public.publish_workflow_version(
  p_workflow_id uuid,
  p_definition jsonb,
  p_trigger_type text,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_number int;
  v_version_id uuid;
  v_workflow RECORD;
BEGIN
  SELECT * INTO v_workflow FROM automation_workflows
  WHERE id = p_workflow_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow not found or not owned by tenant';
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
  FROM automation_workflow_versions WHERE workflow_id = p_workflow_id;

  INSERT INTO automation_workflow_versions (
    tenant_id, workflow_id, version_number, definition, trigger_type, published_by, published_at
  ) VALUES (
    p_tenant_id, p_workflow_id, v_version_number, p_definition, p_trigger_type,
    auth.uid(), now()
  ) RETURNING id INTO v_version_id;

  UPDATE automation_workflows SET
    status = 'active',
    active_version = v_version_number,
    trigger_type = p_trigger_type,
    published_at = now(),
    updated_at = now()
  WHERE id = p_workflow_id;

  RETURN jsonb_build_object('version_id', v_version_id, 'version_number', v_version_number);
END;
$$;
