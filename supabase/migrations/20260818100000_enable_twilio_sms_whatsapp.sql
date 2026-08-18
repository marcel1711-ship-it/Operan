/*
# Enable Twilio SMS and WhatsApp providers

Remove the "Coming Soon" flag from Twilio SMS and WhatsApp providers
now that the Edge Function delivery handler is implemented.
Meta WhatsApp remains coming soon (no adapter code exists).
*/

UPDATE integration_catalog SET is_coming_soon = false
  WHERE category = 'messaging'
  AND provider IN ('twilio', 'twilio_sms', 'twilio_whatsapp');
