/*
# Add Integration Type to Tenants

## Overview
Adds an `integration_type` column to the `tenants` table so the super-admin can
distinguish between two onboarding modes:
  - `new_web`   — the client wants us to build/host their full public landing page.
  - `link_only` — the client already has a website (e.g. bigmikeseadventures.com)
                  and only needs a "Book Now" link or embeddable widget to plug
                  into their existing site.

## Modified Tables
### tenants
- New column `integration_type text NOT NULL DEFAULT 'new_web'`
  with CHECK constraint limiting values to `new_web` or `link_only`.

## Security
- No RLS policy changes. The column is readable through the existing
  `anon_select_active_tenants` and `select_tenants` policies.
*/

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS integration_type text
  NOT NULL DEFAULT 'new_web'
  CHECK (integration_type IN ('new_web', 'link_only'));
