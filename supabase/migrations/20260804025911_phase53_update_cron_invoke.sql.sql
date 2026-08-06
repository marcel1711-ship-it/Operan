-- Update invoke_edge_function to pass x-cron-internal header
CREATE OR REPLACE FUNCTION invoke_edge_function(p_function_name text, p_secret text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = extensions, public
AS $$
DECLARE
  v_supabase_url text;
  v_full_url text;
  v_headers jsonb;
BEGIN
  v_supabase_url := 'https://iupjaqludrlgjcryxtar.supabase.co';
  v_full_url := v_supabase_url || '/functions/v1/' || p_function_name;

  -- Use x-cron-internal header for auth (edge function accepts this from DB cron)
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-internal', 'db-cron'
  );

  PERFORM net.http_post(
    url := v_full_url,
    headers := v_headers,
    body := '{}'::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION invoke_edge_function FROM PUBLIC, anon, authenticated;

-- Update cron jobs to also invoke edge functions (for step processing)
-- The DB function creates steps, the edge function processes them
SELECT cron.unschedule('process-workflows-cron');
SELECT cron.unschedule('process-outbox-cron');

-- process-workflows: DB creates steps + invokes edge function for processing
SELECT cron.schedule(
  'process-workflows-cron',
  '* * * * *',
  $$SELECT cron_process_workflows(); SELECT invoke_edge_function('process-workflows')$$
);

-- process-outbox: DB recovers stuck items + invokes edge function
SELECT cron.schedule(
  'process-outbox-cron',
  '*/2 * * * *',
  $$SELECT cron_process_outbox(); SELECT invoke_edge_function('process-outbox')$$
);
