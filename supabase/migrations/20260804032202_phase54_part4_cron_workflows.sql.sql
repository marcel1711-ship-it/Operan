-- ============================================================
-- Phase 5.4 Part 4: cron_process_workflows — sole processing owner
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
  v_invocation_id text := 'inv-' || extract(epoch from now())::int::text || '-' || md5(random()::text);
  v_step RECORD;
  v_input jsonb;
  v_config jsonb;
  v_tenant_id uuid;
  v_workflow_id uuid;
  v_workflow_version_id uuid;
  v_reservation_id uuid;
  v_customer_id uuid;
  v_opportunity_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_payload jsonb;
  v_node_id text;
  v_definition jsonb;
  v_nodes jsonb;
  v_edges jsonb;
  v_scheduled_for timestamptz;
  v_duration_val numeric;
  v_unit text;
  v_field_path text;
  v_operator text;
  v_comparison_value text;
  v_actual_value text;
  v_result boolean;
  v_branch text;
  v_tag text;
  v_customer_tags text[];
  v_title text;
  v_message text;
  v_template_id uuid;
  v_channel text;
  v_readiness jsonb;
  v_recipient text;
  v_classification text;
  v_consent jsonb;
  v_webhook_url text;
  v_ssrf_result jsonb;
  v_max_attempts int := 5;
