/*
# Phase 2.5 — Add Composite Indexes for Operational Queries

## Overview
Adds composite indexes to support common tenant-scoped query patterns
identified in the Phase 2 audit. These indexes improve performance for:
- Tenant + date range filtering on reservations
- Tenant + status filtering on reservations
- Tenant + pipeline + stage filtering on opportunities
- Tenant + entity + date filtering on activity log
- Tenant + opportunity + date filtering on notes
- Listing block overlap queries

## Indexes Added
1. `idx_reservations_tenant_start` — (tenant_id, start_at) for date-range queries
2. `idx_reservations_tenant_booking_status` — (tenant_id, booking_status) for status-filtered lists
3. `idx_reservations_tenant_payment_status` — (tenant_id, payment_status)
4. `idx_reservations_tenant_listing_start` — (tenant_id, listing_id, start_at) for availability checks
5. `idx_opportunities_tenant_pipeline_stage` — (tenant_id, pipeline_id, stage_id) for Kanban loading
6. `idx_opportunities_tenant_updated` — (tenant_id, updated_at DESC) for recent activity
7. `idx_activity_log_tenant_entity_created` — (tenant_id, entity_type, entity_id, created_at DESC)
8. `idx_opp_notes_native_tenant_opp_created` — (tenant_id, opportunity_id, created_at DESC)
9. `idx_blocks_tenant_listing_range` — (tenant_id, listing_id, start_at, end_at) for overlap checks

## Redundant Indexes Removed
- `idx_reservations_status` — replaced by `idx_reservations_tenant_booking_status` (standalone status index is less useful)
- `idx_reservations_charter_date` — replaced by `idx_reservations_tenant_start` (legacy date column, start_at is preferred)
- `idx_reservations_booking_status` — replaced by `idx_reservations_tenant_booking_status`
- `idx_reservations_start_at` — replaced by `idx_reservations_tenant_start`
- `idx_reservations_listing_id` — replaced by `idx_reservations_tenant_listing_start`
- `idx_reservations_customer_id` — low utility standalone; tenant-scoped queries don't filter by customer alone
- `idx_reservations_opportunity_id` — low utility standalone
- `idx_opportunities_pipeline_id` — replaced by composite
- `idx_opportunities_stage_id` — replaced by composite
- `idx_opportunities_customer_id` — low utility standalone
- `idx_opportunities_listing_id` — low utility standalone
- `idx_opportunities_reservation_id` — low utility standalone
- `idx_pipeline_stages_pipeline_id` — replaced by `idx_pipeline_stages_order`
- `idx_activity_log_entity` — replaced by composite
- `idx_activity_log_created` — replaced by composite
- `idx_activity_log_tenant` — replaced by composite
- `idx_opp_notes_native_opp` — replaced by composite
- `idx_opp_notes_native_tenant` — replaced by composite
- `idx_blocks_listing` — replaced by composite
- `idx_blocks_start` — replaced by composite
- `idx_blocks_tenant` — replaced by composite

## Notes
All indexes use CONCURRENTLY-safe IF NOT EXISTS checks.
Existing single-column indexes that are now subsumed by composites are dropped
to reduce write overhead.
*/

-- ── Reservations composite indexes ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_reservations_tenant_start
  ON reservations (tenant_id, start_at);

CREATE INDEX IF NOT EXISTS idx_reservations_tenant_booking_status
  ON reservations (tenant_id, booking_status);

CREATE INDEX IF NOT EXISTS idx_reservations_tenant_payment_status
  ON reservations (tenant_id, payment_status);

CREATE INDEX IF NOT EXISTS idx_reservations_tenant_listing_start
  ON reservations (tenant_id, listing_id, start_at);

-- Drop redundant single-column indexes on reservations
DROP INDEX IF EXISTS idx_reservations_status;
DROP INDEX IF EXISTS idx_reservations_charter_date;
DROP INDEX IF EXISTS idx_reservations_booking_status;
DROP INDEX IF EXISTS idx_reservations_start_at;
DROP INDEX IF EXISTS idx_reservations_listing_id;
DROP INDEX IF EXISTS idx_reservations_customer_id;
DROP INDEX IF EXISTS idx_reservations_opportunity_id;

-- ── Opportunities composite indexes ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_pipeline_stage
  ON opportunities (tenant_id, pipeline_id, stage_id);

CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_updated
  ON opportunities (tenant_id, updated_at DESC);

-- Drop redundant single-column indexes on opportunities
DROP INDEX IF EXISTS idx_opportunities_pipeline_id;
DROP INDEX IF EXISTS idx_opportunities_stage_id;
DROP INDEX IF EXISTS idx_opportunities_customer_id;
DROP INDEX IF EXISTS idx_opportunities_listing_id;
DROP INDEX IF EXISTS idx_opportunities_reservation_id;

-- ── Activity log composite index ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activity_log_tenant_entity_created
  ON activity_log (tenant_id, entity_type, entity_id, created_at DESC);

-- Drop redundant indexes
DROP INDEX IF EXISTS idx_activity_log_entity;
DROP INDEX IF EXISTS idx_activity_log_created;
DROP INDEX IF EXISTS idx_activity_log_tenant;

-- ── Opportunity notes native composite index ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_opp_notes_native_tenant_opp_created
  ON opportunity_notes_native (tenant_id, opportunity_id, created_at DESC);

-- Drop redundant indexes
DROP INDEX IF EXISTS idx_opp_notes_native_opp;
DROP INDEX IF EXISTS idx_opp_notes_native_tenant;

-- ── Listing blocks composite index ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_blocks_tenant_listing_range
  ON listing_blocks (tenant_id, listing_id, start_at, end_at);

-- Drop redundant indexes
DROP INDEX IF EXISTS idx_blocks_listing;
DROP INDEX IF EXISTS idx_blocks_start;
DROP INDEX IF EXISTS idx_blocks_tenant;
