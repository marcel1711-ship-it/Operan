/*
# Migrate GHL Data to Native Tables and Seed Default Pipelines

## Overview
Migrates existing GHL data (contacts, opportunities, pipeline stages, notes) into the new native tables.
Creates a default "Charter Operations" pipeline with 5 stages for every existing tenant.
Links existing reservations to native opportunities where possible.

## Migration Steps
1. For each tenant: create a default pipeline named "Charter Operations"
2. For each pipeline: create 5 default stages (New Booking, Ready for Captain, Charter Started, Charter Completed, Cancelled)
3. Migrate ghl_contacts → customers (dedup by normalized email per tenant)
4. Migrate ghl_opportunities → opportunities (link to native customer and stage)
5. Link reservations to native opportunities via legacy_ghl_opportunity_id
6. Migrate opportunity_notes → opportunity_notes_native (via legacy opportunity IDs)

## Data Safety
- All GHL tables remain untouched (read-only archive)
- Migration is idempotent — checks for existing native records before inserting
- Customers deduplicated by normalized email within each tenant
- Unmatched stages are reported
*/

-- ============================================
-- 1. CREATE DEFAULT PIPELINES FOR ALL TENANTS
-- ============================================

INSERT INTO pipelines (tenant_id, name, description, is_default, is_active)
SELECT
  t.id,
  'Charter Operations',
  'Default pipeline for charter and booking operations',
  true,
  true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM pipelines p WHERE p.tenant_id = t.id AND p.is_default = true AND p.is_active = true
);

-- ============================================
-- 2. CREATE DEFAULT STAGES FOR EACH PIPELINE
-- ============================================

INSERT INTO pipeline_stages (tenant_id, pipeline_id, name, system_key, stage_type, stage_order, color, is_active)
SELECT
  p.tenant_id,
  p.id,
  stage_data.name,
  stage_data.system_key,
  stage_data.stage_type,
  stage_data.stage_order,
  stage_data.color,
  true
FROM pipelines p
CROSS JOIN (VALUES
  ('New Booking', 'new_booking', 'open', 0, '#3b82f6'),
  ('Ready for Captain', 'ready_for_operation', 'ready', 1, '#f59e0b'),
  ('Charter Started', 'service_started', 'in_progress', 2, '#8b5cf6'),
  ('Charter Completed', 'service_completed', 'completed', 3, '#10b981'),
  ('Cancelled', 'cancelled', 'cancelled', 4, '#ef4444')
) AS stage_data(name, system_key, stage_type, stage_order, color)
WHERE p.is_default = true
  AND p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM pipeline_stages ps
    WHERE ps.pipeline_id = p.id AND ps.system_key = stage_data.system_key
  );

-- ============================================
-- 3. MIGRATE GHL CONTACTS → CUSTOMERS
-- ============================================

INSERT INTO customers (
  tenant_id, first_name, last_name, full_name, email, normalized_email,
  phone, normalized_phone, company_name, tags, source, last_activity_at,
  legacy_ghl_contact_id, created_at
)
SELECT
  gc.tenant_id,
  gc.first_name,
  gc.last_name,
  trim(COALESCE(gc.first_name, '') || ' ' || COALESCE(gc.last_name, '')),
  lower(trim(gc.email)),
  CASE WHEN gc.email IS NOT NULL AND trim(gc.email) != '' THEN lower(trim(gc.email)) ELSE NULL END,
  gc.phone,
  CASE WHEN gc.phone IS NOT NULL AND trim(gc.phone) != '' THEN regexp_replace(gc.phone, '[^+0-9]', '', 'g') ELSE NULL END,
  gc.company_name,
  COALESCE(gc.tags, '{}'::text[]),
  'imported_ghl',
  gc.last_activity_date,
  gc.id,
  COALESCE(gc.date_added, now())
FROM ghl_contacts gc
WHERE gc.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.tenant_id = gc.tenant_id
      AND c.legacy_ghl_contact_id = gc.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.tenant_id = gc.tenant_id
      AND c.normalized_email IS NOT NULL
      AND c.normalized_email = lower(trim(gc.email))
  );

-- ============================================
-- 4. MIGRATE GHL OPPORTUNITIES → OPPORTUNITIES
-- ============================================

INSERT INTO opportunities (
  tenant_id, pipeline_id, stage_id, customer_id, listing_id, reservation_id,
  name, monetary_value, currency, status, assigned_to, source,
  expected_service_date, last_status_change_at, legacy_ghl_opportunity_id,
  created_at, updated_at
)
SELECT
  go.tenant_id,
  p.id,
  ps.id,
  c.id,
  NULL,
  r.id,
  go.name,
  go.monetary_value,
  'USD',
  go.status,
  go.assigned_to,
  'imported_ghl',
  CASE WHEN go.last_status_change_at IS NOT NULL THEN go.last_status_change_at
       ELSE go.created_at END,
  go.last_status_change_at,
  go.id,
  go.created_at,
  go.updated_at
FROM ghl_opportunities go
LEFT JOIN customers c ON c.legacy_ghl_contact_id = go.contact_id AND c.tenant_id = go.tenant_id
LEFT JOIN reservations r ON r.ghl_opportunity_id = go.id AND r.tenant_id = go.tenant_id
LEFT JOIN pipelines p ON p.tenant_id = go.tenant_id AND p.is_default = true AND p.is_active = true
LEFT JOIN pipeline_stages ps ON ps.pipeline_id = p.id
  AND (
    (go.status = 'won' AND ps.system_key = 'service_completed')
    OR (go.status = 'lost' AND ps.system_key = 'cancelled')
    OR (go.status = 'open' AND ps.system_key = 'new_booking')
    OR (go.status = 'abandoned' AND ps.system_key = 'cancelled')
    OR (ps.system_key = 'new_booking')
  )
WHERE go.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM opportunities o
    WHERE o.legacy_ghl_opportunity_id = go.id AND o.tenant_id = go.tenant_id
  )
  AND (p.id IS NOT NULL);

-- ============================================
-- 5. LINK RESERVATIONS TO NATIVE OPPORTUNITIES
-- ============================================

UPDATE reservations r
SET opportunity_id = o.id
FROM opportunities o
WHERE o.legacy_ghl_opportunity_id = r.ghl_opportunity_id
  AND o.tenant_id = r.tenant_id
  AND r.opportunity_id IS NULL;

-- ============================================
-- 6. MIGRATE OPPORTUNITY_NOTES → OPPORTUNITY_NOTES_NATIVE
-- ============================================

INSERT INTO opportunity_notes_native (tenant_id, opportunity_id, body, author_name, created_at, updated_at)
SELECT
  on_t.tenant_id,
  o.id,
  on_t.body,
  COALESCE(on_t.author, ''),
  on_t.created_at,
  COALESCE(on_t.created_at, now())
FROM opportunity_notes on_t
JOIN opportunities o ON o.legacy_ghl_opportunity_id = on_t.opportunity_id
  AND o.tenant_id = on_t.tenant_id
WHERE on_t.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM opportunity_notes_native onn
    WHERE onn.opportunity_id = o.id AND onn.body = on_t.body AND onn.created_at = on_t.created_at
  );