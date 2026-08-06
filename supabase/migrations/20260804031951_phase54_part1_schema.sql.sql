-- ============================================================
-- Phase 5.4 Part 1: Schema changes, secure worker_health_log, drop invoke_edge_function
-- ============================================================

-- 1. Add columns for secure worker health and retry audit
ALTER TABLE worker_health_log ADD COLUMN IF NOT EXISTS invocation_type text DEFAULT 'scheduled_cron';
ALTER TABLE worker_health_log ADD COLUMN IF NOT EXISTS invocation_id text;
ALTER TABLE worker_health_log ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE worker_health_log ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE worker_health_log ADD COLUMN IF NOT EXISTS scheduler_job_id text;

ALTER TABLE automation_step_runs ADD COLUMN IF NOT EXISTS retry_count int DEFAULT 0;
ALTER TABLE automation_step_runs ADD COLUMN IF NOT EXISTS last_retry_reason text;
ALTER TABLE automation_step_runs ADD COLUMN IF NOT EXISTS last_retry_actor uuid;
ALTER TABLE automation_step_runs ADD COLUMN IF NOT EXISTS last_retry_at timestamptz;
ALTER TABLE automation_step_runs ADD COLUMN IF NOT EXISTS original_error text;

ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS acknowledged_by uuid;
ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;

-- 2. Secure worker_health_log with RLS — only super_admin can read, no direct writes
ALTER TABLE worker_health_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_worker_health_admin" ON worker_health_log;
CREATE POLICY "select_worker_health_admin" ON worker_health_log FOR SELECT
  TO authenticated USING (is_super_admin());

-- No INSERT/UPDATE/DELETE policies — only SECURITY DEFINER functions can write

-- 3. Drop invoke_edge_function — no more HTTP calls from cron
DROP FUNCTION IF EXISTS invoke_edge_function(text, text);
