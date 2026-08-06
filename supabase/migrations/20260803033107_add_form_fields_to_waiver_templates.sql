/*
# Add form fields to waiver templates

1. Modified Tables
- `waiver_templates`
  - Add `form_fields` (jsonb, default '[]') — array of field definitions the customer fills before signing.
    Each field: { key: string, label: string, type: 'text'|'email'|'date'|'phone'|'number', required: boolean }
    The HTML template uses {{key}} placeholders that get replaced with form values at signing time.

2. Notes
- Existing templates get an empty array (no form fields, works as before — straight to signing).
- Built-in placeholders: {{today}} = current date, {{signer_name}} = from form if present.
*/

ALTER TABLE waiver_templates
  ADD COLUMN IF NOT EXISTS form_fields jsonb DEFAULT '[]'::jsonb;
