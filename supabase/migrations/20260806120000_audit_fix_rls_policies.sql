-- ============================================================
-- AUDIT FIX: Harden RLS policies on tenant-scoped tables
-- Replaces overly permissive "qual: true" policies with
-- proper tenant isolation and role-based access control.
-- ============================================================

-- ── Helper: reusable tenant membership check ──
CREATE OR REPLACE FUNCTION public.is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_users
    WHERE user_id = auth.uid()
      AND tenant_id = p_tenant_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'super_admin',
    false
  );
$$;

-- ============================================================
-- 1. PLATFORM_PROVIDER_SECRETS — deny all non-service-role access
-- ============================================================
DROP POLICY IF EXISTS "Service can read platform_provider_secrets" ON platform_provider_secrets;
DROP POLICY IF EXISTS "Service can insert platform_provider_secrets" ON platform_provider_secrets;
DROP POLICY IF EXISTS "Service can update platform_provider_secrets" ON platform_provider_secrets;
DROP POLICY IF EXISTS "Service can delete platform_provider_secrets" ON platform_provider_secrets;

CREATE POLICY "Deny all direct access to secrets"
  ON platform_provider_secrets FOR ALL
  TO public
  USING (false);

-- ============================================================
-- 2. BOOKINGS — tenant-scoped read/write
-- ============================================================
DROP POLICY IF EXISTS "Public read bookings" ON bookings;

CREATE POLICY "Tenant members can read bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

CREATE POLICY "Tenant members can insert bookings"
  ON bookings FOR INSERT
  TO authenticated
  WITH CHECK (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

CREATE POLICY "Tenant members can update bookings"
  ON bookings FOR UPDATE
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

CREATE POLICY "Tenant members can delete bookings"
  ON bookings FOR DELETE
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

-- ============================================================
-- 3. CAPTAIN_CHECKLISTS — tenant-scoped
-- ============================================================
DROP POLICY IF EXISTS "Public read checklists" ON captain_checklists;

CREATE POLICY "Tenant members can read checklists"
  ON captain_checklists FOR SELECT
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

CREATE POLICY "Tenant members can manage checklists"
  ON captain_checklists FOR ALL
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

-- ============================================================
-- 4. CAPTAINS — tenant-scoped
-- ============================================================
DROP POLICY IF EXISTS "Public read captains" ON captains;

CREATE POLICY "Tenant members can read captains"
  ON captains FOR SELECT
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

CREATE POLICY "Tenant members can manage captains"
  ON captains FOR ALL
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

-- ============================================================
-- 5. GUESTS — tenant-scoped
-- ============================================================
DROP POLICY IF EXISTS "Public read guests" ON guests;

CREATE POLICY "Tenant members can read guests"
  ON guests FOR SELECT
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

CREATE POLICY "Tenant members can manage guests"
  ON guests FOR ALL
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

-- ============================================================
-- 6. VESSELS — tenant-scoped
-- ============================================================
DROP POLICY IF EXISTS "Public read vessels" ON vessels;

CREATE POLICY "Tenant members can read vessels"
  ON vessels FOR SELECT
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

CREATE POLICY "Tenant members can manage vessels"
  ON vessels FOR ALL
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

-- ============================================================
-- 7. WAIVERS — tenant-scoped read, public insert for waiver signing
-- ============================================================
DROP POLICY IF EXISTS "Public read waivers" ON waivers;

CREATE POLICY "Tenant members can read waivers"
  ON waivers FOR SELECT
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

CREATE POLICY "Public can submit waivers"
  ON waivers FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Tenant members can manage waivers"
  ON waivers FOR UPDATE
  TO authenticated
  USING (
    is_tenant_member(tenant_id) OR is_super_admin()
  );

-- ============================================================
-- 8. LISTINGS — keep public read for active, fix dangerous ALL policy
-- ============================================================
DROP POLICY IF EXISTS "Service role manage listings" ON listings;

-- ============================================================
-- 9. TENANTS — public can read (for storefront), only super_admin can write
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can delete tenants" ON tenants;
DROP POLICY IF EXISTS "Authenticated users can insert tenants" ON tenants;
DROP POLICY IF EXISTS "Authenticated users can read tenants" ON tenants;
DROP POLICY IF EXISTS "Authenticated users can update tenants" ON tenants;

CREATE POLICY "Anyone can read tenants"
  ON tenants FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Super admins can manage tenants"
  ON tenants FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Tenant admins can update own tenant"
  ON tenants FOR UPDATE
  TO authenticated
  USING (is_tenant_member(id))
  WITH CHECK (is_tenant_member(id));

-- ============================================================
-- 10. TENANT_USERS — users read own, super_admin reads all
-- ============================================================
DROP POLICY IF EXISTS "Service can read all memberships" ON tenant_users;

CREATE POLICY "Super admins can read all memberships"
  ON tenant_users FOR SELECT
  TO authenticated
  USING (is_super_admin());

-- Keep existing "Users can read own memberships" policy

-- ============================================================
-- 11. TENANT_INTEGRATIONS — remove wide-open public policies
-- ============================================================
DROP POLICY IF EXISTS "Users can insert tenant_integrations" ON tenant_integrations;
DROP POLICY IF EXISTS "Users can read tenant_integrations" ON tenant_integrations;
DROP POLICY IF EXISTS "Users can update tenant_integrations" ON tenant_integrations;

-- Keep existing tenant-scoped policies for authenticated users

-- ============================================================
-- 12. LISTING_BLOCKS — scope to listing owner's tenant
-- ============================================================
DROP POLICY IF EXISTS "delete_blocks" ON listing_blocks;
DROP POLICY IF EXISTS "insert_blocks" ON listing_blocks;
DROP POLICY IF EXISTS "select_blocks" ON listing_blocks;
DROP POLICY IF EXISTS "select_blocks_anon" ON listing_blocks;

CREATE POLICY "Tenant members can read blocks"
  ON listing_blocks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_blocks.listing_id
        AND (is_tenant_member(l.tenant_id) OR is_super_admin())
    )
  );

