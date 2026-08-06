-- Fix: payments SELECT should be tenant-scoped, not open to all
DROP POLICY IF EXISTS payments_select ON payments;
DROP POLICY IF EXISTS select_payments ON payments;

CREATE POLICY "payments_select_tenant" ON payments FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- Fix: domain_events SELECT should be tenant-scoped
DROP POLICY IF EXISTS domain_events_select ON domain_events;

CREATE POLICY "domain_events_select_tenant" ON domain_events FOR SELECT
  TO authenticated USING (is_super_admin() OR tenant_id = current_tenant_id());

-- Fix: event_outbox SELECT should be super_admin only (already correct, but make explicit)
DROP POLICY IF EXISTS event_outbox_select_super ON event_outbox;

CREATE POLICY "event_outbox_select_super" ON event_outbox FOR SELECT
  TO authenticated USING (is_super_admin());
