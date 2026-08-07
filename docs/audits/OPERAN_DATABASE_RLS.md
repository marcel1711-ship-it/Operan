# OPERAN Database & RLS Reference

**Audit Date:** 2026-08-06
**Status:** Post-fix (all critical RLS issues resolved)

## Helper Functions

```sql
-- Checks if the current authenticated user is a member of the given tenant
is_tenant_member(p_tenant_id uuid) RETURNS boolean
-- SECURITY DEFINER, SET search_path = public

-- Checks if the current user has super_admin role in JWT metadata
is_super_admin() RETURNS boolean
-- SECURITY INVOKER
```

## RLS Policy Map (Post-Audit)

### Tenant-Scoped Tables (authenticated read/write via membership)

| Table | Anon SELECT | Auth SELECT | Auth Write | Notes |
|-------|------------|-------------|------------|-------|
| bookings | No | `is_tenant_member(tenant_id) OR is_super_admin()` | Same | Was: `true` for public |
| captain_checklists | No | Same pattern | Same | Was: `true` for public |
| captains | No | Same pattern | Same | Was: `true` for public |
| customers | No | Same pattern | Same | Already had tenant policies, super_admin check updated |
| guests | No | Same pattern | Same | Was: `true` for public |
| opportunities | No | Same pattern | Same | Already correct |
| pipeline_stages | No | Same pattern | Same | Already correct |
| pipelines | No | Same pattern | Same | Already correct |
| reservations | No | Same pattern | Same | Already correct |
| vessels | No | Same pattern | Same | Was: `true` for public |

### Tables with Public Read

| Table | Anon SELECT | Auth SELECT | Auth Write | Notes |
|-------|------------|-------------|------------|-------|
| tenants | `true` (storefront) | `true` | Super admin: ALL; Tenant member: UPDATE own | Was: full CRUD for any authenticated |
| listings | `is_active = true` (anon) | `true` (public role) + tenant-scoped | Tenant members | Removed dangerous `Service role manage listings` ALL policy |
| listing_pricing_options | `is_active = true` (anon) | `true` (authenticated) | Authenticated (needs tightening) | |
| integration_catalog | `true` | `true` | None | Global catalog, correct |

### Tables Scoped via Listing Ownership

| Table | Anon SELECT | Auth SELECT | Auth Write | Notes |
|-------|------------|-------------|------------|-------|
| listing_blocks | Active listings via join | Via listing ownership | Via listing ownership | Was: `true` for all |
| listing_fixed_start_times | Active listings via join | Via listing ownership | Via listing ownership | Was: `true` for all |
| listing_operating_hours | Active listings via join | Via listing ownership | Via listing ownership | Was: `true` for all |

### Special Access Tables

| Table | Access Pattern | Notes |
|-------|---------------|-------|
| platform_provider_secrets | `false` for all roles | Service role (bypasses RLS) only. Was: `true` for public on ALL ops |
| tenant_users | Own memberships (`auth.uid() = user_id`) + super_admin | Was: `true` for public SELECT |
| tenant_integrations | Tenant-scoped (authenticated) | Removed wide-open public policies |
| plan_pricing | Authenticated SELECT, super_admin write | Correct |
| waivers | Tenant-scoped read, public INSERT (waiver signing) | Was: `true` for public SELECT |

## Indexes Added

```sql
-- Reservations (most queried table, had zero secondary indexes)
idx_reservations_tenant_id ON reservations(tenant_id)
idx_reservations_listing_id ON reservations(listing_id)
idx_reservations_customer_id ON reservations(customer_id)
idx_reservations_booking_status ON reservations(booking_status)
idx_reservations_start_at ON reservations(start_at)

-- CRM
idx_opportunities_tenant_id ON opportunities(tenant_id)
idx_opportunities_pipeline_id ON opportunities(pipeline_id)
idx_opportunities_stage_id ON opportunities(stage_id)
idx_pipeline_stages_tenant_id ON pipeline_stages(tenant_id)
idx_pipelines_tenant_id ON pipelines(tenant_id)

-- Operations
idx_captains_tenant_id ON captains(tenant_id)
idx_customers_tenant_id ON customers(tenant_id)
idx_vessels_tenant_id ON vessels(tenant_id)
idx_waivers_tenant_id ON waivers(tenant_id)
idx_captain_checklists_tenant_id ON captain_checklists(tenant_id)
idx_guests_tenant_id ON guests(tenant_id)
```

## RPC Function Authorization (Post-Fix)

| Function | Auth Check | Notes |
|----------|-----------|-------|
| `get_dashboard_metrics(p_tenant_id)` | `is_tenant_member(p_tenant_id) OR is_super_admin()` | Was: no check |
| `get_automation_metrics(p_tenant_id)` | Same | Was: no check |
| `auto_register_tenant()` | Implicit (uses `auth.uid()`) | Assigns to first tenant — multi-tenant limitation |
| `ensure_tenant_membership(user_id, tenant_id)` | None (SECURITY DEFINER) | Fixed: added `SET search_path = public` |
| `handle_new_user()` | Trigger function (no direct call) | Fires on auth.users INSERT/UPDATE |
