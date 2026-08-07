# OPERAN Security Audit Report

**Audit Date:** 2026-08-06
**Auditor:** Automated comprehensive audit
**Scope:** Full platform — API routes, RLS policies, secrets, OAuth, XSS, SSRF, webhooks

---

## Executive Summary

The audit identified **2 P0 (critical)**, **5 P1 (high)**, **8 P2 (medium)**, and **3 P3 (low)** security issues. All P0 and P1 issues have been **fixed** in this audit. P2 items are documented for remediation.

---

## Findings (Post-Fix Status)

### P0 — Critical

| # | Finding | Status | Fix |
|---|---------|--------|-----|
| 1 | **Unauthenticated admin creation endpoint** — `app/api/admin/update-user-email/route.ts` allowed anyone to POST and create super_admin users with default credentials, no auth required. | **FIXED** | Added `requireSuperAdmin` guard, removed default credentials, added input validation. |
| 2 | **RLS policies with `qual: true` on sensitive tables** — `platform_provider_secrets`, `bookings`, `guests`, `captains`, `captain_checklists`, `vessels`, `waivers` were readable by anonymous users. `platform_provider_secrets` was writable by anyone. `tenants` was fully mutable by any authenticated user. | **FIXED** | Replaced all overly-permissive policies with tenant-scoped checks using `is_tenant_member()` helper function. `platform_provider_secrets` now denies all non-service-role access. |

### P1 — High

| # | Finding | Status | Fix |
|---|---------|--------|-----|
| 3 | **Stripe OAuth state not HMAC-signed** — State parameter was plain base64-encoded `{tenant_id}`, trivially forgeable. Callback had no session verification. | **FIXED** | Now uses `createOAuthState()`/`verifyOAuthState()` with HMAC-SHA256 signing, 10-minute expiry, and timing-safe comparison. |
| 4 | **Platform provider status endpoints unauthenticated** — GET and POST on `/api/platform-providers-status` and `/api/platform-providers-status/test/[provider]` exposed credential configuration and allowed triggering live API tests. | **FIXED** | Added `requireSuperAdmin` guard to all three handlers. |
| 5 | **XSS in public waiver page** — `dangerouslySetInnerHTML` rendered template HTML without sanitization. | **FIXED** | Added DOMPurify sanitization with strict allowlist of tags and attributes. |
| 6 | **`tenant_members` table reference in create-checkout** — Referenced non-existent `tenant_members` table instead of `tenant_users`. | **FIXED** | Corrected to `tenant_users`. |
| 7 | **SECURITY DEFINER functions without authorization** — `get_dashboard_metrics` and `get_automation_metrics` accepted any tenant_id without verifying caller membership. `ensure_tenant_membership` lacked `search_path` setting. | **FIXED** | Added `is_tenant_member()` / `is_super_admin()` checks and `SET search_path = public`. |

### P2 — Medium (Documented, Remediation Recommended)

| # | Finding | Files | Remediation |
|---|---------|-------|-------------|
| 8 | **Hardcoded fallback encryption keys** — `lib/integrations/crypto.ts` fell back to well-known dev keys if `INTEGRATION_ENCRYPTION_KEY` not set. | `lib/integrations/crypto.ts` | **FIXED** — Now throws an error if env var is missing instead of using a fallback. |
| 9 | **`x-cron-internal: db-cron` auth bypass** — Edge functions accept this trivially forgeable header as valid auth. | `supabase/functions/deliver-webhooks/`, `sync-ical-imports/`, `process-outbox/`, `process-workflows/` | Remove the `x-cron-internal` bypass or replace with a proper shared secret. |
| 10 | **CRON_SECRET in query strings** — May appear in access logs and CDN logs. | `expire-holds`, `process-outbox`, `process-workflows` | Move to header-only authentication. |
| 11 | **No SSRF protection on webhook delivery** — `deliver-webhooks` edge function doesn't block private IPs at fetch time. | `supabase/functions/deliver-webhooks/index.ts` | Add `isPrivateHost()` check before delivery, as done in `process-workflows`. |
| 12 | **Missing redirect-following protection in iCal sync** — Default `fetch()` follows redirects, could redirect to private IPs. | `supabase/functions/sync-ical-imports/index.ts` | Use `redirect: 'manual'` or add `fetchWithRedirectProtection()`. |
| 13 | **PostMessage uses wildcard targetOrigin** — Booking embed sends messages to `*`. | `hooks/use-embed-postmessage.ts` | Use the parent origin from configuration. |
| 14 | **Stripe platform status endpoint** — Was unauthenticated, exposed boolean config flags. | `app/api/stripe-platform-status/route.ts` | **FIXED** — Added `requireSuperAdmin` guard. |
| 15 | **Listing-related tables lack tenant isolation in write policies** — `listing_blocks`, `listing_fixed_start_times`, `listing_operating_hours` had `true` for write policies. | Database RLS | **FIXED** — Now scoped via listing ownership join. |

