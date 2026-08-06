/*
# Fix Coming Soon flags for unimplemented providers

## Overview
Marks Twilio, Twilio SMS, WhatsApp (Meta), and WhatsApp (Twilio) as coming soon
since their connection flows are not yet implemented. Also marks the duplicate
messaging/resend entry as coming soon since email delivery is handled via the
communication/resend entry with the EmailSetupCard.
*/

UPDATE integration_catalog SET is_coming_soon = true
  WHERE category = 'messaging' AND provider IN ('twilio', 'twilio_sms', 'meta_whatsapp', 'twilio_whatsapp');

UPDATE integration_catalog SET is_coming_soon = true
  WHERE category = 'messaging' AND provider = 'resend';
