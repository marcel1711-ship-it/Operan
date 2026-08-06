-- ============================================================
-- Phase 5.3: Real Cron Scheduling
-- Install pg_cron + pg_net, create scheduled jobs for workers
-- ============================================================

-- Install extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA extensions;

-- ============================================================
-- Create a function to invoke edge functions via pg_net
-- ============================================================
CREATE OR REPLACE FUNCTION invoke_edge_function(p_function_name text, p_secret text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
  v_supabase_url text;
  v_service_key text;
  v_secret_to_use text;
  v_full_url text;
  v_headers jsonb;
BEGIN
  v_supabase_url := 'https://iupjaqludrlgjcryxtar.supabase.co';

  -- Try vault first, then environment
  BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_service_key := NULL;
  END;

  v_secret_to_use := COALESCE(p_secret, v_service_key, '');

  v_full_url := v_supabase_url || '/functions/v1/' || p_function_name;

  v_headers := jsonb_build_object(
    'apikey', v_secret_to_use,
    'Authorization', 'Bearer ' || v_secret_to_use,
    'Content-Type', 'application/json'
  );

  PERFORM net.http_post(
    url := v_full_url,
    headers := v_headers,
    body := '{}'::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION invoke_edge_function FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION invoke_edge_function FROM anon;
REVOKE EXECUTE ON FUNCTION invoke_edge_function FROM authenticated;

-- Schedule process-workflows every minute
SELECT cron.schedule(
  'process-workflows-cron',
  '* * * * *',
  $$SELECT invoke_edge_function('process-workflows')$$
);

-- Schedule process-outbox every 2 minutes
SELECT cron.schedule(
  'process-outbox-cron',
  '*/2 * * * *',
  $$SELECT invoke_edge_function('process-outbox')$$
);
