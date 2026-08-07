# OPERAN Feature Matrix

**Audit Date:** 2026-08-06
**Branch:** audit/operan-full-audit
**Supabase Project:** zxflexiywouechzvapbi

## Status Legend

| Status | Meaning |
|--------|---------|
| ✅ Complete | Fully implemented and functional |
| ⚠️ Partial | Some parts work, others missing |
| 🎨 UI Only | Interface exists but backend missing |
| ❌ Broken | Implemented but non-functional |
| 🚫 Missing | Not implemented at all |
| 🔍 Runtime | Requires runtime verification with real credentials |

---

## 1. Authentication & Authorization

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| Email/password login | ✅ Complete | `app/(public)/login/page.tsx`, `lib/auth.tsx` | `auth.users`, `tenant_users` | Low | Fixed: split embedded PostgREST join, fixed NULL columns in manually-created users |
| Super Admin detection | ✅ Complete | `lib/auth.tsx` | `auth.users` (JWT metadata) | Medium | Role from `user_metadata.role` in JWT — not falsifiable via PostgREST |
| Tenant membership lookup | ✅ Complete | `lib/auth.tsx` | `tenant_users` | Low | |
| Auto-register tenant | ⚠️ Partial | `lib/auth.tsx` | `tenant_users`, `tenants` | Medium | Assigns user to FIRST tenant found — wrong for multi-tenant |
| Forgot password | ✅ Complete | `app/(public)/login/page.tsx` | - | Low | Uses Supabase `resetPasswordForEmail` |
| Reset password | ✅ Complete | `app/(public)/reset-password/page.tsx` | - | Low | Listens for `PASSWORD_RECOVERY` event |
| Show/hide password | ✅ Complete | `app/(public)/login/page.tsx` | - | None | |
| Role-based routing | ✅ Complete | `app/(public)/login/page.tsx`, `app/(dashboard)/admin/page.tsx` | - | Low | super_admin → /super-admin, tenant_admin → /admin |
| Session persistence | ✅ Complete | `lib/auth.tsx` | - | Low | Supabase handles session tokens |

## 2. Super Admin

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| Dashboard with stats | ⚠️ Partial | `app/super-admin/page.tsx` | `tenants`, `reservations` | Low | Basic stats work |
| Tenant list | ✅ Complete | `app/super-admin/tenants/page.tsx` | `tenants` | Low | |
| Create tenant | ⚠️ Partial | `app/super-admin/tenants/new/page.tsx` | `tenants`, `tenant_users`, `plan_pricing` | Medium | Creates tenant + user via Supabase signup API |
| Edit tenant | ⚠️ Partial | `app/super-admin/tenants/new/page.tsx` | `tenants` | Low | Uses same page with `?id=` |
| Suspend/activate tenant | ✅ Complete | `app/super-admin/tenants/page.tsx` | `tenants` | Low | |
| Plan pricing management | ⚠️ Partial | `app/super-admin/settings/page.tsx` | `plan_pricing` | Low | |
| Platform secrets vault | ⚠️ Partial | `app/api/platform-secrets/route.ts` | `platform_provider_secrets` | Medium | Encryption works, but `platform_secret_audit_log` table missing |
| Platform fee config | 🎨 UI Only | `app/super-admin/integrations/page.tsx` | `platform_fee_config` ❌ | High | Table doesn't exist |
| Billing/invoices | 🎨 UI Only | `app/super-admin/billing/page.tsx` | `invoices` ❌ | Medium | Table doesn't exist |
| Listings overview | ⚠️ Partial | `app/super-admin/listings/page.tsx` | `tenants`, `listings` | Low | |
| Worker health | 🎨 UI Only | `app/super-admin/worker-health/page.tsx` | `automation_runs` ❌, `automation_step_runs` ❌, etc. | Medium | All referenced tables missing |
| Platform provider status | ⚠️ Partial | `app/api/platform-providers-status/route.ts` | `platform_provider_secrets` | Low | |

## 3. Tenant Dashboard

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| Overview dashboard | ✅ Complete | `app/(dashboard)/admin/page.tsx` | `reservations`, `customers`, `pipelines`, `pipeline_stages`, `opportunities` | Low | Uses RPC functions for metrics |
| Business health widget | ✅ Complete | `app/(dashboard)/admin/page.tsx` | - | None | Hardcoded health checks (not from real data) |
| KPI stat cards | ✅ Complete | `app/(dashboard)/admin/page.tsx` | - | Low | Data from `get_dashboard_metrics` RPC |
| Calendar view | ✅ Complete | `components/dashboard/reservation-calendar.tsx` | `reservations` | Low | |
| Upcoming charters | ✅ Complete | `components/dashboard/upcoming-charters.tsx` | `reservations` | Low | |

