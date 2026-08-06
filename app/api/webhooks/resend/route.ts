import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import {
  verifyResendWebhookSignature,
  parseResendWebhookEvent,
  mapResendEventToStatus,
  isResendWebhookConfigured,
} from '@/lib/integrations/resend-server';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-resend-signature') || req.headers.get('svix-signature');

    if (!isResendWebhookConfigured()) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 503 });
    }

    const isValid = await verifyResendWebhookSignature(rawBody, signature);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = parseResendWebhookEvent(payload);

    if (!event || !event.event_type) {
      return NextResponse.json({ error: 'Could not parse event' }, { status: 400 });
    }

    const providerEventId = (event.raw.id || event.raw.event_id || `${event.event_type}-${event.message_id}-${Date.now()}`) as string;

    const { data: existingEvent } = await supabaseAdmin
      .from('provider_events')
      .select('id')
      .eq('provider', 'resend')
      .eq('provider_event_id', providerEventId)
      .maybeSingle();

    if (existingEvent) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    let tenantId: string | null = null;
    let messageId: string | null = null;

    if (event.message_id) {
      const { data: msg } = await supabaseAdmin
        .from('communication_messages')
        .select('id, tenant_id')
        .eq('provider_message_id', event.message_id)
        .maybeSingle();

      if (msg) {
        tenantId = msg.tenant_id;
        messageId = msg.id;
      }
    }

    const { data: providerEvent } = await supabaseAdmin
      .from('provider_events')
      .insert({
        provider: 'resend',
        provider_event_id: providerEventId,
        event_type: event.event_type,
        message_id: event.message_id,
        communication_message_id: messageId,
        tenant_id: tenantId,
        raw_payload: JSON.parse(rawBody),
        processed: true,
        processed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (messageId && event.message_id) {
      const { status, failure_reason } = mapResendEventToStatus(event.event_type);

      await supabaseAdmin.rpc('update_message_from_provider_event', {
        p_provider_message_id: event.message_id,
        p_new_status: status,
        p_event_type: event.event_type,
        p_failure_reason: failure_reason,
        p_provider_event_id: providerEventId,
      });

      if (status === 'bounced' && tenantId && event.email) {
        const { data: customer } = await supabaseAdmin
          .from('customers')
          .select('id')
          .eq('email', event.email)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        await supabaseAdmin.rpc('add_communication_suppression', {
          p_tenant_id: tenantId,
          p_channel: 'email',
          p_address: event.email,
          p_reason: 'hard_bounce',
          p_source: 'provider',
          p_provider: 'resend',
          p_provider_event_id: providerEventId,
          p_customer_id: customer?.id || null,
        });

        await supabaseAdmin.from('notifications').insert({
          tenant_id: tenantId,
          type: 'email_bounced',
          title: 'Email Bounced',
          message: `An email to ${event.email} bounced: ${event.reason || 'Unknown reason'}`,
          entity_type: 'communication_message',
          entity_id: messageId,
          priority: 'high',
        });
      }

      if (status === 'complained' && tenantId && event.email) {
        const { data: customer } = await supabaseAdmin
          .from('customers')
          .select('id')
          .eq('email', event.email)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        await supabaseAdmin.rpc('add_communication_suppression', {
          p_tenant_id: tenantId,
          p_channel: 'email',
          p_address: event.email,
          p_reason: 'complaint',
          p_source: 'provider',
          p_provider: 'resend',
          p_provider_event_id: providerEventId,
          p_customer_id: customer?.id || null,
        });

        await supabaseAdmin.from('notifications').insert({
          tenant_id: tenantId,
          type: 'email_complaint',
          title: 'Email Complaint Received',
          message: `A recipient (${event.email}) marked an email as spam. Marketing emails to this address have been suppressed.`,
          entity_type: 'communication_message',
          entity_id: messageId,
          priority: 'high',
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg.replace(/re_[a-zA-Z0-9_]+/g, '[REDACTED]') }, { status: 500 });
  }
}
