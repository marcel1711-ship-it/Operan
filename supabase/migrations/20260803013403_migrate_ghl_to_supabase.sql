/*
# Migrate full GHL data to Supabase

1. Purpose
   Previously only reservations were stored in Supabase. Now we migrate
   ALL GoHighLevel data — opportunities, contacts, pipeline stages, and
   reservations — so the dashboard reads everything from Supabase instead
   of calling the GHL proxy on every page load.

2. New Tables

   ghl_pipeline_stages
   - id (text, PK) — GHL stage ID
   - name (text)
   - order (int)
   - pipeline_id (text)
   - pipeline_name (text)

   ghl_opportunities
   - id (text, PK) — GHL opportunity ID
   - name (text) — opportunity name (includes charter details)
   - pipeline_id (text)
   - stage_id (text)
   - status (text) — open | won | lost | abandoned
   - contact_id (text)
   - contact_name (text)
   - contact_email (text, nullable)
   - contact_phone (text, nullable)
   - contact_company (text, nullable)
   - contact_tags (text[], default '{}')
   - monetary_value (numeric, default 0)
   - assigned_to (text, nullable)
   - last_status_change_at (timestamptz, nullable)
   - created_at (timestamptz)
   - updated_at (timestamptz)
   - synced_at (timestamptz, default now()) — last sync from GHL

   ghl_contacts
   - id (text, PK) — GHL contact ID
   - first_name (text)
   - last_name (text)
   - email (text, nullable)
   - phone (text, nullable)
   - company_name (text, nullable)
   - tags (text[], default '{}')
   - date_added (timestamptz)
   - last_activity_date (timestamptz, nullable)
   - synced_at (timestamptz, default now())

   reservations (already exists — add ghl_contact_id column)
   - ghl_contact_id (text, nullable) — FK reference to ghl_contacts

3. Security
   - RLS enabled on all new tables.
   - Single-tenant app (no sign-in) → anon + authenticated CRUD.
*/

CREATE TABLE IF NOT EXISTS ghl_pipeline_stages (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  "order" integer NOT NULL DEFAULT 0,
  pipeline_id text NOT NULL DEFAULT '',
  pipeline_name text NOT NULL DEFAULT ''
);

ALTER TABLE ghl_pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_stages" ON ghl_pipeline_stages;
CREATE POLICY "anon_select_stages"
  ON ghl_pipeline_stages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_stages" ON ghl_pipeline_stages;
CREATE POLICY "anon_insert_stages"
  ON ghl_pipeline_stages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_stages" ON ghl_pipeline_stages;
CREATE POLICY "anon_update_stages"
  ON ghl_pipeline_stages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_stages" ON ghl_pipeline_stages;
CREATE POLICY "anon_delete_stages"
  ON ghl_pipeline_stages FOR DELETE
  TO anon, authenticated USING (true);


CREATE TABLE IF NOT EXISTS ghl_opportunities (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  pipeline_id text NOT NULL DEFAULT '',
  stage_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  contact_id text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  contact_email text,
  contact_phone text,
  contact_company text,
  contact_tags text[] NOT NULL DEFAULT '{}',
  monetary_value numeric NOT NULL DEFAULT 0,
  assigned_to text,
  last_status_change_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ghl_opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_opps" ON ghl_opportunities;
CREATE POLICY "anon_select_opps"
  ON ghl_opportunities FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_opps" ON ghl_opportunities;
CREATE POLICY "anon_insert_opps"
  ON ghl_opportunities FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_opps" ON ghl_opportunities;
CREATE POLICY "anon_update_opps"
  ON ghl_opportunities FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_opps" ON ghl_opportunities;
CREATE POLICY "anon_delete_opps"
  ON ghl_opportunities FOR DELETE
  TO anon, authenticated USING (true);


CREATE TABLE IF NOT EXISTS ghl_contacts (
  id text PRIMARY KEY,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  company_name text,
  tags text[] NOT NULL DEFAULT '{}',
  date_added timestamptz NOT NULL DEFAULT now(),
  last_activity_date timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ghl_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_contacts" ON ghl_contacts;
CREATE POLICY "anon_select_contacts"
  ON ghl_contacts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_contacts" ON ghl_contacts;
CREATE POLICY "anon_insert_contacts"
  ON ghl_contacts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_contacts" ON ghl_contacts;
CREATE POLICY "anon_update_contacts"
  ON ghl_contacts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_contacts" ON ghl_contacts;
CREATE POLICY "anon_delete_contacts"
  ON ghl_contacts FOR DELETE
  TO anon, authenticated USING (true);

-- Add ghl_contact_id to reservations if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'reservations' AND column_name = 'ghl_contact_id'
  ) THEN
    ALTER TABLE reservations ADD COLUMN ghl_contact_id text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_stage
  ON ghl_opportunities (stage_id);

CREATE INDEX IF NOT EXISTS idx_ghl_opportunities_status
  ON ghl_opportunities (status);

CREATE INDEX IF NOT EXISTS idx_ghl_contacts_email
  ON ghl_contacts (email);
