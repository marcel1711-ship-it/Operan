-- ============================================================
-- Phase 5D: Default Workflow Templates
-- ============================================================

-- Create default communication templates for the existing tenant
-- These are starter templates that tenants can customize

INSERT INTO communication_templates (tenant_id, name, description, channel, category, subject, body, is_active, is_system_template)
SELECT t.id, 'Booking Confirmation', 'Sent when a reservation is confirmed',
  'email', 'booking_confirmation',
  'Your booking is confirmed - {{reservation.booking_reference}}',
  'Hi {{customer.first_name}},

Your booking for {{listing.name}} is confirmed!

Booking Reference: {{reservation.booking_reference}}
Date: {{reservation.start_at}}
Guests: {{reservation.guest_count}}

Total: {{reservation.total_amount}}
Amount Paid: {{reservation.amount_paid}}
Balance Due: {{reservation.balance_due}}

We look forward to seeing you!

{{tenant.name}}',
  true, true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM communication_templates
  WHERE tenant_id = t.id AND category = 'booking_confirmation' AND is_system_template = true
);

INSERT INTO communication_templates (tenant_id, name, description, channel, category, subject, body, is_active, is_system_template)
SELECT t.id, 'Booking Request Received', 'Sent to customer when they submit a booking request',
  'email', 'booking_request_received',
  'We received your booking request',
  'Hi {{customer.first_name}},

We received your booking request for {{listing.name}} on {{reservation.start_at}}.

Our team will review your request and confirm availability shortly.

Booking Reference: {{reservation.booking_reference}}

{{tenant.name}}',
  true, true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM communication_templates
  WHERE tenant_id = t.id AND category = 'booking_request_received' AND is_system_template = true
);

INSERT INTO communication_templates (tenant_id, name, description, channel, category, subject, body, is_active, is_system_template)
SELECT t.id, 'Payment Failed', 'Sent when a payment attempt fails',
  'email', 'payment_failed',
  'Payment failed for {{reservation.booking_reference}}',
  'Hi {{customer.first_name}},

Your payment for booking {{reservation.booking_reference}} could not be processed.

Please try again or contact us for assistance.

{{tenant.name}}',
  true, true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM communication_templates
  WHERE tenant_id = t.id AND category = 'payment_failed' AND is_system_template = true
);

INSERT INTO communication_templates (tenant_id, name, description, channel, category, subject, body, is_active, is_system_template)
SELECT t.id, 'Upcoming Trip Reminder', 'Sent 24 hours before the trip',
  'email', 'upcoming_trip',
  'Reminder: Your trip is tomorrow - {{listing.name}}',
  'Hi {{customer.first_name}},

This is a reminder for your upcoming trip:

Experience: {{listing.name}}
Date: {{reservation.start_at}}
Location: {{listing.location}}
Meeting Point: {{listing.meeting_point}}

{{listing.customer_instructions}}

Balance Due: {{reservation.balance_due}}

See you soon!

{{tenant.name}}',
  true, true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM communication_templates
  WHERE tenant_id = t.id AND category = 'upcoming_trip' AND is_system_template = true
);

INSERT INTO communication_templates (tenant_id, name, description, channel, category, subject, body, is_active, is_system_template)
SELECT t.id, 'Cancellation Confirmation', 'Sent when a reservation is cancelled',
  'email', 'cancellation',
  'Booking cancelled - {{reservation.booking_reference}}',
  'Hi {{customer.first_name}},

Your booking {{reservation.booking_reference}} for {{listing.name}} has been cancelled.

If you have any questions, please contact us.

{{tenant.name}}',
  true, true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM communication_templates
  WHERE tenant_id = t.id AND category = 'cancellation' AND is_system_template = true
);

INSERT INTO communication_templates (tenant_id, name, description, channel, category, subject, body, is_active, is_system_template)
SELECT t.id, 'Review Request', 'Sent after trip completion',
  'email', 'review_request',
  'How was your experience with {{listing.name}}?',
  'Hi {{customer.first_name}},

