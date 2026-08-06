/*
# Phase 2.5 — Add Rate Limiting Table and RPC

## Overview
Creates a database-backed rate limiting mechanism for public endpoints.
Since the deployment is serverless, in-memory rate limiting is unreliable
across instances. This table-based approach is durable and works across
all deployment instances.

## Table: rate_limits
- id (uuid, PK)
- identifier (text) — IP address or other identifier
- endpoint (text) — endpoint path being rate-limited
- window_start (timestamptz) — start of the current window
- request_count (int) — requests in current window
- created_at (timestamptz)
- updated_at (timestamptz)

## Unique Constraint
UNIQUE (identifier, endpoint, window_start) — prevents duplicate entries
for the same identifier+endpoint+window combination.

## Index
idx_rate_limits_identifier — (identifier, endpoint) for lookups

## Function: check_rate_limit(p_identifier, p_endpoint, p_max_requests, p_window_minutes)
Returns JSONB:
- { allowed: true } if under limit
- { allowed: false, retry_after_seconds: N } if over limit

### Behavior
1. Calculates window_start (truncated to window interval)
2. Tries to INSERT a new row with count=1 (UPSERT)
3. If row exists, increments count
4. If count > max, returns not allowed
5. Returns allowed otherwise

## RLS
Enabled with no policies — only service role can access.
The anon role has no grants on this table.
*/

CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  endpoint text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_identifier
  ON rate_limits (identifier, endpoint, window_start);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier text,
  p_endpoint text,
  p_max_requests integer DEFAULT 10,
  p_window_minutes integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  v_window_start := date_trunc('minute', now()) - (EXTRACT(minute FROM now())::int % p_window_minutes) * interval '1 minute';

  -- Try to get existing record
  SELECT request_count INTO v_count
  FROM rate_limits
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND window_start = v_window_start
  FOR UPDATE;

  IF v_count IS NULL THEN
    INSERT INTO rate_limits (identifier, endpoint, window_start, request_count)
    VALUES (p_identifier, p_endpoint, v_window_start, 1)
    ON CONFLICT (identifier, endpoint, window_start) DO NOTHING;
    RETURN jsonb_build_object('allowed', true, 'count', 1);
  END IF;

  IF v_count >= p_max_requests THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', p_window_minutes * 60,
      'count', v_count
    );
  END IF;

  UPDATE rate_limits
  SET request_count = request_count + 1, updated_at = now()
  WHERE identifier = p_identifier
    AND endpoint = p_endpoint
    AND window_start = v_window_start;

  RETURN jsonb_build_object('allowed', true, 'count', v_count + 1);
END;
$$;

-- Clean up old entries periodically (could be called by a cron job)
-- For now, old entries just accumulate but the table is small
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour';
END;
$$;
