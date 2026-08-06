import { supabaseAdmin } from '@/lib/supabase-server';
import { resolveCredential, hasCredential } from './credential-resolver';

/**
 * Server-only Resend client.
 *
 * Credentials are resolved in this order:
 * 1. Platform Secrets Vault (database, AES-256-GCM encrypted)
 * 2. Environment variable fallback (backward compatibility)
 *
 * The API key is NEVER sent to the browser, stored in database metadata,
 * or included in API responses. This module must only be imported from
 * server-side code (API routes, server components, edge functions).
 */

const RESEND_API_BASE = 'https://api.resend.com';

function getApiKey(): string | null {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.trim() === '') return null;
  return key;
}

function getWebhookSecret(): string | null {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || secret.trim() === '') return null;
  return secret;
}

export async function getApiKeyAsync(): Promise<string | null> {
  return await resolveCredential('resend', 'RESEND_API_KEY', 'production');
}

export async function getWebhookSecretAsync(): Promise<string | null> {
  return await resolveCredential('resend', 'RESEND_WEBHOOK_SECRET', 'production');
}

export function isResendConfigured(): boolean {
  return getApiKey() !== null;
}

export async function isResendConfiguredAsync(): Promise<boolean> {
  return await hasCredential('resend', 'RESEND_API_KEY', 'production');
}

export function isResendWebhookConfigured(): boolean {
  return getWebhookSecret() !== null;
}

export async function isResendWebhookConfiguredAsync(): Promise<boolean> {
  return await hasCredential('resend', 'RESEND_WEBHOOK_SECRET', 'production');
}

export type ResendDomainRecord = {
  record_type: string;
  name: string;
  value: string;
  priority?: number;
  status?: string;
};

export type ResendDomain = {
  id: string;
  name: string;
  region: string;
  status: string;
  records: ResendDomainRecord[];
  created_at: string;
};

export type ResendSendResult = {
  success: boolean;
  provider_message_id: string | null;
  status: string;
  error: string | null;
  metadata: Record<string, unknown>;
};

function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.replace(/re_[a-zA-Z0-9_]+/g, '[REDACTED]');
  }
  return 'Unknown provider error';
}

