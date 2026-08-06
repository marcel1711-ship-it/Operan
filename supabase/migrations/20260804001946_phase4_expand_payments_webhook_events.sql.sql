-- ============================================================
-- Phase 4 Migration 2: Expand payments + webhook_events
-- ============================================================

-- 1. Expand payments table
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS integration_id uuid,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'test',
  ADD COLUMN IF NOT EXISTS provider_charge_id text,
  ADD COLUMN IF NOT EXISTS provider_refund_id text,
  ADD COLUMN IF NOT EXISTS provider_customer_id text,
  ADD COLUMN IF NOT EXISTS platform_fee_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_fee_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_code text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

-- Unique idempotency key prevents duplicate payment creation
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency
  ON payments (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Unique checkout session ID prevents duplicate checkout
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_checkout_session
  ON payments (provider_checkout_session_id)
  WHERE provider_checkout_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_integration
  ON payments (integration_id)
  WHERE integration_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_provider_charge
  ON payments (provider_charge_id)
  WHERE provider_charge_id IS NOT NULL;

-- Add FK from payments.integration_id to tenant_integrations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_integration_id_fkey') THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_integration_id_fkey
      FOREIGN KEY (integration_id) REFERENCES tenant_integrations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Expand webhook_events table
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'test',
  ADD COLUMN IF NOT EXISTS tenant_id uuid,
  ADD COLUMN IF NOT EXISTS integration_id uuid,
  ADD COLUMN IF NOT EXISTS reservation_id uuid,
  ADD COLUMN IF NOT EXISTS payment_id uuid,
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS safe_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

-- Rename event_id to provider_event_id for clarity
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='webhook_events' AND column_name='event_id') THEN
    ALTER TABLE webhook_events RENAME COLUMN event_id TO provider_event_id;
  END IF;
END $$;

-- Drop old unique constraint on event_id and create new on (provider, environment, provider_event_id)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhook_events_event_id_key') THEN
    ALTER TABLE webhook_events DROP CONSTRAINT webhook_events_event_id_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_provider_env_event
  ON webhook_events (provider, environment, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_events_processing
  ON webhook_events (processing_status, created_at)
  WHERE processing_status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant
  ON webhook_events (tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

-- 3. RLS: Lock down payments — no direct INSERT/UPDATE/DELETE for authenticated
-- Payments should only be created/modified via SECURITY DEFINER functions
DROP POLICY IF EXISTS delete_payments ON payments;
DROP POLICY IF EXISTS insert_payments ON payments;
DROP POLICY IF EXISTS update_payments ON payments;

-- Keep SELECT for authenticated (tenant-scoped via existing policy or add explicit one)
CREATE POLICY "payments_select" ON payments FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- No INSERT/UPDATE/DELETE for authenticated — only via SECURITY DEFINER
-- Super admin can do everything
CREATE POLICY "payments_super_admin_all" ON payments FOR ALL
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- 4. RLS: Lock down webhook_events — no direct access for authenticated
-- Only super admin can SELECT; no INSERT/UPDATE/DELETE for anyone except SECURITY DEFINER
DROP POLICY IF EXISTS webhook_events_select ON webhook_events;

CREATE POLICY "webhook_events_super_admin_select" ON webhook_events FOR SELECT
  TO authenticated USING (is_super_admin());

-- 5. Revoke anon grants on sensitive tables
REVOKE ALL ON payments FROM anon;
REVOKE ALL ON webhook_events FROM anon;
REVOKE ALL ON domain_events FROM anon;
REVOKE ALL ON event_outbox FROM anon;
REVOKE ALL ON reservation_status_labels FROM anon;

-- 6. Grant SELECT on reservation_status_labels to anon for public booking pages
-- (public pages need to display customer-facing status labels)
GRANT SELECT ON reservation_status_labels TO anon;
