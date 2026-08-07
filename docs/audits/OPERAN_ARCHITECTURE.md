# OPERAN Architecture Map

**Audit Date:** 2026-08-06

## Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 13.5.1 |
| Runtime | React | 18.2.0 |
| Language | TypeScript | 5.2.2 |
| Database | Supabase (PostgreSQL + PostgREST) | ^2.58.0 |
| Auth | Supabase Auth (GoTrue) | — |
| Payments | Stripe Connect | ^22.4.0 |
| UI | shadcn/ui (Radix + Tailwind) | — |
| Styling | Tailwind CSS | 3.3.3 |
| Validation | Zod + react-hook-form | ^3.23.8 / ^7.53.0 |
| Charts | Recharts | ^2.12.7 |
| Dates | date-fns | ^3.6.0 |
| Deployment | Vercel / Netlify | — |

## Multi-Tenancy Model

- **Row-Level Security**: All 22 tables have RLS enabled
- **Tenant isolation**: `tenant_id` column on tenant-scoped tables
- **User-tenant mapping**: `tenant_users` table (user_id + tenant_id + role)
- **Roles**: `super_admin` (platform operator), `tenant_admin` (business operator)
- **Super admin detection**: `user_metadata.role` in JWT, not in `tenant_users`

## Route Architecture

### Public Routes (`app/(public)/`)
- `/login` — Authentication
- `/reset-password` — Password reset
- `/r/[tenantSlug]` — Tenant storefront catalog
- `/r/[tenantSlug]/[listingSlug]` — Individual listing
- `/booking/[slug]/[listingSlug]` — Booking flow
- `/w/[tenantSlug]/[waiverSlug]` — Waiver signing
- `/` — Landing page

### Dashboard Routes (`app/(dashboard)/`)
- `/admin` — Tenant dashboard with KPIs
- `/reservations` — Reservation management
- `/customers` — CRM customer list
- `/pipelines` — Kanban CRM pipeline
- `/listings/manage` — Listing editor
- `/integrations` — Integration configuration
- `/automations` — Workflow automation builder
- `/communications` — Communications center
- `/settings` — Tenant settings

### Super Admin Routes (`app/super-admin/`)
- `/super-admin` — Platform dashboard
- `/super-admin/tenants` — Tenant management
- `/super-admin/integrations` — Platform provider status
- `/super-admin/billing` — Billing overview
- `/super-admin/worker-health` — Edge function monitoring

### API Routes (`app/api/`)
- **Stripe**: `/api/stripe-onboarding`, `/api/stripe-onboarding/callback`, `/api/create-checkout`, `/api/stripe-webhook`
- **Integrations**: `/api/integrations/google-calendar/*`, `/api/integrations/ical/*`, `/api/integrations/webhooks/*`, `/api/integrations/api-keys/*`, `/api/integrations/email/*`
- **Platform**: `/api/platform-secrets`, `/api/platform-providers-status`
- **Public API v1**: `/api/v1/listings`, `/api/v1/reservations`, `/api/v1/customers` (API key auth)
- **Webhooks (inbound)**: `/api/webhooks/resend`

## Database (22 tables + 1 view)

### Core Business
`tenants`, `tenant_users`, `listings`, `listing_pricing_options`, `listing_operating_hours`, `listing_fixed_start_times`, `listing_blocks`, `reservations`, `bookings`, `customers`, `guests`

### Operations
`vessels`, `captains`, `captain_checklists`, `waivers`

### CRM
`pipelines`, `pipeline_stages`, `opportunities`

### Platform
`integration_catalog`, `tenant_integrations`, `platform_provider_secrets`, `plan_pricing`

### View
`tenant_members` (view over `tenant_users`)

### RPC Functions (5 + 2 helper)
`auto_register_tenant`, `ensure_tenant_membership`, `get_dashboard_metrics`, `get_automation_metrics`, `handle_new_user`, `is_tenant_member`, `is_super_admin`

## Edge Functions (6)
- `expire-holds` — Expire stale booking holds
- `process-outbox` — Domain event outbox processing
- `deliver-webhooks` — HMAC-signed webhook delivery
- `sync-ical-imports` — iCal feed import
- `process-workflows` — Automation workflow execution
- `ghl-proxy` — **DEPRECATED** GoHighLevel proxy

## Key Services (`lib/services/`)
- `payment-service.ts` — Stripe checkout, server-side pricing
- `pipeline-service.ts` — CRM pipeline CRUD
- `reservation-service.ts` — Reservation lifecycle
- `customer-service.ts` — Customer CRUD with dedup
- `opportunity-service.ts` — CRM opportunity management
- `notification-service.ts` — Notification CRUD (table missing)
- `activity-service.ts` — Activity logging (table missing)

## Integration Framework (`lib/integrations/`)
- `registry.ts` — Adapter registry pattern
- `credential-resolver.ts` — Env var + vault credential resolution
- `platform-vault-crypto.ts` — AES-256-GCM platform secret encryption
- `crypto.ts` — AES-256-GCM tenant credential encryption + OAuth state HMAC
- `stripe-server.ts` — Stripe SDK initialization
- `resend-server.ts` — Resend email API
- `google-calendar-service.ts` — Google Calendar OAuth + sync

## Environment Variables

### Required for core functionality
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

### Required for payments
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_CLIENT_ID` (for Connect OAuth)

### Required for integrations
- `INTEGRATION_ENCRYPTION_KEY` (for OAuth token + state encryption)
- `PLATFORM_SECRETS_MASTER_KEY` (for vault)
- `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

### Edge functions
- `CRON_SECRET` (for scheduled job auth)