BEGIN
  -- Step 1: Recover stuck step runs (running > 5 min)
  UPDATE automation_step_runs
  SET status = 'pending', started_at = null
  WHERE status = 'running'
    AND started_at < now() - interval '5 minutes';

  -- Step 2: Create first step for running runs that have no steps
  INSERT INTO automation_step_runs (tenant_id, automation_run_id, node_id, action_type, status, input, idempotency_key)
  SELECT
    r.tenant_id, r.id,
    n.node->>'node_id',
    n.node->>'action_type',
    'pending',
    jsonb_build_object(
      'config', n.node->'configuration',
      'tenant_id', r.tenant_id,
      'workflow_id', r.workflow_id,
      'workflow_version_id', r.workflow_version_id,
      'reservation_id', r.reservation_id,
      'customer_id', r.customer_id,
      'opportunity_id', r.opportunity_id,
      'entity_type', r.entity_type,
      'entity_id', r.entity_id,
      'payload', COALESCE(r.context->'payload', '{}'::jsonb),
      'node_id', n.node->>'node_id'
    ),
    'step-' || (n.node->>'node_id') || '-' || (r.id::text)
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

  -- Step 3: Mark due scheduled steps as pending
  UPDATE automation_step_runs
  SET status = 'pending'
  WHERE status = 'scheduled'
    AND scheduled_for <= now();

  -- Step 4: Lease and process pending steps
  FOR v_step IN
    SELECT sr.id, sr.automation_run_id, sr.node_id, sr.action_type, sr.input,
           sr.attempt_count, sr.max_attempts, sr.tenant_id
    FROM automation_step_runs sr
    WHERE sr.status = 'pending'
    ORDER BY sr.created_at
    LIMIT 20
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE automation_step_runs
    SET status = 'running', started_at = now()
    WHERE id = v_step.id AND status = 'pending';

    IF NOT FOUND THEN CONTINUE; END IF;

    v_processed := v_processed + 1;

    BEGIN
      v_input := v_step.input;
      v_config := COALESCE(v_input->'config', '{}'::jsonb);
      v_tenant_id := (v_input->>'tenant_id')::uuid;
      v_workflow_id := (v_input->>'workflow_id')::uuid;
      v_workflow_version_id := (v_input->>'workflow_version_id')::uuid;
      v_reservation_id := COALESCE((v_input->>'reservation_id')::uuid, NULL);
      v_customer_id := COALESCE((v_input->>'customer_id')::uuid, NULL);
      v_opportunity_id := COALESCE((v_input->>'opportunity_id')::uuid, NULL);
      v_entity_type := v_input->>'entity_type';
      v_entity_id := COALESCE((v_input->>'entity_id')::uuid, NULL);
      v_payload := COALESCE(v_input->'payload', '{}'::jsonb);
      v_node_id := v_input->>'node_id';

      SELECT definition INTO v_definition FROM automation_workflow_versions WHERE id = v_workflow_version_id;
      IF v_definition IS NULL THEN
        RAISE EXCEPTION 'No definition found for version %', v_workflow_version_id;
      END IF;
      v_nodes := v_definition->'nodes';
      v_edges := v_definition->'edges';

      -- ===== WAIT =====
      IF v_step.action_type = 'wait' THEN
        v_duration_val := (v_config->>'duration_value')::numeric;
        v_unit := v_config->>'duration_unit';
        IF v_duration_val IS NULL OR v_duration_val <= 0 OR v_unit NOT IN ('minutes', 'hours', 'days') THEN
          RAISE EXCEPTION 'Invalid wait config: duration=%, unit=%', v_duration_val, v_unit;
        END IF;
        v_scheduled_for := CASE v_unit
          WHEN 'minutes' THEN now() + (v_duration_val || ' minutes')::interval
          WHEN 'hours' THEN now() + (v_duration_val || ' hours')::interval
          WHEN 'days' THEN now() + (v_duration_val || ' days')::interval
        END;

        PERFORM create_next_steps(v_step.id, v_tenant_id, v_step.automation_run_id, v_node_id, v_nodes, v_edges, v_input, v_scheduled_for);
        UPDATE automation_step_runs SET status = 'completed', completed_at = now(), output = jsonb_build_object('scheduled_for', v_scheduled_for)
        WHERE id = v_step.id;

      -- ===== WAIT_UNTIL =====
      ELSIF v_step.action_type = 'wait_until' THEN
        v_scheduled_for := NULL;
        IF v_config->>'target_type' = 'specific_time' AND v_config->>'target_timestamp' IS NOT NULL THEN
          v_scheduled_for := (v_config->>'target_timestamp')::timestamptz;
        ELSIF v_config->>'target_type' = 'reservation_start' AND v_reservation_id IS NOT NULL THEN
          SELECT start_at INTO v_scheduled_for FROM reservations WHERE id = v_reservation_id;
          IF v_scheduled_for IS NOT NULL THEN
            v_duration_val := COALESCE((v_config->>'offset_value')::numeric, 0);
            v_unit := COALESCE(v_config->>'offset_unit', 'hours');
            v_scheduled_for := v_scheduled_for - CASE v_unit
              WHEN 'minutes' THEN (v_duration_val || ' minutes')::interval
              WHEN 'hours' THEN (v_duration_val || ' hours')::interval
              WHEN 'days' THEN (v_duration_val || ' days')::interval
            END;
          END IF;
        END IF;

        IF v_scheduled_for IS NULL THEN
          RAISE EXCEPTION 'Could not determine wait_until target time';
        ELSIF v_scheduled_for <= now() THEN
          PERFORM create_next_steps(v_step.id, v_tenant_id, v_step.automation_run_id, v_node_id, v_nodes, v_edges, v_input, NULL);
          UPDATE automation_step_runs SET status = 'completed', completed_at = now(), output = jsonb_build_object('scheduled_for', v_scheduled_for, 'note', 'already_past')
          WHERE id = v_step.id;
        ELSE
          PERFORM create_next_steps(v_step.id, v_tenant_id, v_step.automation_run_id, v_node_id, v_nodes, v_edges, v_input, v_scheduled_for);
          UPDATE automation_step_runs SET status = 'completed', completed_at = now(), output = jsonb_build_object('scheduled_for', v_scheduled_for)
          WHERE id = v_step.id;
        END IF;

      -- ===== STOP_WORKFLOW =====
      ELSIF v_step.action_type = 'stop_workflow' THEN
        UPDATE automation_step_runs SET status = 'completed', completed_at = now(), output = jsonb_build_object('stopped', true, 'reason', v_config->>'reason')
        WHERE id = v_step.id;
        UPDATE automation_runs SET status = 'completed', completed_at = now() WHERE id = v_step.automation_run_id;

      -- ===== CONDITION / IF_ELSE =====
      ELSIF v_step.action_type IN ('condition', 'if_else') THEN
        v_field_path := v_config->>'field_path';
        v_operator := v_config->>'operator';
        v_comparison_value := v_config->>'comparison_value';
        IF v_field_path IS NULL THEN RAISE EXCEPTION 'Condition missing field_path'; END IF;

        BEGIN
          v_actual_value := v_payload #>> string_to_array(v_field_path, '.');
        EXCEPTION WHEN OTHERS THEN
          v_actual_value := v_payload->> v_field_path;
        END;

        v_result := CASE v_operator
          WHEN 'equals' THEN v_actual_value = v_comparison_value
          WHEN 'not_equals' THEN v_actual_value != v_comparison_value
          WHEN 'greater_than' THEN COALESCE(v_actual_value::numeric, 0) > COALESCE(v_comparison_value::numeric, 0)
          WHEN 'less_than' THEN COALESCE(v_actual_value::numeric, 0) < COALESCE(v_comparison_value::numeric, 0)
          WHEN 'contains' THEN v_actual_value LIKE '%' || v_comparison_value || '%'
          WHEN 'not_contains' THEN v_actual_value NOT LIKE '%' || v_comparison_value || '%'
          WHEN 'exists' THEN v_actual_value IS NOT NULL
          WHEN 'not_exists' THEN v_actual_value IS NULL
          WHEN 'is_true' THEN v_actual_value = 'true'
          WHEN 'is_false' THEN v_actual_value = 'false'
          ELSE false
        END;

        v_branch := CASE WHEN v_result THEN 'true' ELSE 'false' END;

        UPDATE automation_step_runs SET status = 'completed', completed_at = now(),
          output = jsonb_build_object('result', v_result, 'branch', v_branch, 'field_path', v_field_path, 'actual_value', v_actual_value)
        WHERE id = v_step.id;

        PERFORM create_next_steps_with_branch(v_step.id, v_tenant_id, v_step.automation_run_id, v_node_id, v_nodes, v_edges, v_input, v_branch);

      -- ===== CREATE_IN_APP_NOTIFICATION =====
      ELSIF v_step.action_type = 'create_in_app_notification' THEN
        v_title := COALESCE(v_config->>'title', 'Notification');
        v_message := COALESCE(v_config->>'message', '');
        v_title := render_inline_template(v_title, v_tenant_id, v_reservation_id, v_customer_id);
        v_message := render_inline_template(v_message, v_tenant_id, v_reservation_id, v_customer_id);

        INSERT INTO notifications (tenant_id, type, title, message, entity_type, entity_id, priority)
        VALUES (v_tenant_id, 'workflow_notification', v_title, v_message,
          COALESCE(v_entity_type, 'reservation'), COALESCE(v_entity_id, v_reservation_id), COALESCE(v_config->>'priority', 'normal'));

        UPDATE automation_step_runs SET status = 'completed', completed_at = now(), output = jsonb_build_object('status', 'sent')
        WHERE id = v_step.id;
        PERFORM create_next_steps(v_step.id, v_tenant_id, v_step.automation_run_id, v_node_id, v_nodes, v_edges, v_input, NULL);

      -- ===== ADD_CUSTOMER_TAG =====
      ELSIF v_step.action_type = 'add_customer_tag' AND v_customer_id IS NOT NULL THEN
        v_tag := v_config->>'tag';
        IF v_tag IS NULL THEN RAISE EXCEPTION 'Missing tag'; END IF;
        SELECT tags INTO v_customer_tags FROM customers WHERE id = v_customer_id;
        IF v_customer_tags IS NULL OR NOT v_customer_tags @> ARRAY[v_tag] THEN
          UPDATE customers SET tags = COALESCE(v_customer_tags, ARRAY[]::text[]) || ARRAY[v_tag] WHERE id = v_customer_id;
        END IF;
        UPDATE automation_step_runs SET status = 'completed', completed_at = now(), output = jsonb_build_object('status', 'tagged', 'tag', v_tag)
        WHERE id = v_step.id;
        PERFORM create_next_steps(v_step.id, v_tenant_id, v_step.automation_run_id, v_node_id, v_nodes, v_edges, v_input, NULL);

      -- ===== ADD_RESERVATION_NOTE =====
      ELSIF v_step.action_type = 'add_reservation_note' AND v_reservation_id IS NOT NULL THEN
        v_message := render_inline_template(COALESCE(v_config->>'body', ''), v_tenant_id, v_reservation_id, v_customer_id);
        INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_name, metadata)
        VALUES (v_tenant_id, 'reservation', v_reservation_id, 'workflow_note', 'workflow',
          jsonb_build_object('note', v_message, 'visibility', COALESCE(v_config->>'visibility', 'internal')));
        UPDATE automation_step_runs SET status = 'completed', completed_at = now(), output = jsonb_build_object('status', 'noted')
        WHERE id = v_step.id;
        PERFORM create_next_steps(v_step.id, v_tenant_id, v_step.automation_run_id, v_node_id, v_nodes, v_edges, v_input, NULL);

      -- ===== SEND_EMAIL / SEND_SMS / SEND_WHATSAPP =====
      ELSIF v_step.action_type IN ('send_email', 'send_sms', 'send_whatsapp') THEN
        v_channel := REPLACE(v_step.action_type, 'send_', '');
        v_template_id := (v_config->>'template_id')::uuid;
        IF v_template_id IS NULL THEN RAISE EXCEPTION 'Missing template_id for %', v_step.action_type; END IF;

        SELECT check_provider_readiness_inline(v_tenant_id, v_channel) INTO v_readiness;
        IF NOT (v_readiness->>'ready')::boolean THEN
          UPDATE automation_step_runs SET status = 'action_required', completed_at = now(),
            error_message = 'Provider not ready: ' || COALESCE(v_readiness->>'reason', 'no connected integration')
          WHERE id = v_step.id;
          INSERT INTO notifications (tenant_id, type, title, message, entity_type, entity_id, priority)
          VALUES (v_tenant_id, 'provider_disconnected', 'Communication provider not connected',
            'Workflow step "' || v_step.action_type || '" could not execute because no ' || v_channel || ' provider is connected.',
            'workflow', v_workflow_id, 'high');
          INSERT INTO communication_messages (tenant_id, channel, provider, recipient, rendered_body, status, template_id, customer_id, reservation_id, workflow_id, workflow_run_id, workflow_step_run_id, idempotency_key, metadata)
          VALUES (v_tenant_id, v_channel, 'none', '', '[NOT SENT — provider not connected]', 'failed', v_template_id,
            v_customer_id, v_reservation_id, v_workflow_id, v_step.automation_run_id, v_step.id, 'msg-' || v_step.id::text,
            jsonb_build_object('status', 'action_required', 'reason', v_readiness->>'reason', 'test_mode', false))
          ON CONFLICT (idempotency_key) DO NOTHING;
          PERFORM create_next_steps(v_step.id, v_tenant_id, v_step.automation_run_id, v_node_id, v_nodes, v_edges, v_input, NULL);
        ELSE
          v_recipient := '';
          IF v_config->>'recipient_type' = 'custom' AND v_config->>'recipient_override' IS NOT NULL THEN
            v_recipient := v_config->>'recipient_override';
          ELSIF v_customer_id IS NOT NULL THEN
            IF v_channel = 'email' THEN
              SELECT email INTO v_recipient FROM customers WHERE id = v_customer_id;
            ELSE
              SELECT phone INTO v_recipient FROM customers WHERE id = v_customer_id;
            END IF;
          END IF;

          IF v_recipient = '' OR v_recipient IS NULL THEN
            UPDATE automation_step_runs SET status = 'skipped', completed_at = now(), output = jsonb_build_object('reason', 'no_recipient')
            WHERE id = v_step.id;
            PERFORM create_next_steps(v_step.id, v_tenant_id, v_step.automation_run_id, v_node_id, v_nodes, v_edges, v_input, NULL);
          ELSE
            v_classification := COALESCE(v_config->>'message_classification', 'transactional');
            IF v_customer_id IS NOT NULL AND v_classification = 'marketing' THEN
              SELECT check_consent_inline(v_customer_id, v_channel, false) INTO v_consent;
              IF NOT (v_consent->>'allowed')::boolean THEN
                INSERT INTO communication_messages (tenant_id, channel, provider, recipient, rendered_body, status, template_id, customer_id, reservation_id, workflow_id, workflow_run_id, workflow_step_run_id, idempotency_key, metadata)
                VALUES (v_tenant_id, v_channel, v_readiness->>'provider', v_recipient, '[SKIPPED — consent denied]', 'skipped', v_template_id,
                  v_customer_id, v_reservation_id, v_workflow_id, v_step.automation_run_id, v_step.id, 'msg-' || v_step.id::text,
                  jsonb_build_object('skipped_reason', v_consent->>'reason', 'test_mode', false))
                ON CONFLICT (idempotency_key) DO NOTHING;
                UPDATE automation_step_runs SET status = 'skipped', completed_at = now(), output = jsonb_build_object('reason', 'consent_denied')
                WHERE id = v_step.id;
                PERFORM create_next_steps(v_step.id, v_tenant_id, v_step.automation_run_id, v_node_id, v_nodes, v_edges, v_input, NULL);
              ELSE
                INSERT INTO communication_messages (tenant_id, channel, provider, recipient, rendered_body, status, template_id, customer_id, reservation_id, workflow_id, workflow_run_id, workflow_step_run_id, idempotency_key, metadata)
                VALUES (v_tenant_id, v_channel, v_readiness->>'provider', v_recipient, '', 'queued', v_template_id,
                  v_customer_id, v_reservation_id, v_workflow_id, v_step.automation_run_id, v_step.id, 'msg-' || v_step.id::text,
                  jsonb_build_object('message_classification', v_classification, 'test_mode', false, 'integration_id', v_readiness->>'integration_id'))
                ON CONFLICT (idempotency_key) DO NOTHING;
                UPDATE automation_step_runs SET status = 'completed', completed_at = now(), output = jsonb_build_object('status', 'queued', 'channel', v_channel, 'provider', v_readiness->>'provider')
                WHERE id = v_step.id;
                PERFORM create_next_steps(v_step.id, v_tenant_id, v_step.automation_run_id, v_node_id, v_nodes, v_edges, v_input, NULL);
              END IF;
            ELSE
              INSERT INTO communication_messages (tenant_id, channel, provider, recipient, rendered_body, status, template_id, customer_id, reservation_id, workflow_id, workflow_run_id, workflow_step_run_id, idempotency_key, metadata)
              VALUES (v_tenant_id, v_channel, v_readiness->>'provider', v_recipient, '', 'queued', v_template_id,
                v_customer_id, v_reservation_id, v_workflow_id, v_step.automation_run_id, v_step.id, 'msg-' || v_step.id::text,
                jsonb_build_object('message_classification', v_classification, 'test_mode', false, 'integration_id', v_readiness->>'integration_id'))
              ON CONFLICT (idempotency_key) DO NOTHING;
              UPDATE automation_step_runs SET status = 'completed', completed_at = now(), output = jsonb_build_object('status', 'queued', 'channel', v_channel, 'provider', v_readiness->>'provider')
              WHERE id = v_step.id;
              PERFORM create_next_steps(v_step.id, v_tenant_id, v_step.automation_run_id, v_node_id, v_nodes, v_edges, v_input, NULL);
            END IF;
          END IF;
        END IF;

      -- ===== CALL_WEBHOOK =====
      ELSIF v_step.action_type = 'call_webhook' THEN
        v_webhook_url := v_config->>'url';
        IF v_webhook_url IS NULL THEN RAISE EXCEPTION 'No webhook URL configured'; END IF;
        SELECT validate_url_ssrf(v_webhook_url) INTO v_ssrf_result;
        IF NOT (v_ssrf_result->>'allowed')::boolean THEN
          UPDATE automation_step_runs SET status = 'failed', completed_at = now(), error_message = 'Blocked URL: ' || (v_ssrf_result->>'reason')
          WHERE id = v_step.id;
          v_failed := v_failed + 1;
        ELSE
          UPDATE automation_step_runs SET status = 'action_required', completed_at = now(),
            error_message = 'Webhook call requires manual review — external outcome unknown',
            output = jsonb_build_object('url', v_webhook_url, 'hostname', split_part(split_part(v_webhook_url, '://', 2), '/', 1))
          WHERE id = v_step.id;
          INSERT INTO notifications (tenant_id, type, title, message, entity_type, entity_id, priority)
          VALUES (v_tenant_id, 'webhook_manual_review', 'Webhook requires manual review',
            'Workflow step "' || v_step.node_id || '" calls an external webhook. Manual review required before execution.',
            'workflow', v_workflow_id, 'high');
        END IF;

      -- ===== UNKNOWN ACTION =====
      ELSE
        UPDATE automation_step_runs SET status = 'failed', completed_at = now(),
          error_message = 'Unknown action type: ' || v_step.action_type
        WHERE id = v_step.id;
        v_failed := v_failed + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      IF v_step.attempt_count + 1 >= COALESCE(v_step.max_attempts, v_max_attempts) THEN
        UPDATE automation_step_runs SET status = 'dead_letter', completed_at = now(),
          error_message = SQLERRM, attempt_count = attempt_count + 1
        WHERE id = v_step.id;
        v_dead_letter := v_dead_letter + 1;
      ELSE
        UPDATE automation_step_runs SET status = 'pending', started_at = null,
          error_message = SQLERRM, attempt_count = attempt_count + 1
        WHERE id = v_step.id;
      END IF;
    END;
  END LOOP;

  -- Step 5: Process queued communication messages
  PERFORM process_queued_messages_db();

  v_duration_ms := extract(epoch from (clock_timestamp() - v_start)) * 1000;
  INSERT INTO worker_health_log (
    worker_name, invoked_at, success, processed_count, failed_count, dead_letter_count,
    duration_ms, error_message, invocation_type, invocation_id, started_at, completed_at, scheduler_job_id
  ) VALUES (
    'process-workflows', now(), true, v_processed, v_failed, v_dead_letter,
    v_duration_ms, null, 'scheduled_cron', v_invocation_id, v_start, clock_timestamp(), 'process-workflows-cron'
  );

  RETURN jsonb_build_object(
    'success', true, 'steps_processed', v_processed,
    'failed', v_failed, 'dead_letter', v_dead_letter,
    'duration_ms', v_duration_ms, 'invocation_id', v_invocation_id,
    'timestamp', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION cron_process_workflows FROM PUBLIC, anon, authenticated;
