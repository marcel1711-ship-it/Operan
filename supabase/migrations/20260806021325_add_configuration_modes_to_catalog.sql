-- Add platform_configuration_mode and tenant_configuration_mode to integration_catalog
ALTER TABLE integration_catalog
  ADD COLUMN IF NOT EXISTS platform_configuration_mode text DEFAULT 'internal_setup';
ALTER TABLE integration_catalog
  ADD COLUMN IF NOT EXISTS tenant_configuration_mode text DEFAULT 'internal_setup';

-- Update existing catalog entries with the correct configuration modes
UPDATE integration_catalog SET
  platform_configuration_mode = 'environment_setup',
  tenant_configuration_mode = 'connect_onboarding'
WHERE provider = 'stripe';

UPDATE integration_catalog SET
  platform_configuration_mode = 'environment_setup',
  tenant_configuration_mode = 'internal_setup'
WHERE provider = 'resend';

UPDATE integration_catalog SET
  platform_configuration_mode = 'environment_setup',
  tenant_configuration_mode = 'oauth'
WHERE provider = 'google_calendar';

UPDATE integration_catalog SET
  platform_configuration_mode = 'internal_setup',
  tenant_configuration_mode = 'internal_setup'
WHERE provider IN ('ical', 'webhooks', 'api_access');

UPDATE integration_catalog SET
  platform_configuration_mode = 'environment_setup',
  tenant_configuration_mode = 'coming_soon'
WHERE provider IN ('twilio', 'meta_whatsapp', 'quickbooks', 'twilio_whatsapp');
