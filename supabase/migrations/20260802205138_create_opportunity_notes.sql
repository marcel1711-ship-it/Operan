/*
# Create opportunity_notes table (single-tenant, no auth)

## Purpose
Stores free-form notes attached to GoHighLevel opportunities shown on the
sales dashboard. The dashboard is a single-tenant internal tool with no
sign-in screen, so notes are intentionally shared/public across whoever opens
the dashboard.

## New Tables
- `opportunity_notes`
  - `id` (uuid, primary key)
  - `opportunity_id` (text, not null) — GHL opportunity id this note is about
  - `opportunity_name` (text) — denormalized opportunity title for display
  - `contact_name` (text) — denormalized contact name for display
  - `body` (text, not null) — the note content
  - `author` (text) — who wrote the note (free text label, defaults to 'Team')
  - `created_at` (timestamptz, default now())

## Security
- RLS enabled on `opportunity_notes`.
- Four CRUD policies scoped to `anon, authenticated` because the dashboard has
  no sign-in screen and the anon-key client must be able to read/write its own
  notes. `USING (true)` is intentional here: the data is intentionally shared
  across dashboard viewers, not per-user private data.
*/

CREATE TABLE IF NOT EXISTS opportunity_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id text NOT NULL,
  opportunity_name text,
  contact_name text,
  body text NOT NULL,
  author text NOT NULL DEFAULT 'Team',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opportunity_notes_opportunity_id
  ON opportunity_notes (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opportunity_notes_created_at
  ON opportunity_notes (created_at DESC);

ALTER TABLE opportunity_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_notes" ON opportunity_notes;
CREATE POLICY "anon_select_notes" ON opportunity_notes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_notes" ON opportunity_notes;
CREATE POLICY "anon_insert_notes" ON opportunity_notes FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_notes" ON opportunity_notes;
CREATE POLICY "anon_update_notes" ON opportunity_notes FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_notes" ON opportunity_notes;
CREATE POLICY "anon_delete_notes" ON opportunity_notes FOR DELETE
  TO anon, authenticated USING (true);
