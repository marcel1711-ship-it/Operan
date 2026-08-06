/*
# Create listings table for boat rentals (single-tenant, no auth)

## Purpose
Stores boat listings that will be displayed on the public reservation page.
Each listing represents a boat available for rental — with photos, pricing,
capacity, and specifications. This is the foundation for the "Listings" management
page where operators create and manage their fleet.

## New Tables
- `listings`
  - `id` (uuid, primary key)
  - `name` (text, not null) — display name of the boat (e.g. "Sea Ray 230")
  - `description` (text) — full description shown on the listing page
  - `photos` (text[]) — array of image URLs for the boat gallery
  - `price_per_hour` (numeric, default 0) — hourly rental rate in USD
  - `price_half_day` (numeric, default 0) — half-day (4hr) rental rate
  - `price_full_day` (numeric, default 0) — full-day (8hr) rental rate
  - `capacity` (integer, default 1) — max passengers
  - `length_ft` (numeric) — boat length in feet
  - `boat_type` (text) — e.g. "Yacht", "Speedboat", "Catamaran", "Sailboat"
  - `year` (integer) — model year
  - `location` (text) — marina or departure location
  - `amenities` (text[]) — array of amenity labels (e.g. "Cooler", "Sound System")
  - `is_active` (boolean, default true) — whether the listing is publicly visible
  - `sort_order` (integer, default 0) — manual ordering on the listings page
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Security
- RLS enabled on `listings`.
- Four CRUD policies scoped to `anon, authenticated` because the dashboard has
  no sign-in screen and the anon-key client must be able to read/write listings.
  `USING (true)` is intentional: the data is intentionally shared across dashboard
  viewers, not per-user private data.
*/

CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  photos text[] DEFAULT '{}',
  price_per_hour numeric(10,2) DEFAULT 0,
  price_half_day numeric(10,2) DEFAULT 0,
  price_full_day numeric(10,2) DEFAULT 0,
  capacity integer DEFAULT 1,
  length_ft numeric(6,1),
  boat_type text,
  year integer,
  location text,
  amenities text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listings_active
  ON listings (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_listings_sort
  ON listings (sort_order);

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_listings" ON listings;
CREATE POLICY "anon_select_listings" ON listings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_listings" ON listings;
CREATE POLICY "anon_insert_listings" ON listings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_listings" ON listings;
CREATE POLICY "anon_update_listings" ON listings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_listings" ON listings;
CREATE POLICY "anon_delete_listings" ON listings FOR DELETE
  TO anon, authenticated USING (true);
