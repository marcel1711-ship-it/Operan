# OPERAN Full Platform Audit

**Date:** 2026-08-06
**Platform:** OPERAN v3 — Marine Experience Operations Platform
**Supabase Project:** zxflexiywouechzvapbi
**Branch:** audit/operan-full-audit

---

## Executive Summary

OPERAN is a multi-tenant SaaS platform for marine businesses (charters, boat rentals, tours). The audit reveals a platform with **strong frontend architecture** and **well-designed integration framework**, but with **critical gaps in database infrastructure** that leave most advanced features non-functional.

### Production Readiness Score: 38/100

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Security | 70/100 | 25% | 17.5 |
| Database Completeness | 25/100 | 20% | 5.0 |
| Feature Completeness | 40/100 | 20% | 8.0 |
| Code Quality | 75/100 | 15% | 11.25 |
| Performance | 60/100 | 10% | 6.0 |
| Documentation | 20/100 | 10% | 2.0 |

**Before this audit:** ~22/100 (critical security holes, open RLS policies)
**After this audit:** 38/100 (security hardened, P0/P1 fixed, but missing DB infrastructure)

---

## What Works (Production-Ready)

1. **Authentication flow** — Login, password reset, role-based routing
2. **Tenant dashboard** — KPI cards, business health, calendar view
3. **Listings management** — Full CRUD with pricing options
4. **Reservations** — List, view, basic status management
5. **CRM Pipeline** — Kanban board, opportunity CRUD, stage management
6. **Customer management** — List, create, basic dedup
7. **Integration catalog** — Provider definitions, tenant integration CRUD
8. **Platform secrets vault** — AES-256-GCM encrypted credential storage
9. **Landing page** — Complete marketing site
10. **Public storefront** — Tenant catalog and listing detail pages

## What's Broken (Code Exists, Backend Missing)

### Critical Path — Booking & Payments (0% functional)
The entire booking-to-payment flow is non-functional:
- **12 RPC functions** referenced in code don't exist in database
- **~34 tables** referenced in code don't exist
- Booking flow UI renders but fails on first API call
- Payment checkout creates Stripe sessions referencing non-existent tables
- Webhook handler processes events into non-existent tables

### Integration Features (10% functional)
- Google Calendar OAuth: UI exists, `tenant_calendar_connections` table missing
- iCal import/export: Edge functions exist, `tenant_ical_feeds` table missing
- Webhooks: Full delivery system, `tenant_webhook_endpoints` table missing
- API keys: Routes exist, `tenant_api_keys` table missing
- Email (Resend): Routes exist, `tenant_email_domains` table missing

### Automation System (0% functional)
- Complete workflow builder UI exists
- Edge function `process-workflows` exists with full execution engine
- All backing tables (`automation_workflows`, `automation_runs`, etc.) missing

### Communications (0% functional)
- Workflow engine, template renderer, adapter pattern all implemented
- All backing tables missing

---

## Security Fixes Applied

### P0 Fixed
1. **Unauthenticated admin creation endpoint** — Added `requireSuperAdmin` guard
2. **Open RLS policies on 14 tables** — Replaced with tenant-scoped policies
   - `platform_provider_secrets`: Now denies all non-service-role access
   - `bookings`, `guests`, `captains`, `vessels`, `waivers`, `captain_checklists`: Tenant-scoped
   - `tenants`: Public read, super_admin/tenant write
   - `tenant_users`: Own memberships + super_admin
   - `tenant_integrations`: Removed wide-open public policies
   - `listing_blocks/fixed_start_times/operating_hours`: Scoped via listing ownership

### P1 Fixed
3. **Stripe OAuth CSRF** — HMAC-signed state with expiry, timing-safe verification
4. **Unauthenticated platform status endpoints** — Added super_admin auth
5. **XSS in waiver page** — DOMPurify sanitization with strict allowlist
6. **Wrong table name** — `tenant_members` → `tenant_users` in create-checkout
7. **SECURITY DEFINER without auth** — Added caller verification to RPC functions

