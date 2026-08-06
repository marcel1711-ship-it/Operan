import { supabaseAdmin } from '@/lib/supabase-server';
import { sendMessage } from './communication-service';
import { createNotification } from '@/lib/services/notification-service';

export type WorkflowDefinition = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type WorkflowNode = {
  id: string;
  type: string;
  action_type: string;
  configuration: Record<string, unknown>;
  position: { x: number; y: number };
};

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  condition_label?: string;
};

export type ExecutionContext = {
  run_id: string;
  tenant_id: string;
  workflow_id: string;
  workflow_version_id: string;
  reservation_id?: string;
  customer_id?: string;
  opportunity_id?: string;
  entity_type?: string;
  entity_id?: string;
  trigger_payload: Record<string, unknown>;
  node_outputs: Record<string, unknown>;
};

const ACTION_HANDLERS: Record<string, (config: Record<string, unknown>, ctx: ExecutionContext) => Promise<{ output: Record<string, unknown>; next?: string[] }>> = {
  async send_email(config, ctx) {
    const templateId = config.template_id as string;
    const recipient = (config.recipient as string) || (ctx.customer_id ? await resolveCustomerEmail(ctx.tenant_id, ctx.customer_id) : '');
    const isTransactional = config.is_transactional !== false;

    if (!recipient) {
      return { output: { status: 'skipped', reason: 'no_recipient' } };
    }

    const result = await sendMessage({
      tenant_id: ctx.tenant_id,
      channel: 'email',
      template_id: templateId,
      recipient,
      customer_id: ctx.customer_id,
      reservation_id: ctx.reservation_id,
      workflow_id: ctx.workflow_id,
      workflow_run_id: ctx.run_id,
      is_transactional: isTransactional,
      idempotency_key: `email-${ctx.run_id}-${ctx.node_outputs ? Object.keys(ctx.node_outputs).length : 0}`,
    });

    return { output: { status: result.status, message_id: result.message_id, error: result.error } };
  },

  async send_sms(config, ctx) {
    const templateId = config.template_id as string;
    const recipient = (config.recipient as string) || (ctx.customer_id ? await resolveCustomerPhone(ctx.tenant_id, ctx.customer_id) : '');
    const isTransactional = config.is_transactional !== false;

    if (!recipient) {
      return { output: { status: 'skipped', reason: 'no_recipient' } };
    }

    const result = await sendMessage({
      tenant_id: ctx.tenant_id,
      channel: 'sms',
      template_id: templateId,
      recipient,
      customer_id: ctx.customer_id,
      reservation_id: ctx.reservation_id,
      workflow_id: ctx.workflow_id,
      workflow_run_id: ctx.run_id,
      is_transactional: isTransactional,
      idempotency_key: `sms-${ctx.run_id}-${Object.keys(ctx.node_outputs).length}`,
    });

    return { output: { status: result.status, message_id: result.message_id, error: result.error } };
  },

  async send_whatsapp(config, ctx) {
    const templateId = config.template_id as string;
    const recipient = (config.recipient as string) || (ctx.customer_id ? await resolveCustomerPhone(ctx.tenant_id, ctx.customer_id) : '');
    const isTransactional = config.is_transactional !== false;

    if (!recipient) {
      return { output: { status: 'skipped', reason: 'no_recipient' } };
    }

    const result = await sendMessage({
      tenant_id: ctx.tenant_id,
      channel: 'whatsapp',
      template_id: templateId,
      recipient,
      customer_id: ctx.customer_id,
      reservation_id: ctx.reservation_id,
      workflow_id: ctx.workflow_id,
      workflow_run_id: ctx.run_id,
      is_transactional: isTransactional,
      idempotency_key: `wa-${ctx.run_id}-${Object.keys(ctx.node_outputs).length}`,
    });

    return { output: { status: result.status, message_id: result.message_id, error: result.error } };
  },

  async create_in_app_notification(config, ctx) {
    const title = config.title as string || 'Notification';
    const message = config.message as string || '';
    const priority = (config.priority as 'low' | 'normal' | 'high') || 'normal';

    await createNotification({
      tenant_id: ctx.tenant_id,
      type: 'workflow_notification',
      title,
      message,
      entity_type: ctx.entity_type || 'reservation',
      entity_id: ctx.entity_id || ctx.reservation_id,
      priority,
    });

    return { output: { status: 'sent' } };
  },

  async wait(config) {
    const duration = config.duration as number;
    const unit = config.unit as string;
    let scheduledFor: Date | undefined;

    if (duration && unit) {
      const now = new Date();
      if (unit === 'minutes') scheduledFor = new Date(now.getTime() + duration * 60 * 1000);
      if (unit === 'hours') scheduledFor = new Date(now.getTime() + duration * 60 * 60 * 1000);
      if (unit === 'days') scheduledFor = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);
    }

    return { output: { scheduled_for: scheduledFor?.toISOString() } };
  },

  async wait_until(config, ctx) {
    const target = config.target as string;
    let scheduledFor: Date | undefined;

    if (target === 'reservation_start') {
      const offsetHours = (config.offset_hours as number) || 0;
      const { data: reservation } = await supabaseAdmin
        .from('reservations')
        .select('start_at')
        .eq('id', ctx?.reservation_id)
        .maybeSingle();

      if (reservation?.start_at) {
        scheduledFor = new Date(new Date(reservation.start_at).getTime() - offsetHours * 60 * 60 * 1000);
      }
    } else if (target === 'specific_time') {
      scheduledFor = new Date(config.timestamp as string);
    }

    return { output: { scheduled_for: scheduledFor?.toISOString() } };
  },

  async condition(config, ctx) {
    const property = config.property as string;
    const operator = config.operator as string;
    const value = config.value as unknown;

    const actualValue = resolveContextValue(property, ctx);
    const result = evaluateCondition(operator, actualValue, value);

    return { output: { result, property, operator, value, actual_value: actualValue } };
  },

  async if_else(config, ctx) {
    const property = config.property as string;
    const operator = config.operator as string;
    const value = config.value as unknown;

    const actualValue = resolveContextValue(property, ctx);
    const result = evaluateCondition(operator, actualValue, value);

    return { output: { branch: result ? 'true' : 'false', result } };
  },

  async stop_workflow() {
    return { output: { stopped: true } };
  },

  async add_customer_tag(config, ctx) {
    const tag = config.tag as string;
    if (!ctx.customer_id || !tag) return { output: { status: 'skipped' } };

    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('tags')
      .eq('id', ctx.customer_id)
      .maybeSingle();

    if (customer && Array.isArray(customer.tags) && !customer.tags.includes(tag)) {
      await supabaseAdmin
        .from('customers')
        .update({ tags: [...customer.tags, tag], updated_at: new Date().toISOString() })
        .eq('id', ctx.customer_id);
    }

    return { output: { status: 'tagged', tag } };
  },

  async add_reservation_note(config, ctx) {
    const note = config.note as string;
    if (!ctx.reservation_id || !note) return { output: { status: 'skipped' } };

    await supabaseAdmin.from('activity_log').insert({
      tenant_id: ctx.tenant_id,
      entity_type: 'reservation',
      entity_id: ctx.reservation_id,
      action: 'workflow_note',
      actor_name: 'workflow',
      metadata: { note },
    });

    return { output: { status: 'noted' } };
  },

  async call_webhook(config) {
    const url = config.url as string;
    if (!url) return { output: { status: 'skipped', reason: 'no_url' } };

    if (!isAllowedWebhookUrl(url)) {
      return { output: { status: 'failed', reason: 'blocked_url' } };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config.payload || {}),
        signal: AbortSignal.timeout(10000),
      });

      return { output: { status: response.ok ? 'sent' : 'failed', status_code: response.status } };
    } catch (err) {
      return { output: { status: 'failed', error: err instanceof Error ? err.message : 'fetch_error' } };
    }
  },
};

