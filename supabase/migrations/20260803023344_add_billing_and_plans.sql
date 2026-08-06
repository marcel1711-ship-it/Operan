/*
# Add Billing, Plans, and Subscription Management to Super Admin

## Overview
Extends the tenants table with plan/billing fields and creates a new invoices table for the Super Admin billing system.

## Modified Tables
### tenants
- `plan` (text, default 'starter') — Plan tier: starter | pro | enterprise
- `status` (text, default 'trial') — Subscription status: trial | active | suspended | cancelled
- `trial_ends_at` (timestamptz) — When the trial period ends
- `monthly_amount` (numeric, default 0) — Monthly recurring revenue per tenant
- `last_payment_at` (timestamptz) — Date of last successful payment
- `last_payment_amount` (numeric) — Amount of last payment
- `next_renewal_at` (timestamptz) — Next billing date
- `suspended_at` (timestamptz) — When the tenant was suspended (null if active)

## New Tables
### invoices
- `id` (uuid, PK)
- `tenant_id` (uuid, FK → tenants)
- `amount` (numeric, not null)
- `status` (text: pending | paid | failed — default 'pending')
- `due_date` (timestamptz, not null)
- `paid_at` (timestamptz)
- `stripe_invoice_id` (text)
- `description` (text)
- `created_at` (timestamptz, default now())

## Security
- RLS enabled on invoices.
- Super admin has full CRUD on invoices.
- Tenant admins can view their own invoices (read-only).
*/

-- ============================================
-- 1. ADD COLUMNS TO tenants
-- ============================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'enterprise')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS monthly_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payment_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS next_renewal_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

-- Set default trial period for existing tenants
UPDATE tenants
  SET trial_ends_at = created_at + interval '14 days',
      next_renewal_at = created_at + interval '30 days'
  WHERE trial_ends_at IS NULL;

-- Set monthly amounts based on plan
UPDATE tenants SET monthly_amount = 49.00 WHERE plan = 'starter';
UPDATE tenants SET monthly_amount = 149.00 WHERE plan = 'pro';
UPDATE tenants SET monthly_amount = 499.00 WHERE plan = 'enterprise';

-- ============================================
-- 2. CREATE invoices TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  due_date timestamptz NOT NULL,
  paid_at timestamptz,
  stripe_invoice_id text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

-- ============================================
-- 3. RLS POLICIES FOR invoices
-- ============================================

DROP POLICY IF EXISTS "select_invoices" ON invoices;
CREATE POLICY "select_invoices" ON invoices FOR SELECT
  TO authenticated USING (is_super_admin() OR (tenant_id = current_tenant_id()));

DROP POLICY IF EXISTS "insert_invoices" ON invoices;
CREATE POLICY "insert_invoices" ON invoices FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "update_invoices" ON invoices;
CREATE POLICY "update_invoices" ON invoices FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS "delete_invoices" ON invoices;
CREATE POLICY "delete_invoices" ON invoices FOR DELETE
  TO authenticated USING (is_super_admin());

-- ============================================
-- 4. UPDATE tenants RLS for super admin full access
-- ============================================
-- Existing policies already handle super_admin via is_super_admin()
-- No changes needed
