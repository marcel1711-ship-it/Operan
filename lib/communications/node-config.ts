import { z } from 'zod';

// ============================================================
// Node Configuration Schemas
// Every node type has a validated schema. The builder panel
// uses these for inline validation; the server validates again
// before save and publish.
// ============================================================

export const triggerConfigSchema = z.object({
  event_type: z.string().min(1),
  filters: z.record(z.unknown()).optional().default({}),
  listing_id: z.string().uuid().optional(),
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  min_amount: z.number().optional(),
  max_amount: z.number().optional(),
});

export const sendEmailConfigSchema = z.object({
  template_id: z.string().uuid().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  recipient_type: z.enum(['customer', 'custom']).default('customer'),
  recipient_override: z.string().optional(),
  message_classification: z.enum(['transactional', 'marketing']).default('transactional'),
  integration_id: z.string().uuid().optional(),
  test_recipient: z.string().optional(),
}).refine(
  (d) => !!d.template_id || (!!d.subject && !!d.body),
  { message: 'Template or inline content (subject + body) is required', path: ['template_id'] },
);

export const sendSmsConfigSchema = z.object({
  template_id: z.string().uuid().optional(),
  body: z.string().optional(),
  recipient_type: z.enum(['customer', 'custom']).default('customer'),
  recipient_override: z.string().optional(),
  message_classification: z.enum(['transactional', 'marketing']).default('transactional'),
  integration_id: z.string().uuid().optional(),
  test_recipient: z.string().optional(),
}).refine(
  (d) => !!d.template_id || !!d.body,
  { message: 'Template or inline message is required', path: ['template_id'] },
);

export const sendWhatsAppConfigSchema = z.object({
  template_id: z.string().uuid().optional(),
  body: z.string().optional(),
  recipient_type: z.enum(['customer', 'custom']).default('customer'),
  recipient_override: z.string().optional(),
  message_classification: z.enum(['transactional', 'marketing']).default('transactional'),
  integration_id: z.string().uuid().optional(),
  approved_template_reference: z.string().optional(),
  test_recipient: z.string().optional(),
}).refine(
  (d) => !!d.template_id || !!d.body,
  { message: 'Template or inline message is required', path: ['template_id'] },
);

export const createInAppNotificationConfigSchema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  target_user: z.string().optional(),
  linked_entity_type: z.string().optional(),
});

export const waitConfigSchema = z.object({
  duration_value: z.number().min(1).max(525600),
  duration_unit: z.enum(['minutes', 'hours', 'days']),
  relative_to: z.enum(['now', 'reservation_start', 'reservation_end']).default('now'),
  business_hours_only: z.boolean().optional().default(false),
});

export const waitUntilConfigSchema = z.object({
  target_type: z.enum(['specific_time', 'reservation_start', 'reservation_end', 'balance_due_date']),
  target_timestamp: z.string().optional(),
  relative_event_field: z.string().optional(),
  offset_value: z.number().optional().default(0),
  offset_unit: z.enum(['minutes', 'hours', 'days']).optional().default('hours'),
});

export const conditionConfigSchema = z.object({
  field_path: z.string().min(1),
  operator: z.enum([
    'equals', 'not_equals', 'greater_than', 'less_than',
    'contains', 'not_contains', 'exists', 'not_exists',
    'before', 'after', 'within_next', 'is_true', 'is_false',
  ]),
  comparison_value: z.string(),
});

export const ifElseConfigSchema = conditionConfigSchema;

export const addCustomerTagConfigSchema = z.object({
  tag: z.string().min(1),
});

export const addReservationNoteConfigSchema = z.object({
  body: z.string().min(1),
  visibility: z.enum(['internal', 'customer_visible']).default('internal'),
});

export const createTaskConfigSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  due_rule: z.enum(['immediately', '24h_before', '48h_before', 'on_completion']).default('immediately'),
  assigned_user_id: z.string().uuid().optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export const updateOpportunityStageConfigSchema = z.object({
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
});

