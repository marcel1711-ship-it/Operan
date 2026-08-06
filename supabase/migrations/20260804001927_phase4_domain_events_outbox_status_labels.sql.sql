-- ============================================================
-- Phase 4 Migration 1: Domain Events, Outbox, Status Labels
-- ============================================================

-- 1. Domain Events (append-only, tenant-scoped)
CREATE TABLE IF NOT EXISTS domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  reservation_id uuid,
  customer_id uuid,
  opportunity_id uuid,
  payment_id uuid,
  event_version int NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  correlation_id uuid DEFAULT gen_random_uuid(),
  causation_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;

-- Append-only: authenticated can INSERT, SELECT; NO UPDATE, NO DELETE
CREATE POLICY "domain_events_select" ON domain_events FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "domain_events_insert" ON domain_events FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

-- No UPDATE or DELETE policies — append-only by design

CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_events_idempotency
  ON domain_events (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_type
  ON domain_events (tenant_id, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_entity
  ON domain_events (tenant_id, entity_type, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_reservation
  ON domain_events (tenant_id, reservation_id, occurred_at DESC)
  WHERE reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_domain_events_correlation
  ON domain_events (correlation_id);

-- 2. Transactional Outbox
CREATE TABLE IF NOT EXISTS event_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  domain_event_id uuid NOT NULL REFERENCES domain_events(id) ON DELETE CASCADE,
  topic text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempt_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;

-- Outbox is managed only by SECURITY DEFINER functions; no direct tenant access
CREATE POLICY "event_outbox_select_super" ON event_outbox FOR SELECT
  TO authenticated USING (is_super_admin());

-- No INSERT/UPDATE/DELETE for authenticated — only via SECURITY DEFINER

CREATE INDEX IF NOT EXISTS idx_event_outbox_status_available
  ON event_outbox (status, available_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_event_outbox_tenant
  ON event_outbox (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_event_outbox_event
  ON event_outbox (domain_event_id);

-- 3. Reservation Status Labels (tenant-customizable terminology)
CREATE TABLE IF NOT EXISTS reservation_status_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status_key text NOT NULL,
  display_label text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#6b7280',
  is_visible_to_customer boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reservation_status_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "status_labels_select" ON reservation_status_labels FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "status_labels_insert" ON reservation_status_labels FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "status_labels_update" ON reservation_status_labels FOR UPDATE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

CREATE POLICY "status_labels_delete" ON reservation_status_labels FOR DELETE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

CREATE UNIQUE INDEX IF NOT EXISTS idx_status_labels_tenant_key
  ON reservation_status_labels (tenant_id, status_key);

-- 4. Seed default status labels for all existing tenants
INSERT INTO reservation_status_labels (tenant_id, status_key, display_label, description, color, is_visible_to_customer, sort_order)
SELECT t.id, s.status_key, s.display_label, s.description, s.color, s.is_visible_to_customer, s.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('inquiry', 'Inquiry', 'Customer made an inquiry', '#6b7280', true, 0),
  ('pending', 'Pending', 'Booking request awaiting approval', '#f59e0b', true, 1),
  ('awaiting_payment', 'Awaiting Payment', 'Booking held, awaiting payment', '#3b82f6', true, 2),
  ('confirmed', 'Confirmed', 'Booking is confirmed', '#10b981', true, 3),
  ('in_progress', 'In Progress', 'Service is in progress', '#8b5cf6', true, 4),
  ('completed', 'Completed', 'Service has been completed', '#059669', true, 5),
  ('cancelled', 'Cancelled', 'Booking was cancelled', '#ef4444', true, 6),
  ('expired', 'Expired', 'Booking hold expired without payment', '#94a3b8', true, 7),
  ('no_show', 'No Show', 'Customer did not show up', '#dc2626', true, 8)
) AS s(status_key, display_label, description, color, is_visible_to_customer, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM reservation_status_labels rsl
  WHERE rsl.tenant_id = t.id AND rsl.status_key = s.status_key
);

-- 5. Helper: emit_domain_event — SECURITY DEFINER for safe event emission inside transactions
CREATE OR REPLACE FUNCTION emit_domain_event(
  p_tenant_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_reservation_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_opportunity_id uuid DEFAULT NULL,
  p_payment_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_causation_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO domain_events (
    tenant_id, event_type, entity_type, entity_id,
    payload, reservation_id, customer_id, opportunity_id, payment_id,
    idempotency_key, causation_id, occurred_at
  ) VALUES (
    p_tenant_id, p_event_type, p_entity_type, p_entity_id,
    p_payload, p_reservation_id, p_customer_id, p_opportunity_id, p_payment_id,
    p_idempotency_key, p_causation_id, now()
  )
  ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION emit_domain_event TO authenticated;

-- 6. Helper: emit_outbox_entry — creates outbox record linked to a domain event
CREATE OR REPLACE FUNCTION emit_outbox_entry(
  p_tenant_id uuid,
  p_domain_event_id uuid,
  p_topic text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_outbox_id uuid;
BEGIN
  INSERT INTO event_outbox (tenant_id, domain_event_id, topic, payload, status, available_at)
  VALUES (p_tenant_id, p_domain_event_id, p_topic, p_payload, 'pending', now())
  RETURNING id INTO v_outbox_id;

  RETURN v_outbox_id;
END;
$$;

GRANT EXECUTE ON FUNCTION emit_outbox_entry TO authenticated;