### P2 Fixed
8. **Hardcoded fallback encryption keys** — Now throws if env var missing
9. **OAuth state timing-safe comparison** — Now uses `crypto.timingSafeEqual()`
10. **Stripe platform status** — Added auth guard
11. **Listing sub-table RLS** — Scoped via listing ownership join

### P2 Remaining (Documented)
- `x-cron-internal: db-cron` bypass in edge functions
- CRON_SECRET in query strings
- No SSRF protection on webhook delivery
- Missing redirect protection in iCal sync
- PostMessage wildcard targetOrigin

---

## Database Infrastructure Gap

### Existing (38 tables — 22 original + 6 Phase 1 + 10 Phase 2)
activity_log, booking_access_tokens, bookings, captain_checklists, captains, customers, event_outbox, guests, integration_activity_logs, integration_catalog, listing_availability_blocks, listing_blocks, listing_fixed_start_times, listing_operating_hours, listing_pricing_options, listings, notifications, opportunities, payments, pipeline_stages, pipelines, plan_pricing, platform_fee_config, platform_provider_secrets, rate_limit_log, reservations, tenant_api_keys, tenant_calendar_connections, tenant_ical_feeds, tenant_integrations, tenant_users, tenant_webhook_deliveries, tenant_webhook_endpoints, tenants, vessels, waivers, webhook_events, webhook_outbox

### Phase 1 Tables Created (booking & payments infrastructure)
`payments`, `webhook_events`, `booking_access_tokens`, `platform_fee_config`, `notifications`, `rate_limit_log`

### Phase 1 RPC Functions Created (13)
`check_rate_limit`, `get_public_availability`, `calculate_booking_price`, `create_public_booking_hold`, `create_booking_access_token`, `create_booking_checkout`, `record_webhook_event`, `confirm_payment_from_webhook`, `expire_checkout_session`, `record_payment_failure`, `process_refund`, `mark_webhook_processed`, `expire_stale_holds`

### Phase 2 Tables Created (integration infrastructure)
`event_outbox`, `activity_log`, `tenant_ical_feeds`, `tenant_webhook_endpoints`, `tenant_webhook_deliveries`, `tenant_api_keys`, `integration_activity_logs`, `tenant_calendar_connections`, `listing_availability_blocks`, `webhook_outbox`

### Phase 2 RPC Functions Created (12)
`emit_domain_event`, `log_integration_activity`, `generate_ical_feed_token`, `generate_webhook_signing_secret`, `authenticate_api_key`, `create_webhook_deliveries_for_event`, `check_listing_availability_with_blocks`, `emit_reservation_event`, `emit_payment_event`, `emit_customer_event`, `emit_waiver_event`, `emit_workflow_event`

### Phase 2 Modified Tables
- `tenant_integrations`: Added columns — `connection_mode`, `display_name`, `configuration`, `last_tested_at`, `last_success_at`, `last_error_at`, `last_error_code`, `last_error_message`, `disconnected_at`
- `reservations`: Added column — `google_calendar_event_id`

### Missing (~18 tables referenced in code)
tenant_email_domains, tenant_email_senders, tenant_communication_settings, communication_templates, communication_messages, automation_workflows, automation_workflow_versions, automation_runs, automation_step_runs, worker_health_log, platform_integrations, opportunity_notes_native, waiver_templates, invoices, provider_events, reservation_status_labels, platform_secret_audit_log

### Missing RPC Functions
All booking/payment and integration RPCs have been created. Remaining RPCs will be added in Phase 3+.

---

## Performance Improvements Applied

Added 16 missing indexes on frequently-queried columns:
- `reservations`: tenant_id, listing_id, customer_id, booking_status, start_at
- `opportunities`: tenant_id, pipeline_id, stage_id
- `pipeline_stages`: tenant_id
- `pipelines`: tenant_id
- `captains`, `customers`, `vessels`, `waivers`, `captain_checklists`, `guests`: tenant_id

