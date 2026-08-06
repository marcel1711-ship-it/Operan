import { supabaseAdmin } from '@/lib/supabase-server';
import { getCommunicationAdapter } from './registry';
import { renderTemplate, sanitizeHtml, buildTemplateContext } from './template-renderer';
import type { CommunicationChannel } from './types';

export type SendMessageParams = {
  tenant_id: string;
  channel: CommunicationChannel;
  template_id?: string;
  recipient: string;
  customer_id?: string;
  reservation_id?: string;
  workflow_id?: string;
  workflow_run_id?: string;
  workflow_step_run_id?: string;
  is_transactional?: boolean;
  scheduled_for?: string | null;
  idempotency_key?: string;
  variables?: Record<string, unknown>;
  test_mode?: boolean;
};

export type SendMessageResult = {
  success: boolean;
  message_id: string | null;
  status: string;
  error: string | null;
};

export async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const {
    tenant_id,
    channel,
    template_id,
    recipient,
    customer_id,
    reservation_id,
    workflow_id,
    workflow_run_id,
    workflow_step_run_id,
    is_transactional = true,
    scheduled_for,
    idempotency_key,
    test_mode = false,
  } = params;

  // 1. Check consent if customer_id provided
  if (customer_id) {
    const { data: consentResult } = await supabaseAdmin.rpc('check_communication_consent', {
      p_customer_id: customer_id,
      p_channel: channel,
      p_is_transactional: is_transactional,
    });

    const consent = consentResult as { allowed?: boolean; reason?: string } | null;
    if (consent && !consent.allowed) {
      const { data: skippedMsg } = await supabaseAdmin.rpc('queue_communication_message', {
        p_tenant_id: tenant_id,
        p_channel: channel,
        p_recipient: recipient,
        p_rendered_body: '[SKIPPED — consent denied]',
        p_customer_id: customer_id,
        p_reservation_id: reservation_id,
        p_workflow_id: workflow_id,
        p_workflow_run_id: workflow_run_id,
        p_workflow_step_run_id: workflow_step_run_id,
        p_scheduled_for: scheduled_for,
        p_idempotency_key: idempotency_key,
        p_metadata: { skipped_reason: consent.reason, test_mode },
      });

      return {
        success: false,
        message_id: (skippedMsg as { message_id?: string })?.message_id || null,
        status: 'skipped',
        error: `Consent denied: ${consent.reason}`,
      };
    }
  }

  // 2. Resolve provider from tenant settings
  const { data: settings } = await supabaseAdmin
    .from('tenant_communication_settings')
    .select('default_email_provider, default_sms_provider, default_whatsapp_provider, sender_name, from_email, reply_to_email, sms_sender, whatsapp_business_number, test_recipient_email, test_recipient_phone')
    .eq('tenant_id', tenant_id)
    .maybeSingle();

  let provider = 'mock';
  let senderName = settings?.sender_name || '';
  let fromEmail = settings?.from_email || '';
  let replyTo = settings?.reply_to_email || '';
  let smsFrom = settings?.sms_sender || '';
  let waFrom = settings?.whatsapp_business_number || '';

  if (channel === 'email') provider = settings?.default_email_provider || 'mock';
  if (channel === 'sms') provider = settings?.default_sms_provider || 'mock';
  if (channel === 'whatsapp') provider = settings?.default_whatsapp_provider || 'mock';

  // 3. Resolve and render template
  let renderedSubject = '';
  let renderedBody = '';

  if (template_id) {
    const { data: template } = await supabaseAdmin
      .from('communication_templates')
      .select('subject, body, channel')
      .eq('id', template_id)
      .maybeSingle();

    if (!template) {
      return { success: false, message_id: null, status: 'failed', error: 'Template not found' };
    }

    const context = await buildTemplateContext(tenant_id, reservation_id, customer_id);
    renderedSubject = template.subject ? renderTemplate(template.subject, context) : '';
    renderedBody = renderTemplate(template.body, context);

    if (channel === 'email') {
      renderedBody = sanitizeHtml(renderedBody);
    }
  } else {
    renderedBody = params.variables?.body as string || '';
    renderedSubject = params.variables?.subject as string || '';
  }

  // 4. Use test recipient in test mode
  let actualRecipient = recipient;
  if (test_mode) {
    if (channel === 'email' && settings?.test_recipient_email) {
      actualRecipient = settings.test_recipient_email;
    } else if ((channel === 'sms' || channel === 'whatsapp') && settings?.test_recipient_phone) {
      actualRecipient = settings.test_recipient_phone;
    }
  }

  // 5. Queue the message
  const { data: queueResult } = await supabaseAdmin.rpc('queue_communication_message', {
    p_tenant_id: tenant_id,
    p_channel: channel,
    p_recipient: actualRecipient,
    p_rendered_body: renderedBody,
    p_provider: provider,
    p_rendered_subject: renderedSubject || null,
    p_template_id: template_id || null,
    p_customer_id: customer_id || null,
    p_reservation_id: reservation_id || null,
    p_workflow_id: workflow_id || null,
    p_workflow_run_id: workflow_run_id || null,
    p_workflow_step_run_id: workflow_step_run_id || null,
    p_scheduled_for: scheduled_for || null,
    p_idempotency_key: idempotency_key || null,
    p_metadata: { test_mode, is_transactional },
  });

  const messageId = (queueResult as { message_id?: string })?.message_id;
  if (!messageId) {
    return { success: true, message_id: null, status: 'queued', error: null };
  }

  // 6. If scheduled, don't send now
  if (scheduled_for) {
    return { success: true, message_id: messageId, status: 'scheduled', error: null };
  }

  // 7. Get adapter and send
  const adapter = getCommunicationAdapter(channel, provider);
  if (!adapter) {
    await supabaseAdmin.rpc('update_communication_message_status', {
      p_message_id: messageId,
      p_status: 'failed',
      p_failure_code: 'NO_ADAPTER',
      p_failure_reason: `No adapter for provider: ${provider}`,
    });
    return { success: false, message_id: messageId, status: 'failed', error: `No adapter for ${provider}` };
  }

  // Mark as sending
  await supabaseAdmin.rpc('update_communication_message_status', {
    p_message_id: messageId,
    p_status: 'sending',
  });

  try {
    let sendResult;
    if (channel === 'email') {
      sendResult = await adapter.sendEmail!({
        to: actualRecipient,
        from: fromEmail || `${senderName} <noreply@example.com>`,
        replyTo: replyTo || undefined,
        subject: renderedSubject,
        html: renderedBody,
      });
    } else if (channel === 'sms') {
      sendResult = await adapter.sendSms!({
        to: actualRecipient,
        from: smsFrom || 'MOCK',
        body: renderedBody,
      });
    } else if (channel === 'whatsapp') {
      sendResult = await adapter.sendWhatsApp!({
        to: actualRecipient,
        from: waFrom || 'MOCK',
        body: renderedBody,
      });
    } else {
      // in_app — just mark as sent
      sendResult = { success: true, provider_message_id: `inapp_${messageId}`, status: 'sent', error: null };
    }

    await supabaseAdmin.rpc('update_communication_message_status', {
      p_message_id: messageId,
      p_status: sendResult.status,
      p_provider_message_id: sendResult.provider_message_id,
      p_failure_code: sendResult.error ? 'PROVIDER_ERROR' : null,
      p_failure_reason: sendResult.error,
    });

    return {
      success: sendResult.success,
      message_id: messageId,
      status: sendResult.status,
      error: sendResult.error,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    await supabaseAdmin.rpc('update_communication_message_status', {
      p_message_id: messageId,
      p_status: 'failed',
      p_failure_code: 'EXCEPTION',
      p_failure_reason: errorMsg,
    });
    return { success: false, message_id: messageId, status: 'failed', error: errorMsg };
  }
}
