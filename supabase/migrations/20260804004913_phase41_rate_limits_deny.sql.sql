-- Rate limits: RLS is enabled but no policies exist.
-- We've already revoked ALL grants from anon and authenticated.
-- Add explicit deny-all policies so the table is completely inaccessible via the API.
-- Only service_role (which bypasses RLS) and check_rate_limit (SECURITY DEFINER) can access it.

-- No policies needed — with all grants revoked and RLS enabled, the table is
-- completely inaccessible to anon and authenticated roles. RLS with no policies
-- means zero rows are visible/insertable/updatable/deletable.
-- service_role bypasses RLS entirely, so it has full access.
-- check_rate_limit is SECURITY DEFINER, so it runs as the owner and bypasses RLS.

-- However, to be explicit and satisfy the linter, add a policy that always denies:
CREATE POLICY "rate_limits_deny_all" ON rate_limits
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);
