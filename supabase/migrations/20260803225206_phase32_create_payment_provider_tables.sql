/*
# Phase 3.2: Provider-Neutral Payment Connection Architecture

## Purpose
Creates a provider-neutral payment connection system supporting:
1. Platform payment connections (Super Admin's own account for SaaS billing)
2. Tenant payment provider connections (each tenant's own account for booking revenue)

Provider-agnostic — Stripe is the first adapter, but the schema supports PayPal,
Mercado Pago, Adyen, Square, and other future providers without schema changes.

## Security
- No secret keys, access tokens, or refresh tokens stored in database columns
- Only non-sensitive metadata stored (external account ID, status, capabilities)
- Sensitive credentials stored in edge function secrets (server-only) when activated
- Super Admin views connection health but cannot see tenant credentials
- RLS: tenants see only their own connections, Super Admin sees all

## New Tables
1. platform_payment_connections — Super Admin's payment provider (SaaS billing only)
2. payment_provider_connections — Per-tenant payment provider (booking revenue)
3. platform_fee_config — Platform fee configuration (Super Admin)

## RLS
- platform_payment_connections: Super Admin only (all CRUD)
- payment_provider_connections: Super Admin sees all; tenant admin sees/edits own only
- platform_fee_config: Super Admin only (all CRUD)

## Functions
- get_tenant_payment_connection(tenant_id) — returns active connection status
- get_platform_payment_status() — returns platform connection status
*/

-- ============================================================
-- 1. Platform Payment Connections (Super Admin's own account)
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_payment_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_guard boolean NOT NULL DEFAULT true,
  provider text NOT NULL DEFAULT 'stripe',
  environment text NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'live')),
  connection_status text NOT NULL DEFAULT 'not_configured'
    CHECK (connection_status IN ('not_configured', 'connecting', 'connected', 'requires_action', 'disconnected', 'error')),
  external_account_id text,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  requirements_pending text[] NOT NULL DEFAULT '{}',
  default_currency text NOT NULL DEFAULT 'USD',
  webhook_status text NOT NULL DEFAULT 'not_configured'
    CHECK (webhook_status IN ('not_configured', 'active', 'failing', 'disabled')),
  webhook_last_event_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_payment_singleton
  ON platform_payment_connections (singleton_guard) WHERE singleton_guard = true;

ALTER TABLE platform_payment_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_select_platform_payments" ON platform_payment_connections;
CREATE POLICY "sa_select_platform_payments"
  ON platform_payment_connections FOR SELECT
  TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "sa_insert_platform_payments" ON platform_payment_connections;
CREATE POLICY "sa_insert_platform_payments"
  ON platform_payment_connections FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sa_update_platform_payments" ON platform_payment_connections;
CREATE POLICY "sa_update_platform_payments"
  ON platform_payment_connections FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sa_delete_platform_payments" ON platform_payment_connections;
CREATE POLICY "sa_delete_platform_payments"
  ON platform_payment_connections FOR DELETE
  TO authenticated USING (is_super_admin());

-- ============================================================
-- 2. Tenant Payment Provider Connections
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe',
  environment text NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'live')),
  connection_status text NOT NULL DEFAULT 'not_configured'
    CHECK (connection_status IN ('not_configured', 'connecting', 'connected', 'requires_action', 'disconnected', 'error')),
  external_account_id text,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  requirements_pending text[] NOT NULL DEFAULT '{}',
  default_currency text NOT NULL DEFAULT 'USD',
  is_default boolean NOT NULL DEFAULT true,
  booking_payments_enabled boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ppc_tenant_provider
  ON payment_provider_connections (tenant_id, provider);

CREATE INDEX IF NOT EXISTS idx_ppc_tenant_id
  ON payment_provider_connections (tenant_id);

ALTER TABLE payment_provider_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_payment_connections" ON payment_provider_connections;
CREATE POLICY "select_own_payment_connections"
  ON payment_provider_connections FOR SELECT
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

DROP POLICY IF EXISTS "insert_own_payment_connections" ON payment_provider_connections;
CREATE POLICY "insert_own_payment_connections"
  ON payment_provider_connections FOR INSERT
  TO authenticated WITH CHECK (
    is_super_admin() OR (tenant_id = current_tenant_id())
  );

DROP POLICY IF EXISTS "update_own_payment_connections" ON payment_provider_connections;
CREATE POLICY "update_own_payment_connections"
  ON payment_provider_connections FOR UPDATE
  TO authenticated
  USING (is_super_admin() OR tenant_id = current_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = current_tenant_id());

