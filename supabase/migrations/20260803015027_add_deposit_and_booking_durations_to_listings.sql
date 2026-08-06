ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS deposit_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booking_durations integer[] NOT NULL DEFAULT '{}';
