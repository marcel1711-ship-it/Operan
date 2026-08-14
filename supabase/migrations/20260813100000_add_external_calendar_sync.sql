-- Add external calendar URL to listings (for TimeTree sync)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS external_calendar_url text;

-- Add external event ID to reservations (for dedup on sync)
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS external_event_id text;

-- Unique index to prevent duplicate external events per listing
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_external_event
ON reservations (listing_id, external_event_id)
WHERE external_event_id IS NOT NULL;

-- RPC to sync external calendar events (called by Chrome extension)
CREATE OR REPLACE FUNCTION sync_external_calendar_events(
  p_calendar_url text,
  p_events jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing record;
  v_event jsonb;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_external_id text;
  v_title text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_existing_id uuid;
BEGIN
  SELECT id, tenant_id, timezone, name
  INTO v_listing
  FROM listings
  WHERE external_calendar_url = p_calendar_url
    AND is_active = true
  LIMIT 1;

  IF v_listing.id IS NULL THEN
    RETURN jsonb_build_object('error', 'No listing found for this calendar URL', 'synced', 0);
  END IF;

  FOR v_event IN SELECT * FROM jsonb_array_elements(p_events)
  LOOP
    v_external_id := v_event->>'external_id';
    v_title := v_event->>'title';
    v_start_at := (v_event->>'start_at')::timestamptz;
    v_end_at := (v_event->>'end_at')::timestamptz;

    IF v_external_id IS NULL OR v_start_at IS NULL OR v_end_at IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT id INTO v_existing_id
    FROM reservations
    WHERE listing_id = v_listing.id
      AND external_event_id = v_external_id;

    IF v_existing_id IS NOT NULL THEN
      UPDATE reservations
      SET title = v_title,
          client_name = coalesce(v_title, 'TimeTree Block'),
          start_at = v_start_at,
          end_at = v_end_at,
          updated_at = now()
      WHERE id = v_existing_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO reservations (
        tenant_id, listing_id, source, external_event_id,
        title, client_name, start_at, end_at,
        timezone, booking_status, status, payment_status,
        notes
      ) VALUES (
        v_listing.tenant_id, v_listing.id, 'timetree', v_external_id,
        v_title, coalesce(v_title, 'TimeTree Block'), v_start_at, v_end_at,
        coalesce(v_listing.timezone, 'America/New_York'),
        'confirmed', 'confirmed', 'not_applicable',
        'Synced from TimeTree calendar'
      );
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  UPDATE reservations
  SET booking_status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = 'Removed from TimeTree calendar',
      updated_at = now()
  WHERE listing_id = v_listing.id
    AND source = 'timetree'
    AND booking_status != 'cancelled'
    AND external_event_id IS NOT NULL
    AND start_at >= now()
    AND external_event_id NOT IN (
      SELECT e->>'external_id'
      FROM jsonb_array_elements(p_events) e
      WHERE e->>'external_id' IS NOT NULL
    );

  RETURN jsonb_build_object(
    'success', true,
    'listing_id', v_listing.id,
    'listing_name', v_listing.name,
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped
  );
END;
$$;
