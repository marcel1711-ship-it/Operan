-- Fix worker_health_log RLS: block anon SELECT and authenticated INSERT
REVOKE SELECT ON worker_health_log FROM anon;

-- Ensure authenticated can only SELECT (not INSERT/UPDATE/DELETE)
REVOKE INSERT, UPDATE, DELETE ON worker_health_log FROM authenticated;
GRANT SELECT ON worker_health_log TO authenticated;