async function resolveCustomerEmail(tenantId: string, customerId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('customers')
    .select('email')
    .eq('id', customerId)
    .maybeSingle();
  return data?.email || '';
}

async function resolveCustomerPhone(tenantId: string, customerId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('customers')
    .select('phone')
    .eq('id', customerId)
    .maybeSingle();
  return data?.phone || '';
}

function resolveContextValue(property: string, ctx: ExecutionContext): unknown {
  const parts = property.split('.');
  const prefix = parts[0];

  if (prefix === 'reservation' && ctx.reservation_id) {
    return ctx.trigger_payload[parts[1]] ?? null;
  }
  if (prefix === 'customer' && ctx.customer_id) {
    return ctx.trigger_payload[parts[1]] ?? null;
  }
  if (prefix === 'trigger') {
    return ctx.trigger_payload[parts.slice(1).join('.')] ?? null;
  }

  return (ctx.node_outputs as Record<string, Record<string, unknown>>)[parts[0]]?.[parts[1]] ?? null;
}

function evaluateCondition(operator: string, actual: unknown, expected: unknown): boolean {
  switch (operator) {
    case 'equals': return String(actual) === String(expected);
    case 'not_equals': return String(actual) !== String(expected);
    case 'greater_than': return Number(actual) > Number(expected);
    case 'less_than': return Number(actual) < Number(expected);
    case 'contains': return Array.isArray(actual) ? actual.includes(expected) : String(actual).includes(String(expected));
    case 'not_contains': return Array.isArray(actual) ? !actual.includes(expected) : !String(actual).includes(String(expected));
    case 'exists': return actual != null && actual !== undefined;
    case 'not_exists': return actual == null || actual === undefined;
    case 'is_true': return actual === true;
    case 'is_false': return actual === false;
    default: return false;
  }
}

function isAllowedWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

    const hostname = parsed.hostname.toLowerCase();
    const blocked = [
      'localhost', '127.0.0.1', '0.0.0.0', '::1',
      '169.254.169.254', 'metadata.google.internal',
      '10.', '172.16.', '172.17.', '172.18.', '172.19.',
      '172.20.', '172.21.', '172.22.', '172.23.', '172.24.',
      '172.25.', '172.26.', '172.27.', '172.28.', '172.29.',
      '172.30.', '172.31.', '192.168.', '.internal', '.local',
    ];

    for (const b of blocked) {
      if (hostname === b || hostname.startsWith(b)) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function executeWorkflowStep(
  stepRunId: string,
  nodeId: string,
  actionType: string,
  config: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<{ output: Record<string, unknown>; nextNodes: string[] }> {
  const handler = ACTION_HANDLERS[actionType];
  if (!handler) {
    return { output: { error: `Unknown action type: ${actionType}` }, nextNodes: [] };
  }

  const result = await handler(config, ctx);

  return { output: result.output, nextNodes: [] };
}

export { isAllowedWebhookUrl, evaluateCondition, resolveContextValue };