## 4. Listings Management

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| List listings | ✅ Complete | `app/(dashboard)/listings/page.tsx` | `listings` | Low | |
| Create/edit listing | ⚠️ Partial | `app/(dashboard)/listings/manage/page.tsx` | `listings`, `listing_pricing_options` | Medium | UI comprehensive, but many fields may not be used |
| Pricing options | ⚠️ Partial | `app/(dashboard)/listings/manage/page.tsx` | `listing_pricing_options` | Medium | CRUD works, but `calculate_booking_price` RPC missing |
| Operating hours | 🎨 UI Only | `app/(dashboard)/listings/manage/page.tsx` | `listing_operating_hours` | Medium | Table exists but `get_public_availability` RPC missing |
| Fixed start times | 🎨 UI Only | `app/(dashboard)/listings/manage/page.tsx` | `listing_fixed_start_times` | Medium | Table exists but availability RPC missing |
| Listing blocks | 🎨 UI Only | - | `listing_blocks` | Medium | Table exists but no management UI found |
| Publish listing | ⚠️ Partial | `app/(dashboard)/listings/manage/page.tsx` | `listings` | Low | `is_active` field toggleable |
| Website & booking config | ⚠️ Partial | `app/(dashboard)/listings/manage/page.tsx` | `listings` | Low | |

## 5. Public Booking Flow

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| Tenant catalog page | ✅ Complete | `app/(public)/r/[tenantSlug]/page.tsx` | `tenants`, `listings`, `listing_pricing_options` | Low | |
| Listing detail page | ✅ Complete | `app/(public)/r/[tenantSlug]/[listingSlug]/page.tsx` | `tenants`, `listings`, `listing_pricing_options` | Low | |
| Direct booking page | ✅ Complete (UI) | `app/(public)/booking/[slug]/[listingSlug]/page.tsx` | same | Low | |
| Embed booking | ⚠️ Partial | `app/(public)/booking/[slug]/[listingSlug]/page.tsx` | same | Medium | UI works, postMessage implemented |
| Package selection | ✅ Complete (UI) | `components/booking/booking-flow.tsx` | `listing_pricing_options` | Low | |
| Date selection (calendar) | ✅ Complete (UI) | `components/booking/booking-flow.tsx` | - | Low | Calendar rendered client-side |
| Availability check | ❌ Broken | `components/booking/booking-flow.tsx` | - | **Critical** | Calls `get_public_availability` RPC — **DOES NOT EXIST** |
| Price calculation | ❌ Broken | `components/booking/booking-flow.tsx` | - | **Critical** | Calls `calculate_booking_price` RPC — **DOES NOT EXIST** |
| Rate limiting | ❌ Broken | `components/booking/booking-flow.tsx` | - | High | Calls `check_rate_limit` RPC — **DOES NOT EXIST** |
| Booking hold creation | ❌ Broken | `components/booking/booking-flow.tsx` | - | **Critical** | Calls `create_public_booking_hold` RPC — **DOES NOT EXIST** |
| Booking access token | ❌ Broken | `components/booking/booking-flow.tsx` | `booking_access_tokens` ❌ | **Critical** | RPC + table don't exist |
| Payment success page | 🎨 UI Only | `app/(public)/booking/[slug]/payment/success/page.tsx` | - | Low | |
| Payment cancelled page | 🎨 UI Only | `app/(public)/booking/[slug]/payment/cancelled/page.tsx` | - | Low | |