---

## Code Quality Assessment

### Strengths
- Clean component architecture with shadcn/ui
- Proper separation: services, integrations, communications layers
- Adapter pattern for integrations (extensible)
- Server-side price calculation (security best practice)
- Proper webhook signature verification (Stripe, Resend)
- Edge functions with SSRF protection (process-workflows)
- DOMPurify usage for user-generated HTML

### Issues
- No auto-generated Supabase types (`database.types.ts` missing)
- v1 API routes create inline Supabase clients instead of using shared singleton
- Deprecated GHL code still present (8 files)
- `next-themes` imported but dark mode not used (single visual mode)
- ~80 SQL migration files spanning 4 days — suggest consolidation

---

## Remediation Roadmap (Priority Order)

### Phase 1 — Critical (Week 1-2) ✅ COMPLETE
1. ✅ Created booking flow tables: `payments`, `booking_access_tokens`, `webhook_events`, `notifications`, `rate_limit_log`
2. ✅ Created booking RPCs: `get_public_availability`, `calculate_booking_price`, `create_public_booking_hold`, `check_rate_limit`, `create_booking_access_token`
3. ✅ Created payment RPCs: `create_booking_checkout`, `record_webhook_event`, `confirm_payment_from_webhook`, `expire_checkout_session`, `record_payment_failure`, `process_refund`, `mark_webhook_processed`, `expire_stale_holds`
4. ✅ Created `platform_fee_config` table for Stripe Connect fees
5. ⬚ Fix edge function auth: remove `x-cron-internal` bypass, move CRON_SECRET to headers only

### Phase 2 — High (Week 2-3) ✅ COMPLETE
6. ✅ Created integration tables: `tenant_calendar_connections`, `listing_availability_blocks`, `tenant_ical_feeds`
7. ✅ Created webhook tables: `tenant_webhook_endpoints`, `tenant_webhook_deliveries`, `webhook_outbox`
8. ✅ Created API key table: `tenant_api_keys` + `authenticate_api_key` RPC
9. ✅ Created activity tables: `activity_log`, `event_outbox`, `integration_activity_logs`
10. ⬚ Add SSRF protection to `deliver-webhooks`

### Phase 3 — Medium (Week 3-4)
11. Create automation tables: `automation_workflows`, `automation_runs`, `automation_step_runs`, `automation_workflow_versions`
12. Create outbox tables: `event_outbox`, `webhook_outbox`
13. Create communication tables: `communication_templates`, `communication_messages`, `tenant_communication_settings`
14. Create email tables: `tenant_email_domains`, `tenant_email_senders`
15. Generate Supabase TypeScript types

### Phase 4 — Low (Week 4+)
16. Create remaining tables: `waiver_templates`, `invoices`, `opportunity_notes_native`, `reservation_status_labels`
17. Remove deprecated GHL code
18. Remove unused `next-themes` dependency
19. Consolidate migration files
20. Add comprehensive test suite

---

## Files Modified in This Audit

