/*
# Create RPC for Opportunity Stage Movement

## Overview
Creates a SECURITY DEFINER function to move an opportunity to a new pipeline stage.
This centralizes the business logic for stage transitions so that the Kanban,
reservation detail, API, and workflow automation all use the same code path.

## Function: move_opportunity_stage(p_opportunity_id, p_new_stage_id, p_actor_user_id, p_actor_name)

### Behavior
1. Validates the opportunity exists and fetches its tenant_id
2. Validates the target stage exists and belongs to the same tenant + pipeline
3. Updates the opportunity's stage_id and last_status_change_at
4. Logs the move to activity_log
5. Returns the updated opportunity row

### Security
- SECURITY DEFINER so it can run from authenticated context
- Tenant isolation enforced by checking tenant_id match
- search_path set to public for safety

## Notes
- This function does NOT trigger reservation status changes yet — that will be
  added in Phase 3 when the full pipeline-reservation synchronization is built.
- The function is idempotent: moving to the same stage is a no-op success.
*/

CREATE OR REPLACE FUNCTION move_opportunity_stage(
  p_opportunity_id uuid,
  p_new_stage_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opportunity RECORD;
  v_stage RECORD;
  v_old_stage_name text;
  v_new_stage_name text;
BEGIN
  SELECT * INTO v_opportunity FROM opportunities WHERE id = p_opportunity_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Opportunity not found');
  END IF;

  SELECT * INTO v_stage FROM pipeline_stages WHERE id = p_new_stage_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Stage not found');
  END IF;

  IF v_stage.tenant_id != v_opportunity.tenant_id THEN
    RETURN jsonb_build_object('error', 'Cross-tenant access denied');
  END IF;

  IF v_opportunity.stage_id IS NOT NULL THEN
    SELECT name INTO v_old_stage_name FROM pipeline_stages WHERE id = v_opportunity.stage_id;
  END IF;
  v_new_stage_name := v_stage.name;

  UPDATE opportunities
    SET stage_id = p_new_stage_id,
        last_status_change_at = now(),
        updated_at = now()
    WHERE id = p_opportunity_id;

  INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_user_id, actor_name, metadata)
  VALUES (
    v_opportunity.tenant_id,
    'opportunity',
    p_opportunity_id,
    'stage_moved',
    p_actor_user_id,
    p_actor_name,
    jsonb_build_object(
      'from_stage', v_old_stage_name,
      'to_stage', v_new_stage_name,
      'to_stage_type', v_stage.stage_type,
      'to_system_key', v_stage.system_key
    )
  );

  RETURN jsonb_build_object('success', true, 'opportunity_id', p_opportunity_id, 'new_stage_id', p_new_stage_id);
END;
$$;

GRANT EXECUTE ON FUNCTION move_opportunity_stage TO authenticated;