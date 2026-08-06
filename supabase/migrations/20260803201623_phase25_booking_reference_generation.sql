/*
# Phase 2.5 — Booking Reference Generation

## Overview
Implements concurrency-safe booking reference generation for reservations.
Creates a PostgreSQL sequence and a trigger function that auto-generates
a human-readable reference (BKG-YYYY-NNNNNN) for every new reservation.
Also backfills existing reservations that have NULL booking_reference.

## Method
Uses a dedicated PostgreSQL sequence `booking_reference_seq` to guarantee
uniqueness under concurrent inserts. The sequence is NOT based on COUNT(*),
so it is safe under concurrent transactions.

## Format
BKG-2026-000001

## Trigger
A BEFORE INSERT trigger on `reservations` fires `generate_booking_reference()`
which:
1. Checks if booking_reference is already set (skip if so)
2. Calls nextval() on the sequence
3. Formats as BKG-{year}-{zero-padded seq}
4. Sets the booking_reference column

## Backfill
Updates all existing reservations with NULL booking_reference using the
same sequence, ensuring no duplicates and preserving any existing references.

## Unique Index
The existing partial unique index `idx_reservations_booking_ref` on
`(booking_reference) WHERE (booking_reference IS NOT NULL)` is preserved.
*/

-- ── Create the sequence ────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS booking_reference_seq START 1;

-- ── Create the generation function ─────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_booking_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq bigint;
  v_year int;
  v_ref text;
BEGIN
  IF NEW.booking_reference IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_seq := nextval('booking_reference_seq');
  v_year := EXTRACT(YEAR FROM now())::int;
  v_ref := 'BKG-' || v_year || '-' || lpad(v_seq::text, 6, '0');
  NEW.booking_reference := v_ref;

  RETURN NEW;
END;
$$;

-- ── Attach the trigger ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_generate_booking_ref ON reservations;
CREATE TRIGGER trg_generate_booking_ref
  BEFORE INSERT ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION generate_booking_reference();

-- ── Backfill existing NULL references ───────────────────────────────────
UPDATE reservations
SET booking_reference = 'BKG-' || EXTRACT(YEAR FROM COALESCE(start_at, charter_date, created_at))::int::text || '-' || lpad(nextval('booking_reference_seq')::text, 6, '0')
WHERE booking_reference IS NULL;