We hope you enjoyed your recent trip with {{listing.name}}!

We would love to hear your feedback. Please take a moment to share your experience.

Thank you!

{{tenant.name}}',
  true, true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM communication_templates
  WHERE tenant_id = t.id AND category = 'review_request' AND is_system_template = true
);

-- SMS templates
INSERT INTO communication_templates (tenant_id, name, description, channel, category, body, is_active, is_system_template)
SELECT t.id, 'SMS: Booking Confirmation', 'SMS confirmation',
  'sms', 'booking_confirmation',
  'Hi {{customer.first_name}}, your booking for {{listing.name}} on {{reservation.start_at}} is confirmed! Ref: {{reservation.booking_reference}}. - {{tenant.name}}',
  true, true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM communication_templates
  WHERE tenant_id = t.id AND category = 'booking_confirmation' AND channel = 'sms' AND is_system_template = true
);

INSERT INTO communication_templates (tenant_id, name, description, channel, category, body, is_active, is_system_template)
SELECT t.id, 'SMS: Trip Reminder', 'SMS reminder 24h before trip',
  'sms', 'upcoming_trip',
  'Reminder: Your trip with {{listing.name}} is tomorrow at {{reservation.start_at}}. Location: {{listing.meeting_point}}. Balance: {{reservation.balance_due}}. - {{tenant.name}}',
  true, true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM communication_templates
  WHERE tenant_id = t.id AND category = 'upcoming_trip' AND channel = 'sms' AND is_system_template = true
);

-- Create default workflow definitions as drafts
INSERT INTO automation_workflows (tenant_id, name, description, trigger_type, trigger_configuration, status, is_template)
SELECT t.id, 'Booking Confirmation Flow', 'Send confirmation email and notification when reservation is confirmed',
  'reservation.confirmed', '{}'::jsonb, 'draft', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM automation_workflows WHERE tenant_id = t.id AND name = 'Booking Confirmation Flow' AND is_template = true
);

INSERT INTO automation_workflows (tenant_id, name, description, trigger_type, trigger_configuration, status, is_template)
SELECT t.id, 'Booking Request Notification', 'Notify tenant when a booking request is received',
  'reservation.requested', '{}'::jsonb, 'draft', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM automation_workflows WHERE tenant_id = t.id AND name = 'Booking Request Notification' AND is_template = true
);

INSERT INTO automation_workflows (tenant_id, name, description, trigger_type, trigger_configuration, status, is_template)
SELECT t.id, 'Payment Failed Alert', 'Notify tenant and customer when payment fails',
  'payment.failed', '{}'::jsonb, 'draft', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM automation_workflows WHERE tenant_id = t.id AND name = 'Payment Failed Alert' AND is_template = true
);

INSERT INTO automation_workflows (tenant_id, name, description, trigger_type, trigger_configuration, status, is_template)
SELECT t.id, 'Upcoming Trip Reminder', 'Send reminder 24 hours before trip',
  'reservation.confirmed', '{"delay_hours": "24"}'::jsonb, 'draft', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM automation_workflows WHERE tenant_id = t.id AND name = 'Upcoming Trip Reminder' AND is_template = true
);

INSERT INTO automation_workflows (tenant_id, name, description, trigger_type, trigger_configuration, status, is_template)
SELECT t.id, 'Cancellation Confirmation', 'Send cancellation confirmation to customer',
  'reservation.cancelled', '{}'::jsonb, 'draft', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM automation_workflows WHERE tenant_id = t.id AND name = 'Cancellation Confirmation' AND is_template = true
);

INSERT INTO automation_workflows (tenant_id, name, description, trigger_type, trigger_configuration, status, is_template)
SELECT t.id, 'Review Request', 'Send review request 24 hours after trip completion',
  'reservation.completed', '{"delay_hours": "24"}'::jsonb, 'draft', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM automation_workflows WHERE tenant_id = t.id AND name = 'Review Request' AND is_template = true
);