export const callWebhookConfigSchema = z.object({
  url: z.string().url().refine((v) => v.startsWith('http://') || v.startsWith('https://'), 'Must be HTTP or HTTPS'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH']).default('POST'),
  headers: z.record(z.string()).optional().default({}),
  body_template: z.string().optional(),
  timeout_seconds: z.number().min(1).max(30).optional().default(10),
  retry_count: z.number().min(0).max(3).optional().default(0),
});

export const stopWorkflowConfigSchema = z.object({
  reason: z.string().optional(),
});

// ============================================================
// Schema registry
// ============================================================

export const NODE_CONFIG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  trigger: triggerConfigSchema,
  send_email: sendEmailConfigSchema,
  send_sms: sendSmsConfigSchema,
  send_whatsapp: sendWhatsAppConfigSchema,
  create_in_app_notification: createInAppNotificationConfigSchema,
  wait: waitConfigSchema,
  wait_until: waitUntilConfigSchema,
  condition: conditionConfigSchema,
  if_else: ifElseConfigSchema,
  add_customer_tag: addCustomerTagConfigSchema,
  add_reservation_note: addReservationNoteConfigSchema,
  create_task: createTaskConfigSchema,
  update_opportunity_stage: updateOpportunityStageConfigSchema,
  call_webhook: callWebhookConfigSchema,
  stop_workflow: stopWorkflowConfigSchema,
};

export type NodeConfigType = z.infer<typeof triggerConfigSchema> &
  z.infer<typeof sendEmailConfigSchema> &
  z.infer<typeof waitConfigSchema> &
  z.infer<typeof conditionConfigSchema>;

export function validateNodeConfig(actionType: string, config: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const schema = NODE_CONFIG_SCHEMAS[actionType];
  if (!schema) return { valid: true, errors: [] };
  const result = schema.safeParse(config);
  if (result.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: result.error.issues.map((i: z.ZodIssue) => `${i.path.join('.')}: ${i.message}`),
  };
}

export function getDefaultConfig(actionType: string): Record<string, unknown> {
  const defaults: Record<string, Record<string, unknown>> = {
    send_email: { recipient_type: 'customer', message_classification: 'transactional' },
    send_sms: { recipient_type: 'customer', message_classification: 'transactional' },
    send_whatsapp: { recipient_type: 'customer', message_classification: 'transactional' },
    create_in_app_notification: { priority: 'normal' },
    wait: { duration_value: 1, duration_unit: 'hours', relative_to: 'now', business_hours_only: false },
    wait_until: { target_type: 'reservation_start', offset_value: 0, offset_unit: 'hours' },
    if_else: { operator: 'equals', comparison_value: '' },
    condition: { operator: 'equals', comparison_value: '' },
    add_reservation_note: { visibility: 'internal' },
    create_task: { due_rule: 'immediately', priority: 'normal' },
    call_webhook: { method: 'POST', timeout_seconds: 10, retry_count: 0, headers: {} },
    stop_workflow: {},
    add_customer_tag: {},
    create_captain_session: { expires_hours: 48 },
  };
  return defaults[actionType] || {};
}

export function getNodeSummary(actionType: string, config: Record<string, unknown> | undefined): string {
  if (!config) return '';
  switch (actionType) {
    case 'send_email':
    case 'send_sms':
    case 'send_whatsapp': {
      const channel = actionType.replace('send_', '');
      const recipient = config.recipient_type === 'custom' ? config.recipient_override : 'Customer';
      return `${channel === 'email' ? 'Email' : channel === 'sms' ? 'SMS' : 'WhatsApp'} → ${recipient}`;
    }
    case 'wait': {
      return `${config.duration_value || 1} ${config.duration_unit || 'hours'}`;
    }
    case 'wait_until': {
      return `${config.target_type || 'reservation_start'}`.replace(/_/g, ' ');
    }
    case 'if_else':
    case 'condition': {
      const op = (config.operator as string) || 'equals';
      const val = (config.comparison_value as string) || '';
      return `${(config.field_path as string) || '?'} ${op.replace(/_/g, ' ')} ${val}`;
    }
    case 'create_in_app_notification': {
      return config.title as string || 'Notification';
    }
    case 'add_customer_tag': {
      return `Tag: ${config.tag || ''}`;
    }
    case 'add_reservation_note': {
      return 'Add note';
    }
    case 'call_webhook': {
      const url = config.url as string;
      return url ? new URL(url).hostname : 'Webhook';
    }
    case 'stop_workflow': {
      return 'Stop';
    }
    case 'create_captain_session': {
      return `Captain link · ${config.expires_hours || 48}h`;
    }
    default:
      return '';
  }
}