| File | Change |
|------|--------|
| `lib/integrations/crypto.ts` | Removed hardcoded fallback keys, use `timingSafeEqual`, throw if env var missing |
| `app/api/stripe-onboarding/route.ts` | Use HMAC-signed OAuth state via `createOAuthState()` |
| `app/api/stripe-onboarding/callback/route.ts` | Verify HMAC-signed state via `verifyOAuthState()` |
| `app/api/admin/update-user-email/route.ts` | Added `requireSuperAdmin` auth, removed default credentials |
| `app/api/platform-providers-status/route.ts` | Added `requireSuperAdmin` auth to GET/POST |
| `app/api/platform-providers-status/test-connections.ts` | **NEW** — extracted test functions from route.ts |
| `app/api/platform-providers-status/test/[provider]/route.ts` | Added `requireSuperAdmin` auth, updated import |
| `app/api/stripe-platform-status/route.ts` | Added `requireSuperAdmin` auth |
| `app/api/create-checkout/route.ts` | Fixed `tenant_members` → `tenant_users` |
| `app/(public)/w/[tenantSlug]/[waiverSlug]/page.tsx` | Added DOMPurify sanitization to `dangerouslySetInnerHTML` |
| `supabase/migrations/20260806120000_audit_fix_rls_policies.sql` | **NEW** — RLS hardening, helper functions, indexes |
| `supabase/migrations/20260806130000_phase8_booking_payment_infrastructure.sql` | **NEW** — 6 tables + 13 RPCs for booking-to-payment flow |
| `supabase/migrations/20260806140000_phase2_integration_infrastructure.sql` | **NEW** — 10 tables + 12 RPCs for integrations, webhooks, API keys, calendar |
| `docs/audits/OPERAN_FULL_AUDIT.md` | **NEW** — This file |
| `docs/audits/OPERAN_ARCHITECTURE.md` | **NEW** — Architecture map |
| `docs/audits/OPERAN_SECURITY.md` | **NEW** — Security audit report |
| `docs/audits/OPERAN_FEATURE_MATRIX.md` | **NEW** — Feature completeness matrix |
| `docs/audits/OPERAN_DATABASE_RLS.md` | **NEW** — RLS policy reference |

### Database Changes Applied (Live)

**Audit phase (RLS hardening):**
- Created `is_tenant_member()` and `is_super_admin()` helper functions
- Replaced 20+ overly-permissive RLS policies with tenant-scoped versions
- Added authorization checks to `get_dashboard_metrics`, `get_automation_metrics`
- Fixed `ensure_tenant_membership` search_path
- Added 16 performance indexes

**Phase 1 (booking & payments infrastructure):**
- Created 6 tables: `payments`, `webhook_events`, `booking_access_tokens`, `platform_fee_config`, `notifications`, `rate_limit_log`
- Created 13 RPC functions: `check_rate_limit`, `get_public_availability`, `calculate_booking_price`, `create_public_booking_hold`, `create_booking_access_token`, `create_booking_checkout`, `record_webhook_event`, `confirm_payment_from_webhook`, `expire_checkout_session`, `record_payment_failure`, `process_refund`, `mark_webhook_processed`, `expire_stale_holds`
- All tables have RLS enabled with tenant-scoped policies

**Phase 2 (integration infrastructure):**
- Created 10 tables: `event_outbox`, `activity_log`, `tenant_ical_feeds`, `tenant_webhook_endpoints`, `tenant_webhook_deliveries`, `tenant_api_keys`, `integration_activity_logs`, `tenant_calendar_connections`, `listing_availability_blocks`, `webhook_outbox`
- Created 12 RPC functions: `emit_domain_event`, `log_integration_activity`, `generate_ical_feed_token`, `generate_webhook_signing_secret`, `authenticate_api_key`, `create_webhook_deliveries_for_event`, `check_listing_availability_with_blocks`, `emit_reservation_event`, `emit_payment_event`, `emit_customer_event`, `emit_waiver_event`, `emit_workflow_event`
- Modified `tenant_integrations`: added 9 operational columns
- Modified `reservations`: added `google_calendar_event_id`
- All tables have RLS enabled with `is_tenant_member()` policies (not `current_tenant_id()`)
- Reloaded PostgREST schema cache

---

## Related Documents
- [OPERAN_ARCHITECTURE.md](./OPERAN_ARCHITECTURE.md) — Full architecture map
- [OPERAN_SECURITY.md](./OPERAN_SECURITY.md) — Detailed security findings
- [OPERAN_FEATURE_MATRIX.md](./OPERAN_FEATURE_MATRIX.md) — Feature completeness matrix
- [OPERAN_DATABASE_RLS.md](./OPERAN_DATABASE_RLS.md) — RLS policy reference
