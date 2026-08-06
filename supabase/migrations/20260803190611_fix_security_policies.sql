/*
# Fix Critical Security Policies

## Overview
Fixes two security vulnerabilities identified in the audit:
1. plan_pricing UPDATE policy allowed ANY authenticated user (including tenant_admins) to change platform plan prices — now restricted to super_admin only.
2. signed_waivers INSERT policy allowed anonymous users to insert with no validation — now validates that the tenant is active and the template belongs to that tenant and is active.

## Changes
### plan_pricing
- DROP the existing "update_plan_pricing" policy (USING true / WITH CHECK true — open to all authenticated)
- CREATE new "update_plan_pricing" policy restricted to is_super_admin() only
- ADD INSERT and DELETE policies restricted to super_admin (previously none existed, but grants allowed it)

### signed_waivers
- DROP the existing "anon_insert_signed_waivers" policy (WITH CHECK true — no validation)
- CREATE new "anon_insert_signed_waivers" policy that validates:
  - tenant_id references an active tenant
  - template_id belongs to that tenant and is active
  - This prevents cross-tenant injection and inactive-template abuse

## Security
- plan_pricing: only super_admin can INSERT, UPDATE, DELETE. Any authenticated can SELECT.
- signed_waivers: anon can INSERT only with valid active tenant + active template. Tenant users can SELECT their own.
*/

-- ============================================
-- 1. FIX plan_pricing UPDATE POLICY
-- ============================================

-- Revoke the open UPDATE policy
DROP POLICY IF EXISTS "update_plan_pricing" ON plan_pricing;
CREATE POLICY "update_plan_pricing" ON plan_pricing FOR UPDATE
  TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Add INSERT policy restricted to super_admin
DROP POLICY IF EXISTS "insert_plan_pricing" ON plan_pricing;
CREATE POLICY "insert_plan_pricing" ON plan_pricing FOR INSERT
  TO authenticated WITH CHECK (is_super_admin());

-- Add DELETE policy restricted to super_admin
DROP POLICY IF EXISTS "delete_plan_pricing" ON plan_pricing;
CREATE POLICY "delete_plan_pricing" ON plan_pricing FOR DELETE
  TO authenticated USING (is_super_admin());

-- ============================================
-- 2. FIX signed_waivers INSERT POLICY
-- ============================================

-- Revoke the open INSERT policy
DROP POLICY IF EXISTS "anon_insert_signed_waivers" ON signed_waivers;

-- New policy: validate that tenant is active and template belongs to that tenant and is active
CREATE POLICY "anon_insert_signed_waivers" ON signed_waivers FOR INSERT
  TO anon, authenticated WITH CHECK (
    tenant_id IN (
      SELECT tenants.id FROM tenants WHERE tenants.is_active = true
    )
    AND template_id IN (
      SELECT waiver_templates.id FROM waiver_templates
      WHERE waiver_templates.tenant_id = signed_waivers.tenant_id
      AND waiver_templates.is_active = true
    )
  );