-- Allow tenant admins to update their own tenant record
-- (replaces the super-admin-only update policy)
DROP POLICY IF EXISTS "update_tenants" ON tenants;

CREATE POLICY "update_tenants"
  ON tenants FOR UPDATE
  TO authenticated
  USING (
    is_super_admin()
    OR id IN (
      SELECT tenant_users.tenant_id
      FROM tenant_users
      WHERE tenant_users.user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_super_admin()
    OR id IN (
      SELECT tenant_users.tenant_id
      FROM tenant_users
      WHERE tenant_users.user_id = auth.uid()
    )
  );