CREATE POLICY "Anon can read blocks for active listings"
  ON listing_blocks FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_blocks.listing_id
        AND l.is_active = true
    )
  );

CREATE POLICY "Tenant members can manage blocks"
  ON listing_blocks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_blocks.listing_id
        AND (is_tenant_member(l.tenant_id) OR is_super_admin())
    )
  );

-- ============================================================
-- 13. LISTING_FIXED_START_TIMES — scope to listing owner's tenant
-- ============================================================
DROP POLICY IF EXISTS "delete_fixed_start_times" ON listing_fixed_start_times;
DROP POLICY IF EXISTS "insert_fixed_start_times" ON listing_fixed_start_times;
DROP POLICY IF EXISTS "select_fixed_start_times" ON listing_fixed_start_times;
DROP POLICY IF EXISTS "update_fixed_start_times" ON listing_fixed_start_times;
DROP POLICY IF EXISTS "select_fixed_times_anon" ON listing_fixed_start_times;

CREATE POLICY "Tenant members can read fixed start times"
  ON listing_fixed_start_times FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_fixed_start_times.listing_id
        AND (is_tenant_member(l.tenant_id) OR is_super_admin())
    )
  );

CREATE POLICY "Anon can read fixed start times for active listings"
  ON listing_fixed_start_times FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_fixed_start_times.listing_id
        AND l.is_active = true
    )
  );

CREATE POLICY "Tenant members can manage fixed start times"
  ON listing_fixed_start_times FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_fixed_start_times.listing_id
        AND (is_tenant_member(l.tenant_id) OR is_super_admin())
    )
  );

-- ============================================================
-- 14. LISTING_OPERATING_HOURS — scope to listing owner's tenant
-- ============================================================
DROP POLICY IF EXISTS "delete_operating_hours" ON listing_operating_hours;
DROP POLICY IF EXISTS "insert_operating_hours" ON listing_operating_hours;
DROP POLICY IF EXISTS "select_operating_hours" ON listing_operating_hours;
DROP POLICY IF EXISTS "update_operating_hours" ON listing_operating_hours;
DROP POLICY IF EXISTS "select_operating_hours_anon" ON listing_operating_hours;

CREATE POLICY "Tenant members can read operating hours"
  ON listing_operating_hours FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_operating_hours.listing_id
        AND (is_tenant_member(l.tenant_id) OR is_super_admin())
    )
  );

CREATE POLICY "Anon can read operating hours for active listings"
  ON listing_operating_hours FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_operating_hours.listing_id
        AND l.is_active = true
    )
  );

CREATE POLICY "Tenant members can manage operating hours"
  ON listing_operating_hours FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_operating_hours.listing_id
        AND (is_tenant_member(l.tenant_id) OR is_super_admin())
    )
  );

-- ============================================================
-- 15. Add missing performance indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_id ON reservations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_listing_id ON reservations(listing_id);
CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_booking_status ON reservations(booking_status);
CREATE INDEX IF NOT EXISTS idx_reservations_start_at ON reservations(start_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_id ON opportunities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_pipeline_id ON opportunities(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage_id ON opportunities(stage_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_tenant_id ON pipeline_stages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_tenant_id ON pipelines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_captains_tenant_id ON captains(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vessels_tenant_id ON vessels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_waivers_tenant_id ON waivers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_captain_checklists_tenant_id ON captain_checklists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_guests_tenant_id ON guests(tenant_id);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
