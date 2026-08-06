/*
# Create waiver templates and signed waivers tables

1. New Tables
- `waiver_templates`
  - `id` (uuid, primary key)
  - `tenant_id` (uuid, FK to tenants)
  - `title` (text, not null) — descriptive name e.g. "Rental Agreement", "Liability Waiver"
  - `slug` (text, not null) — unique per tenant, used in public URL
  - `html_content` (text, not null) — the full HTML document the tenant pastes
  - `is_active` (boolean, default true)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
- `signed_waivers`
  - `id` (uuid, primary key)
  - `tenant_id` (uuid, FK to tenants)
  - `template_id` (uuid, FK to waiver_templates)
  - `reservation_id` (uuid, FK to reservations, nullable)
  - `signer_name` (text, not null)
  - `signer_email` (text, nullable)
  - `signature_data_url` (text, not null) — base64 PNG of drawn signature
  - `signed_at` (timestamptz, default now())
  - `ip_address` (text, nullable)
  - `html_snapshot` (text, not null) — copy of the HTML at time of signing (immutable record)

2. Security
- Enable RLS on both tables.
- waiver_templates: tenant admins can CRUD their own templates; anon can SELECT active templates (for public signing link).
- signed_waivers: anon can INSERT (signing is public); tenant admins can SELECT their own; no UPDATE/DELETE (immutable legal record).
*/

CREATE TABLE IF NOT EXISTS waiver_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  html_content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

ALTER TABLE waiver_templates ENABLE ROW LEVEL SECURITY;

-- Tenant users can select their own templates
DROP POLICY IF EXISTS "select_own_waiver_templates" ON waiver_templates;
CREATE POLICY "select_own_waiver_templates"
  ON waiver_templates FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    OR tenant_id IN (
      SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid()
    )
  );

-- Anon can select active templates (for public signing page, filtered by slug in query)
DROP POLICY IF EXISTS "anon_select_active_waiver_templates" ON waiver_templates;
CREATE POLICY "anon_select_active_waiver_templates"
  ON waiver_templates FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Tenant users can insert their own templates
DROP POLICY IF EXISTS "insert_own_waiver_templates" ON waiver_templates;
CREATE POLICY "insert_own_waiver_templates"
  ON waiver_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin()
    OR tenant_id IN (
      SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid()
    )
  );

-- Tenant users can update their own templates
DROP POLICY IF EXISTS "update_own_waiver_templates" ON waiver_templates;
CREATE POLICY "update_own_waiver_templates"
  ON waiver_templates FOR UPDATE
  TO authenticated
  USING (
    is_super_admin()
    OR tenant_id IN (
      SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR tenant_id IN (
      SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid()
    )
  );

-- Tenant users can delete their own templates
DROP POLICY IF EXISTS "delete_own_waiver_templates" ON waiver_templates;
CREATE POLICY "delete_own_waiver_templates"
  ON waiver_templates FOR DELETE
  TO authenticated
  USING (
    is_super_admin()
    OR tenant_id IN (
      SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid()
    )
  );

-- Signed waivers table
CREATE TABLE IF NOT EXISTS signed_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES waiver_templates(id) ON DELETE CASCADE,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  signer_name text NOT NULL,
  signer_email text,
  signature_data_url text NOT NULL,
  signed_at timestamptz DEFAULT now(),
  ip_address text,
  html_snapshot text NOT NULL
);

ALTER TABLE signed_waivers ENABLE ROW LEVEL SECURITY;

-- Anon can insert signed waivers (public signing)
DROP POLICY IF EXISTS "anon_insert_signed_waivers" ON signed_waivers;
CREATE POLICY "anon_insert_signed_waivers"
  ON signed_waivers FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Tenant users can select their own signed waivers
DROP POLICY IF EXISTS "select_own_signed_waivers" ON signed_waivers;
CREATE POLICY "select_own_signed_waivers"
  ON signed_waivers FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    OR tenant_id IN (
      SELECT tenant_users.tenant_id FROM tenant_users WHERE tenant_users.user_id = auth.uid()
    )
  );

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_waiver_templates_tenant ON waiver_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_signed_waivers_tenant ON signed_waivers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_signed_waivers_template ON signed_waivers(template_id);
