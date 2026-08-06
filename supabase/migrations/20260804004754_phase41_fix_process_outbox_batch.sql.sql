-- Fix process_outbox_batch: the RETURNING clause was producing invalid JSON
-- when casting multiple columns to a single jsonb variable
CREATE OR REPLACE FUNCTION public.process_outbox_batch(
  p_batch_size integer DEFAULT 10,
  p_worker_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_processed_count int := 0;
  v_failed_count int := 0;
BEGIN
  -- Lock and fetch pending items using FOR UPDATE SKIP LOCKED
  FOR v_item IN
    SELECT id, tenant_id, domain_event_id, topic, payload
    FROM event_outbox
    WHERE status = 'pending' AND available_at <= now()
    ORDER BY available_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Mark as processing
    UPDATE event_outbox SET
      status = 'processing',
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
    WHERE id = v_item.id;

    BEGIN
      -- Internal handlers based on topic
      IF v_item.topic = 'activity.log' THEN
        INSERT INTO activity_log (tenant_id, entity_type, entity_id, action, actor_name, metadata)
        VALUES (
          v_item.tenant_id,
          COALESCE(v_item.payload->>'entity_type', 'system'),
          COALESCE((v_item.payload->>'entity_id')::uuid, NULL),
          COALESCE(v_item.payload->>'action', 'system_event'),
          'system',
          v_item.payload
        );
      ELSIF v_item.topic = 'notification.create' THEN
        INSERT INTO notifications (tenant_id, type, title, message, entity_type, entity_id, priority)
        VALUES (
          v_item.tenant_id,
          COALESCE(v_item.payload->>'type', 'system'),
          CASE v_item.payload->>'type'
            WHEN 'payment_received' THEN 'Payment Received'
            WHEN 'payment_failed' THEN 'Payment Failed'
            WHEN 'reservation_confirmed' THEN 'Reservation Confirmed'
            WHEN 'reservation_cancelled' THEN 'Reservation Cancelled'
            WHEN 'refund_completed' THEN 'Refund Completed'
            WHEN 'stripe_action_required' THEN 'Stripe Action Required'
            WHEN 'webhook_processing_failed' THEN 'Background Processing Failed'
            ELSE 'System Notification'
          END,
          COALESCE(v_item.payload->>'message', ''),
          COALESCE(v_item.payload->>'entity_type', 'reservation'),
          COALESCE((v_item.payload->>'entity_id')::uuid, (v_item.payload->>'reservation_id')::uuid),
          COALESCE(v_item.payload->>'priority', 'normal')
        );
      ELSIF v_item.topic = 'opportunity.sync' THEN
        PERFORM sync_opportunity_for_reservation(
          COALESCE((v_item.payload->>'reservation_id')::uuid, NULL)
        );
      END IF;

      -- Mark as completed
      UPDATE event_outbox SET
        status = 'completed',
        processed_at = now(),
        updated_at = now()
      WHERE id = v_item.id;

      v_processed_count := v_processed_count + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE event_outbox SET
        status = CASE WHEN attempt_count + 1 >= max_attempts THEN 'dead_letter' ELSE 'pending' END,
        attempt_count = attempt_count + 1,
        last_error = SQLERRM,
        available_at = now() + (interval '1 minute' * LEAST(attempt_count + 1, 10)),
        locked_at = NULL,
        locked_by = NULL,
        updated_at = now()
      WHERE id = v_item.id;

      v_failed_count := v_failed_count + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('processed', v_processed_count, 'failed', v_failed_count);
END;
$$;

-- Keep internal-only
REVOKE EXECUTE ON FUNCTION public.process_outbox_batch(integer,text) FROM PUBLIC, anon, authenticated;
