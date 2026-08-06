/*
# Extend Tenant Branding Fields

1. Purpose
   Adds extended branding fields to the `tenants` table so the embedded booking
   widget can inherit the tenant's visual identity (border radius, button style,
   typography, background color, light/dark appearance).

2. New Columns on `tenants`
   - `border_radius` text DEFAULT 'rounded' — controls button/card corner radius
   - `button_style` text DEFAULT 'solid' — solid | outline | soft
   - `font_family` text DEFAULT 'system' — system | inter | poppins | etc.
   - `background_color` text — optional page background override
   - `theme_mode` text DEFAULT 'light' — light | dark

3. Security
   No new tables. Existing RLS policies on `tenants` remain unchanged.
   Columns are nullable or have safe defaults; no data loss.
*/

DO $$ BEGIN
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS border_radius text DEFAULT 'rounded';
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS button_style text DEFAULT 'solid';
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'system';
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS background_color text;
  ALTER TABLE tenants ADD COLUMN IF NOT EXISTS theme_mode text DEFAULT 'light';
END $$;
