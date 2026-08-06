/*
# Create Availability, Payments, Webhook Events, and Notifications Tables

## Overview
Creates the remaining infrastructure tables for the booking flow:
- listing_operating_hours: when a listing is available by day of week
- listing_blocks: manual/maintenance blocks that prevent bookings
- payments: payment ledger per reservation
- webhook_events: idempotent webhook processing
- notifications: in-app notifications for tenant users

## New Tables

### listing_operating_hours
- id, tenant_id, listing_id, day_of_week (0-6), start_time (time), end_time (time)
- is_active, valid_from, valid_until, created_at, updated_at
- Supports multiple periods per day (e.g. 9:00-13:00 and 15:00-20:00)

### listing_blocks
- id, tenant_id, listing_id, start_at, end_at, reason, block_type
- source, external_reference, created_by, created_at, updated_at
- block_type: maintenance, owner_use, weather, manual, external_booking, private_event, other

### payments
- id, tenant_id, reservation_id, customer_id, payment_type, provider
- provider_payment_id, provider_checkout_session_id, amount, currency, status
- refunded_amount, failure_reason, metadata, paid_at, refunded_at, created_at, updated_at
- payment_type: deposit, balance, full_payment, manual, refund, adjustment
- status: pending, succeeded, failed, partially_refunded, refunded, cancelled

### webhook_events
- id (uuid PK), event_id (text UNIQUE — Stripe event ID), event_type, provider
- payload (jsonb), processed_at, created_at
- Prevents duplicate webhook processing

### notifications
- id, tenant_id, user_id, type, title, message, entity_type, entity_id
- priority, read_at, created_at

## Security
- All tables RLS enabled, tenant-isolated
- listing_operating_hours and listing_blocks: public SELECT for active listings (anon can see availability)
- payments: tenant-only, no anon access
- webhook_events: no direct client access (service role only) — no policies for anon/authenticated
- notifications: tenant user can see their own
*/

-- ============================================
-- 1. LISTING_OPERATING_HOURS
-- ============================================

CREATE TABLE IF NOT EXISTS listing_operating_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE listing_operating_hours ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_operating_hours_listing ON listing_operating_hours(listing_id);
CREATE INDEX IF NOT EXISTS idx_operating_hours_tenant ON listing_operating_hours(tenant_id);

-- Public can see operating hours for active listings
DROP POLICY IF EXISTS "public_select_operating_hours" ON listing_operating_hours;
CREATE POLICY "public_select_operating_hours" ON listing_operating_hours FOR SELECT
  TO anon, authenticated USING (
    is_active = true AND listing_id IN (
      SELECT listings.id FROM listings WHERE listings.is_active = true
    )
  );

DROP POLICY IF EXISTS "auth_select_operating_hours" ON listing_operating_hours;
CREATE POLICY "auth_select_operating_hours" ON listing_operating_hours FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "insert_operating_hours" ON listing_operating_hours;
CREATE POLICY "insert_operating_hours" ON listing_operating_hours FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "update_operating_hours" ON listing_operating_hours;
CREATE POLICY "update_operating_hours" ON listing_operating_hours FOR UPDATE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "delete_operating_hours" ON listing_operating_hours;
CREATE POLICY "delete_operating_hours" ON listing_operating_hours FOR DELETE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================
-- 2. LISTING_BLOCKS
-- ============================================

CREATE TABLE IF NOT EXISTS listing_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text,
  block_type text NOT NULL DEFAULT 'manual' CHECK (block_type IN (
    'maintenance', 'owner_use', 'weather', 'manual',
    'external_booking', 'private_event', 'other'
  )),
  source text NOT NULL DEFAULT 'manual',
  external_reference text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE listing_blocks ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_blocks_listing ON listing_blocks(listing_id);
CREATE INDEX IF NOT EXISTS idx_blocks_tenant ON listing_blocks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_blocks_start ON listing_blocks(start_at);

-- Public can see blocks for active listings (to show unavailable dates)
DROP POLICY IF EXISTS "public_select_blocks" ON listing_blocks;
CREATE POLICY "public_select_blocks" ON listing_blocks FOR SELECT
  TO anon, authenticated USING (
    listing_id IN (SELECT listings.id FROM listings WHERE listings.is_active = true)
  );

DROP POLICY IF EXISTS "auth_select_blocks" ON listing_blocks;
CREATE POLICY "auth_select_blocks" ON listing_blocks FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "insert_blocks" ON listing_blocks;
CREATE POLICY "insert_blocks" ON listing_blocks FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "update_blocks" ON listing_blocks;
CREATE POLICY "update_blocks" ON listing_blocks FOR UPDATE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "delete_blocks" ON listing_blocks;
CREATE POLICY "delete_blocks" ON listing_blocks FOR DELETE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================
-- 3. PAYMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  payment_type text NOT NULL DEFAULT 'deposit' CHECK (payment_type IN (
    'deposit', 'balance', 'full_payment', 'manual', 'refund', 'adjustment'
  )),
  provider text NOT NULL DEFAULT 'stripe',
  provider_payment_id text,
  provider_checkout_session_id text,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'succeeded', 'failed', 'partially_refunded', 'refunded', 'cancelled'
  )),
  refunded_amount numeric(10,2) NOT NULL DEFAULT 0,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_reservation ON payments(reservation_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_provider_id ON payments(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

DROP POLICY IF EXISTS "select_payments" ON payments;
CREATE POLICY "select_payments" ON payments FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "insert_payments" ON payments;
CREATE POLICY "insert_payments" ON payments FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "update_payments" ON payments;
CREATE POLICY "update_payments" ON payments FOR UPDATE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "delete_payments" ON payments;
CREATE POLICY "delete_payments" ON payments FOR DELETE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================
-- 4. WEBHOOK_EVENTS (idempotency)
-- ============================================

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  event_type text NOT NULL,
  provider text NOT NULL DEFAULT 'stripe',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated — only service role can access
-- Service role bypasses RLS

-- ============================================
-- 5. NOTIFICATIONS
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  entity_type text,
  entity_id uuid,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(tenant_id, user_id)
  WHERE read_at IS NULL;

DROP POLICY IF EXISTS "select_notifications" ON notifications;
CREATE POLICY "select_notifications" ON notifications FOR SELECT
  TO authenticated USING (
    is_super_admin()
    OR (tenant_id = current_tenant_id() AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_notifications" ON notifications;
CREATE POLICY "insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "update_notifications" ON notifications;
CREATE POLICY "update_notifications" ON notifications FOR UPDATE
  TO authenticated USING (
    is_super_admin()
    OR (tenant_id = current_tenant_id() AND user_id = auth.uid())
  )
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "delete_notifications" ON notifications;
CREATE POLICY "delete_notifications" ON notifications FOR DELETE
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- ============================================
-- 6. UPDATED_AT TRIGGERS
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_operating_hours_updated_at') THEN
    CREATE TRIGGER trigger_operating_hours_updated_at
      BEFORE UPDATE ON listing_operating_hours
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_blocks_updated_at') THEN
    CREATE TRIGGER trigger_blocks_updated_at
      BEFORE UPDATE ON listing_blocks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_payments_updated_at') THEN
    CREATE TRIGGER trigger_payments_updated_at
      BEFORE UPDATE ON payments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;