## 6. Payments (Stripe Connect)

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| Stripe OAuth connect | ⚠️ Partial | `app/api/stripe-onboarding/route.ts` | `tenant_integrations`, `platform_provider_secrets` | **P0** | **State parameter NOT signed — CSRF vuln** |
| Stripe OAuth callback | ❌ Broken (Security) | `app/api/stripe-onboarding/callback/route.ts` | `tenant_integrations` | **P0** | **No user session verification, unsigned state** |
| Manual API key config | 🔍 Runtime | `app/api/stripe-onboarding/route.ts` | `tenant_integrations` | Medium | Validates key with Stripe API |
| Stripe disconnect | 🔍 Runtime | `app/api/stripe-onboarding/route.ts` | `tenant_integrations` | Low | Best-effort deauthorization |
| Create checkout session | ❌ Broken | `app/api/create-checkout/route.ts`, `lib/services/payment-service.ts` | `payments` ❌, `platform_fee_config` ❌, `booking_access_tokens` ❌ | **Critical** | Multiple missing tables and RPCs |
| Stripe webhook handler | ❌ Broken | `app/api/stripe-webhook/route.ts` | `webhook_events` ❌, `payments` ❌ | **Critical** | Tables and RPCs don't exist |
| Payment confirmation | ❌ Broken | `app/api/stripe-webhook/route.ts` | `payments` ❌ | **Critical** | `confirm_payment_from_webhook` RPC missing |
| Refund processing | ❌ Broken | `app/api/stripe-webhook/route.ts` | `payments` ❌ | **Critical** | `process_refund` RPC missing |
| Platform fees | ❌ Broken | `lib/services/payment-service.ts` | `platform_fee_config` ❌ | High | Table doesn't exist |

## 7. Reservations

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| List reservations | ✅ Complete | `app/(dashboard)/reservations/page.tsx` | `reservations` | Low | |
| View reservation | ✅ Complete | various dashboard components | `reservations` | Low | |
| Reservation timeline | ⚠️ Partial | `components/dashboard/reservation-timeline.tsx` | `reservations`, `payments` ❌ | Medium | Payments table missing |
| Status management | ⚠️ Partial | `lib/services/reservation-service.ts` | `reservations` | Medium | `reservation_status_labels` ❌ table missing |

## 8. Customers/CRM

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| Customer list | ✅ Complete | `app/(dashboard)/customers/page.tsx` | `customers` | Low | |
| Customer CRUD | ✅ Complete | `lib/services/customer-service.ts` | `customers` | Low | |
| Customer dedup | ⚠️ Partial | `lib/services/customer-service.ts` | `customers` | Medium | normalized_email/phone exist but dedup logic basic |

## 9. Pipeline/CRM

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| Pipeline management | ✅ Complete | `lib/services/pipeline-service.ts` | `pipelines`, `pipeline_stages` | Low | |
| Kanban board | ✅ Complete | `components/dashboard/kanban-board.tsx` | `opportunities`, `pipeline_stages` | Low | |
| Opportunity CRUD | ✅ Complete | `lib/services/opportunity-service.ts` | `opportunities` | Low | |
| Opportunity notes | ❌ Broken | `components/dashboard/notes-drawer.tsx` | `opportunity_notes_native` ❌ | Medium | Table doesn't exist |
| Activity log | ❌ Broken | `lib/services/activity-service.ts` | `activity_log` ❌ | Medium | Table doesn't exist |

## 10. Integrations

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| Integration catalog | ✅ Complete | `lib/integrations/integration-service.ts` | `integration_catalog` | Low | |
| Tenant integrations | ✅ Complete | `lib/integrations/integration-service.ts` | `tenant_integrations` | Low | |
| Google Calendar OAuth | ⚠️ Partial | `app/api/integrations/google-calendar/` | `tenant_calendar_connections` ❌ | **P1** | Table doesn't exist |
| Google Calendar sync | ❌ Broken | `lib/integrations/google-calendar-service.ts` | `tenant_calendar_connections` ❌, `listing_availability_blocks` ❌ | **P1** | Tables don't exist |
| iCal export | ❌ Broken | `app/ical/[token]/route.ts` | `tenant_ical_feeds` ❌ | Medium | Table doesn't exist |
| iCal import | ❌ Broken | `supabase/functions/sync-ical-imports/` | `tenant_ical_feeds` ❌, `listing_availability_blocks` ❌ | Medium | Tables don't exist |
| Outgoing webhooks | ❌ Broken | `app/api/integrations/webhooks/` | `tenant_webhook_endpoints` ❌, `tenant_webhook_deliveries` ❌ | Medium | Tables don't exist |
| API keys | ❌ Broken | `app/api/integrations/api-keys/` | `tenant_api_keys` ❌ | Medium | Table doesn't exist |
| Email (Resend) | ❌ Broken | `app/api/integrations/email/` | `tenant_email_domains` ❌, `tenant_email_senders` ❌ | Medium | Tables don't exist |

