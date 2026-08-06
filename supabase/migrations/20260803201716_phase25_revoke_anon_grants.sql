/*
# Phase 2.5 — Revoke Anonymous CRUD Grants on Operational Tables

## Overview
Reduces anonymous database privileges by revoking INSERT, UPDATE, and DELETE
from the `anon` role on all private operational tables. RLS remains the
primary isolation mechanism, but the anon role should not have broad DML
grants as a fallback.

## Tables Affected (REVOKE INSERT, UPDATE, DELETE)
- customers
- opportunities
- pipelines
- pipeline_stages
- reservations
- payments
- activity_log
- opportunity_notes_native
- opportunity_notes (legacy)
- notifications
- tenant_users
- tenants
- listings
- listing_blocks
- listing_operating_hours
- waiver_templates
- signed_waivers
- invoices
- plan_pricing
- webhook_events

## Tables Where Anon SELECT Is Retained
- tenants (for public landing page slug lookup) — SELECT only
- listings (for public boat listing display) — SELECT only
- waiver_templates (for public waiver form display) — SELECT only

## Tables Where Anon INSERT Is Retained
- signed_waivers — INSERT only (for public waiver submission via server route)
  Note: RLS policies validate tenant ownership and active status

## Rationale
The anon role is used by the browser-side Supabase client. Public pages
need to read active tenants, listings, and waiver templates. They do NOT
need to write to any table except signed_waivers (waiver submission).
All other writes go through authenticated users or server-side code with
the service role key.
*/

-- ── Revoke DML from anon on all operational tables ──────────────────────
REVOKE INSERT, UPDATE, DELETE ON customers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON opportunities FROM anon;
REVOKE INSERT, UPDATE, DELETE ON pipelines FROM anon;
REVOKE INSERT, UPDATE, DELETE ON pipeline_stages FROM anon;
REVOKE INSERT, UPDATE, DELETE ON reservations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON payments FROM anon;
REVOKE INSERT, UPDATE, DELETE ON activity_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON opportunity_notes_native FROM anon;
REVOKE INSERT, UPDATE, DELETE ON opportunity_notes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON notifications FROM anon;
REVOKE INSERT, UPDATE, DELETE ON tenant_users FROM anon;
REVOKE INSERT, UPDATE, DELETE ON tenants FROM anon;
REVOKE INSERT, UPDATE, DELETE ON listings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON listing_blocks FROM anon;
REVOKE INSERT, UPDATE, DELETE ON listing_operating_hours FROM anon;
REVOKE INSERT, UPDATE, DELETE ON waiver_templates FROM anon;
REVOKE INSERT, UPDATE, DELETE ON signed_waivers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON invoices FROM anon;
REVOKE INSERT, UPDATE, DELETE ON plan_pricing FROM anon;
REVOKE INSERT, UPDATE, DELETE ON webhook_events FROM anon;

-- ── Re-allow anon SELECT on public-readable tables ─────────────────────
GRANT SELECT ON tenants TO anon;
GRANT SELECT ON listings TO anon;
GRANT SELECT ON waiver_templates TO anon;

-- ── Re-allow anon INSERT on signed_waivers for public submission ───────
-- RLS policies validate ownership and active status
GRANT INSERT ON signed_waivers TO anon;