DROP POLICY IF EXISTS "delete_own_payment_connections" ON payment_provider_connections;
CREATE POLICY "delete_own_payment_connections"
  ON payment_provider_connections FOR DELETE
  TO authenticated USING (
    is_super_admin() OR tenant_id = current_tenant_id()
  );

-- ============================================================
-- 3. Platform Fee Configuration (Super Admin)
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_fee_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_guard boolean NOT NULL DEFAULT true,
  fee_type text NOT NULL DEFAULT 'percentage'
    CHECK (fee_type IN ('percentage', 'fixed', 'none')),
  fee_percentage numeric(5,2) NOT NULL DEFAULT 0,
  fee_fixed_amount numeric(10,2) NOT NULL DEFAULT 0,
  fee_currency text NOT NULL DEFAULT 'USD',
  apply_to text NOT NULL DEFAULT 'all_providers'
    CHECK (apply_to IN ('all_providers', 'stripe_only', 'custom')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_fee_singleton
  ON platform_fee_config (singleton_guard) WHERE singleton_guard = true;

ALTER TABLE platform_fee_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_select_platform_fee" ON platform_fee_config;
CREATE POLICY "sa_select_platform_fee"
  ON platform_fee_config FOR SELECT
  TO authenticated USING (is_super_admin());

DROP POLICY IF EXISTS "sa_insert_platform_fee" ON platform_fee_config;
CREATE POLICY "sa_insert_platform_fee"
  ON platform_fee_config FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sa_update_platform_fee" ON platform_fee_config;
CREATE POLICY "sa_update_platform_fee"
  ON platform_fee_config FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "sa_delete_platform_fee" ON platform_fee_config;
CREATE POLICY "sa_delete_platform_fee"
  ON platform_fee_config FOR DELETE
  TO authenticated USING (is_super_admin());

-- ============================================================
-- 4. Helper Functions
-- ============================================================

CREATE OR REPLACE FUNCTION get_tenant_payment_connection(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'has_connection', EXISTS (
      SELECT 1 FROM payment_provider_connections
      WHERE tenant_id = p_tenant_id
        AND connection_status = 'connected'
        AND charges_enabled = true
        AND booking_payments_enabled = true
    ),
    'connection', (
      SELECT jsonb_build_object(
        'id', ppc.id,
        'provider', ppc.provider,
        'connection_status', ppc.connection_status,
        'charges_enabled', ppc.charges_enabled,
        'payouts_enabled', ppc.payouts_enabled,
        'booking_payments_enabled', ppc.booking_payments_enabled,
        'default_currency', ppc.default_currency,
        'external_account_id', ppc.external_account_id
      )
      FROM payment_provider_connections ppc
      WHERE ppc.tenant_id = p_tenant_id
        AND ppc.connection_status = 'connected'
        AND ppc.charges_enabled = true
        AND ppc.booking_payments_enabled = true
      ORDER BY ppc.is_default DESC, ppc.created_at ASC
      LIMIT 1
    )
  )
$$;

GRANT EXECUTE ON FUNCTION get_tenant_payment_connection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_payment_connection(uuid) TO anon;

CREATE OR REPLACE FUNCTION get_platform_payment_status()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
      'is_configured', true,
      'provider', ppc.provider,
      'environment', ppc.environment,
      'connection_status', ppc.connection_status,
      'charges_enabled', ppc.charges_enabled,
      'payouts_enabled', ppc.payouts_enabled,
      'webhook_status', ppc.webhook_status
    )
    FROM platform_payment_connections ppc
    WHERE ppc.connection_status IN ('connected', 'connecting', 'requires_action')
    LIMIT 1),
    jsonb_build_object('is_configured', false)
  )
$$;

GRANT EXECUTE ON FUNCTION get_platform_payment_status() TO authenticated;

-- ============================================================
-- 5. updated_at triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_payment_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_payment_updated ON platform_payment_connections;
CREATE TRIGGER trg_platform_payment_updated
  BEFORE UPDATE ON platform_payment_connections
  FOR EACH ROW EXECUTE FUNCTION update_payment_timestamps();

DROP TRIGGER IF EXISTS trg_ppc_updated ON payment_provider_connections;
CREATE TRIGGER trg_ppc_updated
  BEFORE UPDATE ON payment_provider_connections
  FOR EACH ROW EXECUTE FUNCTION update_payment_timestamps();

DROP TRIGGER IF EXISTS trg_platform_fee_updated ON platform_fee_config;
CREATE TRIGGER trg_platform_fee_updated
  BEFORE UPDATE ON platform_fee_config
  FOR EACH ROW EXECUTE FUNCTION update_payment_timestamps();