### P3 — Low

| # | Finding | Notes |
|---|---------|-------|
| 16 | OAuth state comparison used `Buffer.equals()` instead of `timingSafeEqual()` | **FIXED** — Now uses `crypto.timingSafeEqual()`. |
| 17 | Incomplete 172.x private range check in iCal feed creation | Only checked 172.16, missing 172.17-172.31. Edge function has correct check. |
| 18 | No consumer-facing replay protection for outgoing webhooks | Idempotency key exists in outbox but not sent to consumer. |

---

## Positive Security Findings

- **Service role key**: Never exposed to browser. Only used in server-side code and edge functions.
- **Stripe webhook verification**: Properly uses `constructEvent()` with signature verification.
- **Resend webhook verification**: Uses `timingSafeEqual` for signature validation.
- **Server-side price calculation**: Checkout amounts resolved from DB, not client input.
- **Platform secrets vault**: AES-256-GCM with proper IV generation and auth tag.
- **Google Calendar OAuth**: HMAC-signed state with expiry + encrypted token storage.
- **SSRF protection in workflows**: Complete private IP blocking + redirect protection.
- **Waiver submission**: Server-side XSS sanitization with `xss` library.
- **Public API v1**: Proper API key authentication with scope checks.
- **All 22 tables have RLS enabled**: No tables without row-level security.

---

## RLS Policy Summary (Post-Fix)

| Table | Anonymous Read | Authenticated Read | Write |
|-------|---------------|-------------------|-------|
| tenants | Yes (public storefront) | Yes | Super admin or tenant member (update only) |
| listings | Active only | Tenant-scoped + super admin | Tenant members |
| listing_pricing_options | Active only | Tenant-scoped | Tenant members |
| listing_blocks | Active listings only | Via listing ownership | Via listing ownership |
| listing_operating_hours | Active listings only | Via listing ownership | Via listing ownership |
| listing_fixed_start_times | Active listings only | Via listing ownership | Via listing ownership |
| reservations | No | Tenant-scoped + super admin | Tenant members |
| bookings | No | Tenant-scoped + super admin | Tenant members |
| customers | No | Tenant-scoped + super admin | Tenant members |
| opportunities | No | Tenant-scoped + super admin | Tenant members |
| pipelines | No | Tenant-scoped + super admin | Tenant members |
| pipeline_stages | No | Tenant-scoped + super admin | Tenant members |
| guests | No | Tenant-scoped + super admin | Tenant members |
| captains | No | Tenant-scoped + super admin | Tenant members |
| captain_checklists | No | Tenant-scoped + super admin | Tenant members |
| vessels | No | Tenant-scoped + super admin | Tenant members |
| waivers | No | Tenant-scoped + super admin | Public insert (signing), tenant update |
| tenant_users | No | Own memberships + super admin | — |
| tenant_integrations | No | Tenant-scoped | Tenant members |
| platform_provider_secrets | No | No (service role only) | No (service role only) |
| integration_catalog | Yes | Yes | — |
| plan_pricing | No | Yes (authenticated) | Super admin |
