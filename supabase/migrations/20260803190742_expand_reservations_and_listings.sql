/*
# Expand Reservations and Listings Tables

## Overview
Adds the columns needed for the native booking flow to the existing reservations and listings tables.
All existing data is preserved — every new column is nullable or has a safe default.

## Modified Tables

### reservations — new columns
- listing_id (uuid FK → listings) — links reservation to a specific boat/experience
- customer_id (uuid FK → customers) — links to native customer record
- opportunity_id (uuid FK → opportunities) — links to native opportunity
- booking_reference (text UNIQUE) — human-readable reference like BKG-2026-000001
- source (text) — where the booking came from: public_booking, manual, phone, etc.
- title (text) — display title for the reservation
- start_at (timestamptz) — replaces charter_date as the canonical start
- end_at (timestamptz) — replaces charter_end as the canonical end
- timezone (text) — IANA timezone for display
- duration_minutes (int) — duration of the booking
- guest_count (int) — number of passengers
- subtotal_amount, tax_amount, service_fee_amount, total_amount (numeric)
- deposit_amount, amount_paid, balance_due (numeric)
- currency (text, default USD)
- booking_status (text) — inquiry, pending, awaiting_payment, confirmed, in_progress, completed, cancelled, expired, no_show
- payment_status (text) — unpaid, processing, deposit_paid, partially_paid, paid_in_full, failed, partially_refunded, refunded
- expires_at (timestamptz) — for temporary holds
- confirmed_at, cancelled_at, completed_at (timestamptz)
- cancellation_reason (text)
- actual_started_at, actual_ended_at (timestamptz) — for captain operations
- stripe_checkout_session_id, stripe_payment_intent_id, stripe_customer_id (text)
- created_by (uuid) — user who created the reservation

### listings — new columns
- slug (text) — for public URL /r/[tenantSlug]/[listingSlug]
- listing_type (text) — boat, tour, excursion, rental, experience, etc.
- meeting_point (text)
- deposit_percentage (numeric)
- currency (text, default USD)
- timezone (text, default America/New_York)
- buffer_before_minutes, buffer_after_minutes (int)
- minimum_notice_hours, maximum_advance_days (int)
- instant_booking (boolean, default true)
- requires_approval (boolean, default false)

## Backfill
- Copy charter_date → start_at and charter_end → end_at for existing reservations
- Copy vessel → title where title is null
- Set booking_status = 'confirmed' for existing reservations with status 'won'
- Set booking_status = 'cancelled' for existing reservations with status 'cancelled' or 'lost'
- Set payment_status = 'unpaid' for all existing reservations
- Generate slugs from name for existing listings

## Security
- No RLS policy changes (existing policies already cover new columns)
- New unique constraint on booking_reference
- New unique index on (tenant_id, slug) for listings
*/

-- ============================================
-- 1. EXPAND RESERVATIONS
-- ============================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_reference text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'imported_ghl',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS duration_minutes int,
  ADD COLUMN IF NOT EXISTS guest_count int,
  ADD COLUMN IF NOT EXISTS subtotal_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS booking_status text NOT NULL DEFAULT 'confirmed' CHECK (booking_status IN (
    'inquiry', 'pending', 'awaiting_payment', 'confirmed',
    'in_progress', 'completed', 'cancelled', 'expired', 'no_show'
  )),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN (
    'unpaid', 'processing', 'deposit_paid', 'partially_paid',
    'paid_in_full', 'failed', 'partially_refunded', 'refunded'
  )),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS actual_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS actual_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Backfill start_at/end_at from legacy columns
UPDATE reservations SET start_at = charter_date WHERE start_at IS NULL AND charter_date IS NOT NULL;
UPDATE reservations SET end_at = charter_end WHERE end_at IS NULL AND charter_end IS NOT NULL;

-- Backfill title from vessel or client_name
UPDATE reservations SET title = vessel WHERE title IS NULL AND vessel IS NOT NULL;
UPDATE reservations SET title = client_name WHERE title IS NULL AND client_name IS NOT NULL;

-- Backfill booking_status from legacy status
UPDATE reservations SET booking_status = 'confirmed' WHERE booking_status = 'confirmed' AND status IN ('won', 'open');
UPDATE reservations SET booking_status = 'cancelled' WHERE status IN ('lost', 'abandoned', 'cancelled');

-- Backfill monetary_value → total_amount where total_amount is 0
UPDATE reservations SET total_amount = monetary_value WHERE total_amount = 0 AND monetary_value > 0;

-- Index for availability queries
CREATE INDEX IF NOT EXISTS idx_reservations_listing_id ON reservations(listing_id);
CREATE INDEX IF NOT EXISTS idx_reservations_start_at ON reservations(start_at);
CREATE INDEX IF NOT EXISTS idx_reservations_booking_status ON reservations(booking_status);
CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_opportunity_id ON reservations(opportunity_id);

-- Unique constraint on booking_reference (partial — only where not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_booking_ref
  ON reservations(booking_reference)
  WHERE booking_reference IS NOT NULL;

-- ============================================
-- 2. EXPAND LISTINGS
-- ============================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS listing_type text NOT NULL DEFAULT 'boat',
  ADD COLUMN IF NOT EXISTS meeting_point text,
  ADD COLUMN IF NOT EXISTS deposit_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS buffer_before_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS buffer_after_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_notice_hours int NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS maximum_advance_days int NOT NULL DEFAULT 365,
  ADD COLUMN IF NOT EXISTS instant_booking boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false;

-- Backfill slugs from name
UPDATE listings
  SET slug = lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          trim(name),
          '[^a-zA-Z0-9\s-]', ''
        ),
        '\s+', '-'
      ),
      '-+', '-'
    )
  )
  WHERE slug IS NULL AND name IS NOT NULL;

-- Unique index on (tenant_id, slug)
CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_tenant_slug
  ON listings(tenant_id, slug)
  WHERE slug IS NOT NULL;