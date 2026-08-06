/*
# Platform Provider Secrets Vault

## Purpose
Creates a secure server-side vault for storing platform-level provider credentials
(Stripe, Resend, Google Calendar, etc.) entered by the Super Admin through the OPERAN UI.
This eliminates the need to manually configure environment variables in Vercel for each
provider credential.

## Security Architecture
- Credentials are encrypted with AES-256-GCM before persistence.
- The master encryption key (PLATFORM_SECRETS_MASTER_KEY) is the ONLY value that must be
  set as an environment variable — it is never stored in the database.
- RLS is enabled and ALL access is denied at the database level. All reads/writes go
  through the service-role key in server-side code after explicit Super Admin authorization.
- No tenant_id column exists — this is platform-level infrastructure, isolated from tenants.
- No plaintext secret column exists — only encrypted_value, encryption_iv, and authentication_tag.

## New Tables

### platform_provider_secrets
Stores encrypted provider credentials.
- id (uuid, PK)
- provider_key (text) — e.g. 'stripe', 'resend', 'google_calendar'
- secret_name (text) — e.g. 'STRIPE_SECRET_KEY', 'RESEND_API_KEY'
- encrypted_value (bytea) — AES-256-GCM encrypted value
- encryption_iv (bytea) — initialization vector for decryption
- authentication_tag (bytea) — GCM auth tag for integrity
- encryption_version (int, default 1) — supports future key rotation
- environment (text, default 'production') — 'test' or 'live' for Stripe, 'production' otherwise
- is_active (boolean, default true) — soft-delete / deactivation
- last_four (text) — last 4 chars of plaintext for masked display
- configured_by (uuid) — auth.users.id of the Super Admin who saved it
- created_at (timestamptz)
- updated_at (timestamptz)
- last_verified_at (timestamptz) — last successful verification timestamp
- verification_status (text) — 'verified', 'failed', 'unverified'
- verification_error (text) — error message from last failed verification

### platform_secret_audit_log
Append-only audit trail for all platform credential operations.
- id (uuid, PK)
- actor_id (uuid) — auth.users.id of the Super Admin
- actor_email (text) — for human-readable logs
- provider_key (text)
- action (text) — 'configured', 'replaced', 'deleted', 'test_connection', 'verification_succeeded', 'verification_failed'
- environment (text)
- result (text) — 'success' or 'failed'
- detail (text) — masked/safe context, never plaintext secrets
- created_at (timestamptz)

## Constraints
- UNIQUE(provider_key, secret_name, environment) on platform_provider_secrets
- No tenant_id column on either table

## RLS Policies
- platform_provider_secrets: RLS enabled, NO policies — service-role access only.
  The service role bypasses RLS, so all server-side code uses supabaseAdmin.
  Tenant users (anon, authenticated) have zero access.
- platform_secret_audit_log: RLS enabled, NO policies — service-role access only.

## Important Notes
1. The platform_provider_secrets table has NO RLS policies because ALL access is through
   the service-role key in server-side code. The service role bypasses RLS entirely.
   Tenant users using the anon key or authenticated users cannot read or write this table.
2. The platform_secret_audit_log table follows the same pattern — service-role only.
3. Never add policies that grant access to anon or authenticated roles on these tables.
*/

-- ── platform_provider_secrets ──
CREATE TABLE IF NOT EXISTS platform_provider_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL,
  secret_name text NOT NULL,
  encrypted_value bytea NOT NULL,
  encryption_iv bytea NOT NULL,
  authentication_tag bytea NOT NULL,
  encryption_version integer NOT NULL DEFAULT 1,
  environment text NOT NULL DEFAULT 'production',
  is_active boolean NOT NULL DEFAULT true,
  last_four text,
  configured_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  verification_status text DEFAULT 'unverified',
  verification_error text
);

-- Unique constraint: one active secret per provider/secret_name/environment
CREATE UNIQUE INDEX IF NOT EXISTS uniq_platform_secrets_provider_secret_env
  ON platform_provider_secrets (provider_key, secret_name, environment)
  WHERE is_active = true;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_platform_secrets_provider
  ON platform_provider_secrets (provider_key, environment, is_active);

-- ── platform_secret_audit_log ──
CREATE TABLE IF NOT EXISTS platform_secret_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  provider_key text NOT NULL,
  action text NOT NULL,
  environment text,
  result text NOT NULL DEFAULT 'success',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_provider
  ON platform_secret_audit_log (provider_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_actor
  ON platform_secret_audit_log (actor_id, created_at DESC);

-- ── RLS: Deny all access to non-service-role users ──
ALTER TABLE platform_provider_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_secret_audit_log ENABLE ROW LEVEL SECURITY;

-- No policies are created. The service role bypasses RLS.
-- This means anon and authenticated roles have ZERO access to these tables.
-- All reads and writes go through server-side code using supabaseAdmin (service-role key).

-- ── Grant access only to the service role (already has bypass) ──
-- The service role already bypasses RLS by default in Supabase.
-- No additional grants are needed.

-- ── Audit log trigger for platform_provider_secrets ──
-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_platform_secret_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_secret_updated_at ON platform_provider_secrets;
CREATE TRIGGER trg_platform_secret_updated_at
  BEFORE UPDATE ON platform_provider_secrets
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_secret_updated_at();
