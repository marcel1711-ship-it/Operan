/*
# Create reservations table

1. Purpose
   Stores charter reservations synced from GoHighLevel opportunities.
   The dashboard calendar and "Upcoming Charters" list read from this table
   instead of parsing opportunity names on the fly.

2. New Table: reservations
   - id (uuid, PK, default gen_random_uuid())
   - ghl_opportunity_id (text, unique) — links back to the GHL opportunity
   - ghl_stage_id (text) — pipeline stage at last sync
   - title (text) — charter title / trip name
   - client_name (text) — contact name
   - client_email (text, nullable)
   - client_phone (text, nullable)
   - vessel (text, nullable) — boat name
   - charter_date (timestamptz) — start of the charter
   - charter_end (timestamptz, nullable) — end of the charter
   - monetary_value (numeric, default 0)
   - status (text, default 'open') — open | won | lost | abandoned
   - notes (text, nullable)
   - created_at (timestamptz, default now())
   - updated_at (timestamptz, default now())

3. Security
   - RLS enabled.
   - Single-tenant app (no sign-in screen) → anon + authenticated CRUD
     so the anon-key frontend can read its own data.
*/

CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_opportunity_id text UNIQUE,
  ghl_stage_id text,
  title text NOT NULL DEFAULT '',
  client_name text NOT NULL DEFAULT '',
  client_email text,
  client_phone text,
  vessel text,
  charter_date timestamptz NOT NULL,
  charter_end timestamptz,
  monetary_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_reservations" ON reservations;
CREATE POLICY "anon_select_reservations"
  ON reservations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_reservations" ON reservations;
CREATE POLICY "anon_insert_reservations"
  ON reservations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_reservations" ON reservations;
CREATE POLICY "anon_update_reservations"
  ON reservations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_reservations" ON reservations;
CREATE POLICY "anon_delete_reservations"
  ON reservations FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_reservations_charter_date
  ON reservations (charter_date);

CREATE INDEX IF NOT EXISTS idx_reservations_status
  ON reservations (status);