## 11. Automations

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| Workflow builder UI | 🎨 UI Only | `app/(dashboard)/automations/` | `automation_workflows` ❌ | Medium | Full builder UI exists but no backend |
| Workflow processing | ❌ Broken | `supabase/functions/process-workflows/` | `automation_runs` ❌, `automation_step_runs` ❌, `automation_workflow_versions` ❌ | High | Edge function exists but tables missing |
| Event outbox | ❌ Broken | `supabase/functions/process-outbox/` | `event_outbox` ❌ | High | Table doesn't exist |
| Webhook delivery worker | ❌ Broken | `supabase/functions/deliver-webhooks/` | `webhook_outbox` ❌ | Medium | Table doesn't exist |

## 12. Communications

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| Communication service | ❌ Broken | `lib/communications/communication-service.ts` | `tenant_communication_settings` ❌, `communication_templates` ❌ | Medium | Tables don't exist |
| Template rendering | ❌ Broken | `lib/communications/template-renderer.ts` | `communication_templates` ❌ | Medium | |
| Workflow engine | ❌ Broken | `lib/communications/workflow-engine.ts` | Multiple missing | High | |
| Communications page | 🎨 UI Only | `app/(dashboard)/communications/page.tsx` | `communication_templates` ❌ | Medium | |

## 13. Waivers & Contracts

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| Waiver submission page | ⚠️ Partial | `app/(public)/w/[tenantSlug]/[waiverSlug]/page.tsx` | `tenants`, `waiver_templates` ❌ | Medium | `waiver_templates` table missing, but `waivers` exists |
| Waiver submission API | ⚠️ Partial | `app/api/submit-waiver/route.ts` | `waivers` | Low | Basic submission works |

## 14. Notifications

| Feature | Status | Files | Tables | Risk | Notes |
|---------|--------|-------|--------|------|-------|
| Notification service | ❌ Broken | `lib/services/notification-service.ts` | `notifications` ❌ | Medium | Table doesn't exist |

---

## Summary

| Category | Complete | Partial | UI Only | Broken | Missing |
|----------|----------|---------|---------|--------|---------|
| Auth & Roles | 7 | 1 | 0 | 0 | 0 |
| Super Admin | 3 | 5 | 2 | 0 | 0 |
| Tenant Dashboard | 5 | 0 | 0 | 0 | 0 |
| Listings | 2 | 4 | 2 | 0 | 0 |
| Booking Flow | 4 | 1 | 2 | 4 | 0 |
| Payments | 0 | 1 | 0 | 6 | 0 |
| Reservations | 2 | 2 | 0 | 0 | 0 |
| CRM | 3 | 1 | 0 | 0 | 0 |
| Pipeline | 3 | 0 | 0 | 2 | 0 |
| Integrations | 2 | 1 | 0 | 5 | 0 |
| Automations | 0 | 0 | 1 | 3 | 0 |
| Communications | 0 | 0 | 1 | 3 | 0 |
| Waivers | 0 | 2 | 0 | 0 | 0 |
| Notifications | 0 | 0 | 0 | 1 | 0 |
| **TOTALS** | **31** | **18** | **8** | **24** | **0** |

### Missing Database Objects

**~34 tables referenced in code but not in database:**
`payments`, `notifications`, `activity_log`, `webhook_events`, `platform_fee_config`, `booking_access_tokens`, `tenant_ical_feeds`, `listing_availability_blocks`, `tenant_calendar_connections`, `tenant_webhook_endpoints`, `tenant_webhook_deliveries`, `tenant_api_keys`, `tenant_email_domains`, `tenant_email_senders`, `tenant_communication_settings`, `communication_templates`, `communication_messages`, `automation_workflows`, `automation_workflow_versions`, `automation_runs`, `automation_step_runs`, `event_outbox`, `webhook_outbox`, `worker_health_log`, `platform_integrations`, `opportunity_notes_native`, `waiver_templates`, `invoices`, `integration_activity_logs`, `provider_events`, `reservation_status_labels`, `platform_secret_audit_log`

**12 RPC functions referenced but not in database:**
`get_public_availability`, `calculate_booking_price`, `create_public_booking_hold`, `check_rate_limit`, `create_booking_access_token`, `create_booking_checkout`, `record_webhook_event`, `confirm_payment_from_webhook`, `expire_checkout_session`, `record_payment_failure`, `process_refund`, `mark_webhook_processed`
