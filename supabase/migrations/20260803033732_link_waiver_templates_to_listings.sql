/*
# Link waiver templates to listings (boats)

1. Modified Tables
- `waiver_templates`
  - Add `listing_id` (uuid, nullable, FK to listings) — optional link to a specific boat.
    When null, the template applies generally. When set, it's specific to that boat.

2. Notes
- Existing templates get NULL (general, not boat-specific) — no behavior change.
- The public signing page and dashboard can filter by listing_id.
*/

ALTER TABLE waiver_templates
  ADD COLUMN IF NOT EXISTS listing_id uuid REFERENCES listings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_waiver_templates_listing ON waiver_templates(listing_id);
