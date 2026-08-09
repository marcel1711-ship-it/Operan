-- Allow inline content (subject+body or message) as alternative to template_id
-- in publish_workflow_version validation for send_email, send_sms, send_whatsapp

CREATE OR REPLACE FUNCTION public.publish_workflow_version(
  p_workflow_id uuid,
  p_definition jsonb,
  p_trigger_type text,
  p_tenant_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_version_number int;
  v_version_id uuid;
  v_workflow RECORD;
  v_nodes jsonb;
  v_edges jsonb;
  v_node jsonb;
  v_node_id text;
  v_action_type text;
  v_config jsonb;
  v_errors text[] := ARRAY[]::text[];
  v_trigger_count int := 0;
  v_action_count int := 0;
  v_template_id uuid;
  v_template_channel text;
  v_template_tenant uuid;
  v_template_active boolean;
  v_pipeline_id uuid;
  v_stage_id uuid;
  v_pipeline_tenant uuid;
  v_stage_tenant uuid;
  v_stage_pipeline uuid;
  v_listing_id uuid;
  v_listing_tenant uuid;
  v_url text;
  v_field_path text;
  v_operator text;
  v_duration_val int;
  v_duration_unit text;
  v_has_true_branch boolean;
  v_has_false_branch boolean;
  v_reachable text[];
  v_changed boolean := true;
  v_node_record RECORD;
  v_edge_record RECORD;
  v_all_node_ids text[];
  v_dup_check int;
  v_user_id uuid;
  v_user_tenant uuid;
  v_has_inline_content boolean;
BEGIN
  -- Verify workflow ownership
  SELECT * INTO v_workflow FROM automation_workflows
  WHERE id = p_workflow_id AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow not found or not owned by tenant';
  END IF;

  -- Validate definition structure
  IF NOT (p_definition ? 'nodes' AND p_definition ? 'edges') THEN
    RAISE EXCEPTION 'Definition must contain nodes and edges arrays';
  END IF;

  v_nodes := p_definition->'nodes';
  v_edges := p_definition->'edges';

  IF jsonb_array_length(v_nodes) = 0 THEN
    RAISE EXCEPTION 'Definition must contain at least one node';
  END IF;

  -- Check for duplicate node IDs
  SELECT count(*) - count(DISTINCT node_id) INTO v_dup_check
  FROM jsonb_array_elements(v_nodes) AS j(node),
  LATERAL (SELECT node->>'node_id' AS node_id) AS t;

  IF v_dup_check > 0 THEN
    RAISE EXCEPTION 'Duplicate node IDs detected in definition';
  END IF;

  -- Collect all node IDs
  SELECT array_agg(node->>'node_id') INTO v_all_node_ids
  FROM jsonb_array_elements(v_nodes) AS j(node);

  -- Validate each node
  FOR v_node IN SELECT * FROM jsonb_array_elements(v_nodes) LOOP
    v_node_id := v_node->>'node_id';
    v_action_type := v_node->>'action_type';
    v_config := COALESCE(v_node->'configuration', '{}'::jsonb);

    -- Check action_type is not null
    IF v_action_type IS NULL THEN
      v_errors := array_append(v_errors, 'Node ' || v_node_id || ': missing action_type');
      CONTINUE;
    END IF;

    -- Trigger validation
    IF v_action_type = 'trigger' THEN
      v_trigger_count := v_trigger_count + 1;
      v_listing_id := NULLIF(v_config->>'listing_id', '')::uuid;
      IF v_listing_id IS NOT NULL THEN
        SELECT tenant_id INTO v_listing_tenant FROM listings WHERE id = v_listing_id;
        IF v_listing_tenant IS NULL OR v_listing_tenant != p_tenant_id THEN
          v_errors := array_append(v_errors, 'Trigger: listing does not belong to tenant');
        END IF;
      END IF;
      CONTINUE;
    END IF;

    v_action_count := v_action_count + 1;

    -- send_email validation: require template_id OR inline subject+body
    IF v_action_type = 'send_email' THEN
      v_template_id := NULLIF(v_config->>'template_id', '')::uuid;
      v_has_inline_content := (
        COALESCE(v_config->>'subject', '') != '' AND
        COALESCE(v_config->>'body', '') != ''
      );

      IF v_template_id IS NULL AND NOT v_has_inline_content THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_email): template or inline subject+body is required');
      ELSIF v_template_id IS NOT NULL THEN
        SELECT channel, tenant_id, is_active INTO v_template_channel, v_template_tenant, v_template_active
        FROM communication_templates WHERE id = v_template_id;
        IF v_template_tenant IS NULL THEN
          v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_email): template not found');
        ELSE
          IF v_template_tenant != p_tenant_id THEN
            v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_email): template belongs to another tenant');
          END IF;
          IF v_template_channel != 'email' THEN
            v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_email): template channel is not email');
          END IF;
          IF NOT v_template_active THEN
            v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_email): template is not active');
          END IF;
        END IF;
      END IF;
    END IF;

    -- send_sms validation: require template_id OR inline message
    IF v_action_type = 'send_sms' THEN
      v_template_id := NULLIF(v_config->>'template_id', '')::uuid;
      v_has_inline_content := COALESCE(v_config->>'message', '') != '';

      IF v_template_id IS NULL AND NOT v_has_inline_content THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_sms): template or inline message is required');
      ELSIF v_template_id IS NOT NULL THEN
        SELECT channel, tenant_id, is_active INTO v_template_channel, v_template_tenant, v_template_active
        FROM communication_templates WHERE id = v_template_id;
        IF v_template_tenant IS NULL THEN
          v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_sms): template not found');
        ELSE
          IF v_template_tenant != p_tenant_id THEN
            v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_sms): template belongs to another tenant');
          END IF;
          IF v_template_channel != 'sms' THEN
            v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_sms): template channel is not sms');
          END IF;
          IF NOT v_template_active THEN
            v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_sms): template is not active');
          END IF;
        END IF;
      END IF;
    END IF;

    -- send_whatsapp validation: require template_id OR inline message
    IF v_action_type = 'send_whatsapp' THEN
      v_template_id := NULLIF(v_config->>'template_id', '')::uuid;
      v_has_inline_content := COALESCE(v_config->>'message', '') != '';

      IF v_template_id IS NULL AND NOT v_has_inline_content THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_whatsapp): template or inline message is required');
      ELSIF v_template_id IS NOT NULL THEN
        SELECT channel, tenant_id, is_active INTO v_template_channel, v_template_tenant, v_template_active
        FROM communication_templates WHERE id = v_template_id;
        IF v_template_tenant IS NULL THEN
          v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_whatsapp): template not found');
        ELSE
          IF v_template_tenant != p_tenant_id THEN
            v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_whatsapp): template belongs to another tenant');
          END IF;
          IF v_template_channel != 'whatsapp' THEN
            v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_whatsapp): template channel is not whatsapp');
          END IF;
          IF NOT v_template_active THEN
            v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (send_whatsapp): template is not active');
          END IF;
        END IF;
      END IF;
    END IF;

    -- wait validation
    IF v_action_type = 'wait' THEN
      v_duration_val := NULLIF(v_config->>'duration_value', '')::int;
      v_duration_unit := v_config->>'duration_unit';
      IF v_duration_val IS NULL OR v_duration_val <= 0 THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (wait): duration_value must be > 0');
      END IF;
      IF v_duration_unit NOT IN ('minutes', 'hours', 'days') THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (wait): duration_unit must be minutes, hours, or days');
      END IF;
    END IF;

    -- if_else / condition validation
    IF v_action_type IN ('if_else', 'condition') THEN
      v_field_path := v_config->>'field_path';
      v_operator := v_config->>'operator';
      IF v_field_path IS NULL OR v_field_path = '' THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (' || v_action_type || '): field_path is required');
      END IF;
      IF v_operator NOT IN ('equals', 'not_equals', 'greater_than', 'less_than',
          'contains', 'not_contains', 'exists', 'not_exists',
          'before', 'after', 'within_next', 'is_true', 'is_false') THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (' || v_action_type || '): unsupported operator');
      END IF;
      IF v_action_type = 'if_else' THEN
        SELECT EXISTS(
          SELECT 1 FROM jsonb_array_elements(v_edges) AS e
          WHERE e->>'source' = v_node_id AND (e->>'source_handle' = 'true' OR e->>'source_handle' IS NULL)
        ) INTO v_has_true_branch;
        SELECT EXISTS(
          SELECT 1 FROM jsonb_array_elements(v_edges) AS e
          WHERE e->>'source' = v_node_id AND (e->>'source_handle' = 'false' OR e->>'source_handle' IS NULL)
        ) INTO v_has_false_branch;
        IF NOT v_has_true_branch THEN
          v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (if_else): true branch not connected');
        END IF;
        IF NOT v_has_false_branch THEN
          v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (if_else): false branch not connected');
        END IF;
      END IF;
    END IF;

    -- update_opportunity_stage validation
    IF v_action_type = 'update_opportunity_stage' THEN
      v_pipeline_id := NULLIF(v_config->>'pipeline_id', '')::uuid;
      v_stage_id := NULLIF(v_config->>'stage_id', '')::uuid;
      IF v_pipeline_id IS NULL THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (update_opportunity_stage): pipeline_id is required');
      ELSE
        SELECT tenant_id INTO v_pipeline_tenant FROM pipelines WHERE id = v_pipeline_id;
        IF v_pipeline_tenant IS NULL OR v_pipeline_tenant != p_tenant_id THEN
          v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (update_opportunity_stage): pipeline does not belong to tenant');
        END IF;
      END IF;
      IF v_stage_id IS NULL THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (update_opportunity_stage): stage_id is required');
      ELSE
        SELECT tenant_id, pipeline_id INTO v_stage_tenant, v_stage_pipeline FROM pipeline_stages WHERE id = v_stage_id;
        IF v_stage_tenant IS NULL OR v_stage_tenant != p_tenant_id THEN
          v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (update_opportunity_stage): stage does not belong to tenant');
        ELSIF v_pipeline_id IS NOT NULL AND v_stage_pipeline != v_pipeline_id THEN
          v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (update_opportunity_stage): stage does not belong to the selected pipeline');
        END IF;
      END IF;
    END IF;

    -- call_webhook validation
    IF v_action_type = 'call_webhook' THEN
      v_url := v_config->>'url';
      IF v_url IS NULL OR v_url = '' THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (call_webhook): url is required');
      ELSIF NOT (v_url LIKE 'http://%' OR v_url LIKE 'https://%') THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (call_webhook): URL must be HTTP or HTTPS');
      ELSIF v_url ~* '(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|169\.254\.169\.254|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|\.internal|\.local)' THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (call_webhook): URL points to blocked private/metadata endpoint');
      END IF;
    END IF;

    -- create_task validation
    IF v_action_type = 'create_task' THEN
      IF v_config->>'title' IS NULL OR v_config->>'title' = '' THEN
        v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (create_task): title is required');
      END IF;
      v_user_id := NULLIF(v_config->>'assigned_user_id', '')::uuid;
      IF v_user_id IS NOT NULL THEN
        SELECT tenant_id INTO v_user_tenant FROM tenant_users WHERE id = v_user_id;
        IF v_user_tenant IS NULL OR v_user_tenant != p_tenant_id THEN
          v_errors := array_append(v_errors, 'Node ' || v_node_id || ' (create_task): assigned user does not belong to tenant');
        END IF;
      END IF;
    END IF;

    -- Reject unknown action types
    IF v_action_type NOT IN (
      'trigger', 'send_email', 'send_sms', 'send_whatsapp',
      'create_in_app_notification', 'wait', 'wait_until',
      'if_else', 'condition', 'add_customer_tag',
      'add_reservation_note', 'create_task',
      'update_opportunity_stage', 'call_webhook', 'stop_workflow'
    ) THEN
      v_errors := array_append(v_errors, 'Node ' || v_node_id || ': unknown action_type "' || v_action_type || '"');
    END IF;
  END LOOP;

  -- Validate graph structure
  IF v_trigger_count = 0 THEN
    v_errors := array_append(v_errors, 'Workflow must have a trigger node');
  ELSIF v_trigger_count > 1 THEN
    v_errors := array_append(v_errors, 'Workflow must have exactly one trigger node');
  END IF;

  IF v_action_count = 0 THEN
    v_errors := array_append(v_errors, 'Workflow must have at least one action node');
  END IF;

  -- Reachability check
  v_reachable := ARRAY['trigger'];
  v_changed := true;
  WHILE v_changed LOOP
    v_changed := false;
    FOR v_edge_record IN
      SELECT source, target FROM jsonb_array_elements(v_edges) AS e,
      LATERAL (SELECT e->>'source' AS source, e->>'target' AS target) AS t
    LOOP
      IF v_edge_record.source = ANY(v_reachable) AND NOT (v_edge_record.target = ANY(v_reachable)) THEN
        v_reachable := array_append(v_reachable, v_edge_record.target);
        v_changed := true;
      END IF;
    END LOOP;
  END LOOP;

  -- Check for orphan nodes
  FOR v_node_record IN SELECT node_id FROM unnest(v_all_node_ids) AS node_id LOOP
    IF NOT (v_node_record.node_id = ANY(v_reachable)) THEN
      v_errors := array_append(v_errors, 'Node ' || v_node_record.node_id || ' is not reachable from trigger');
    END IF;
  END LOOP;

  -- Trigger must have at least one outgoing edge
  IF v_trigger_count = 1 THEN
    IF NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(v_edges) AS e
      WHERE e->>'source' = 'trigger'
    ) THEN
      v_errors := array_append(v_errors, 'Trigger node must connect to at least one action');
    END IF;
  END IF;

  -- If any errors, reject publication
  IF array_length(v_errors, 1) > 0 THEN
    RAISE EXCEPTION 'Publication validation failed: %', array_to_string(v_errors, '; ');
  END IF;

  -- All validation passed — create immutable version
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
  FROM automation_workflow_versions WHERE workflow_id = p_workflow_id;

  INSERT INTO automation_workflow_versions (
    tenant_id, workflow_id, version_number, definition, trigger_type,
    published_by, published_at
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
$function$;