async function resendFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const apiKey = await getApiKeyAsync();
  if (!apiKey) {
    throw new Error('RESEND_NOT_CONFIGURED');
  }

  return fetch(`${RESEND_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

export async function createResendDomain(domain: string, region?: string): Promise<{
  success: boolean;
  domain_id: string | null;
  records: ResendDomainRecord[];
  error: string | null;
}> {
  if (!(await isResendConfiguredAsync())) {
    return { success: false, domain_id: null, records: [], error: 'Resend not configured' };
  }

  try {
    const body: Record<string, unknown> = { name: domain };
    if (region) body.region = region;

    const response = await resendFetch('/domains', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, domain_id: null, records: [], error: sanitizeError(data) };
    }

    return {
      success: true,
      domain_id: data.id,
      records: (data.records || []).map((r: any) => ({
        record_type: r.record_type,
        name: r.name,
        value: r.value,
        priority: r.priority,
        status: r.status,
      })),
      error: null,
    };
  } catch (err) {
    return { success: false, domain_id: null, records: [], error: sanitizeError(err) };
  }
}

export async function getResendDomain(domainId: string): Promise<{
  success: boolean;
  domain: ResendDomain | null;
  error: string | null;
}> {
  if (!(await isResendConfiguredAsync())) {
    return { success: false, domain: null, error: 'Resend not configured' };
  }

  try {
    const response = await resendFetch(`/domains/${domainId}`);
    const data = await response.json();

    if (!response.ok) {
      return { success: false, domain: null, error: sanitizeError(data) };
    }

    return {
      success: true,
      domain: {
        id: data.id,
        name: data.name,
        region: data.region,
        status: data.status,
        records: (data.records || []).map((r: any) => ({
          record_type: r.record_type,
          name: r.name,
          value: r.value,
          priority: r.priority,
          status: r.status,
        })),
        created_at: data.created_at,
      },
      error: null,
    };
  } catch (err) {
    return { success: false, domain: null, error: sanitizeError(err) };
  }
}

export async function verifyResendDomain(domainId: string): Promise<{
  success: boolean;
  verified: boolean;
  status: string;
  error: string | null;
}> {
  if (!(await isResendConfiguredAsync())) {
    return { success: false, verified: false, status: 'not_configured', error: 'Resend not configured' };
  }

  try {
    const response = await resendFetch(`/domains/${domainId}/verify`, { method: 'POST' });
    const data = await response.json();

    if (!response.ok) {
      return { success: false, verified: false, status: 'error', error: sanitizeError(data) };
    }

    return {
      success: true,
      verified: data.status === 'verified',
      status: data.status,
      error: null,
    };
  } catch (err) {
    return { success: false, verified: false, status: 'error', error: sanitizeError(err) };
  }
}

export async function removeResendDomain(domainId: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  if (!(await isResendConfiguredAsync())) {
    return { success: false, error: 'Resend not configured' };
  }

  try {
    const response = await resendFetch(`/domains/${domainId}`, { method: 'DELETE' });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: sanitizeError(data) };
    }

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: sanitizeError(err) };
  }
}

export async function sendResendEmail(params: {
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  tags?: { name: string; value: string }[];
  idempotency_key?: string;
}): Promise<ResendSendResult> {
  if (!(await isResendConfiguredAsync())) {
    return {
      success: false,
      provider_message_id: null,
      status: 'failed',
      error: 'Resend not configured',
      metadata: { environment: 'not_configured' },
    };
  }

  try {
    const body: Record<string, unknown> = {
      from: params.from,
      to: params.to,
      subject: params.subject,
    };

    if (params.html) body.html = params.html;
    if (params.text) body.text = params.text;
    if (params.reply_to) body.reply_to = params.reply_to;
    if (params.tags) body.tags = params.tags;

    const headers: Record<string, string> = {};
    if (params.idempotency_key) {
      headers['Idempotency-Key'] = params.idempotency_key;
    }

    const response = await resendFetch('/emails', {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        provider_message_id: null,
        status: 'rejected',
        error: sanitizeError(data),
        metadata: { environment: process.env.NODE_ENV === 'production' ? 'production' : 'development' },
      };
    }

    return {
      success: true,
      provider_message_id: data.id,
      status: 'accepted',
      error: null,
      metadata: {
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
        provider_status: 'accepted',
      },
    };
  } catch (err) {
    return {
      success: false,
      provider_message_id: null,
      status: 'failed',
      error: sanitizeError(err),
      metadata: { environment: process.env.NODE_ENV === 'production' ? 'production' : 'development' },
    };
  }
}

export async function verifyResendWebhookSignature(
  payload: string,
  signature: string | null
): Promise<boolean> {
  const secret = await getWebhookSecretAsync();
  if (!secret) return false;
  if (!signature) return false;

  try {
    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

export type ResendWebhookEvent = {
  event_type: string;
  message_id: string | null;
  email: string | null;
  subject: string | null;
  reason: string | null;
  created_at: string | null;
  raw: Record<string, unknown>;
};

export function parseResendWebhookEvent(payload: unknown): ResendWebhookEvent | null {
  if (!payload || typeof payload !== 'object') return null;

  const data = payload as Record<string, unknown>;
  const eventType = data.type || data.event_type || data.event;
  const message = (data.email || data.message || {}) as Record<string, unknown>;

  return {
    event_type: String(eventType || ''),
    message_id: (message.id || data.message_id || data.email_id) as string | null,
    email: (message.to || data.email) as string | null,
    subject: (message.subject || data.subject) as string | null,
    reason: (data.reason || data.bounce_reason || data.complaint_reason) as string | null,
    created_at: (data.created_at || data.timestamp) as string | null,
    raw: data,
  };
}

export function mapResendEventToStatus(eventType: string): {
  status: string;
  failure_reason: string | null;
} {
  switch (eventType) {
    case 'email.sent':
      return { status: 'sent', failure_reason: null };
    case 'email.delivered':
      return { status: 'delivered', failure_reason: null };
    case 'email.delivery_delayed':
      return { status: 'delivery_delayed', failure_reason: null };
    case 'email.bounced':
      return { status: 'bounced', failure_reason: 'Email bounced' };
    case 'email.complained':
      return { status: 'complained', failure_reason: 'Recipient complained' };
    case 'email.failed':
      return { status: 'failed', failure_reason: 'Provider delivery failed' };
    default:
      return { status: 'accepted', failure_reason: null };
  }
}

export async function updatePlatformResendStatus(connected: boolean) {
  const { data: existing } = await supabaseAdmin
    .from('platform_integrations')
    .select('id')
    .eq('category', 'communication')
    .eq('provider', 'resend')
    .maybeSingle();

  const status = connected ? 'connected' : 'not_configured';

  if (existing) {
    await supabaseAdmin
      .from('platform_integrations')
      .update({
        connection_status: status,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin
      .from('platform_integrations')
      .insert({
        category: 'communication',
        provider: 'resend',
        environment: process.env.NODE_ENV === 'production' ? 'live' : 'test',
        connection_status: status,
        enabled: true,
      });
  }
}
