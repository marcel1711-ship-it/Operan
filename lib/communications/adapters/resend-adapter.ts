import type { CommunicationProviderAdapter, SendResult, MessageStatus } from '../types';
import { sendResendEmail, isResendConfigured, createResendDomain, getResendDomain, verifyResendDomain, removeResendDomain } from '@/lib/integrations/resend-server';

export class ResendCommunicationAdapter implements CommunicationProviderAdapter {
  readonly provider = 'resend';
  readonly channel = 'email' as const;

  async sendEmail(params: {
    to: string;
    from: string;
    subject: string;
    html: string;
    replyTo?: string;
    idempotencyKey?: string;
    tags?: { name: string; value: string }[];
  }): Promise<SendResult> {
    const result = await sendResendEmail({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      reply_to: params.replyTo,
      idempotency_key: params.idempotencyKey,
      tags: params.tags,
    });

    return {
      success: result.success,
      provider_message_id: result.provider_message_id,
      status: result.status as MessageStatus,
      error: result.error,
      metadata: result.metadata,
    };
  }

  async sendSms(): Promise<SendResult> {
    return { success: false, provider_message_id: null, status: 'failed', error: 'Resend does not support SMS', metadata: {} };
  }

  async sendWhatsApp(): Promise<SendResult> {
    return { success: false, provider_message_id: null, status: 'failed', error: 'Resend does not support WhatsApp', metadata: {} };
  }

  async getDeliveryStatus(params: { provider_message_id: string }): Promise<{
    status: MessageStatus;
    provider_status: string | null;
    error: string | null;
  }> {
    return { status: 'accepted' as MessageStatus, provider_status: 'accepted', error: null };
  }

  async getConnectionStatus(): Promise<{ connected: boolean; error: string | null }> {
    const configured = isResendConfigured();
    return { connected: configured, error: configured ? null : 'Resend not configured' };
  }

  async disconnect(): Promise<{ success: boolean; error: string | null }> {
    return { success: true, error: null };
  }

  async createDomain(domain: string, region?: string) {
    return createResendDomain(domain, region);
  }

  async getDomain(domainId: string) {
    return getResendDomain(domainId);
  }

  async verifyDomain(domainId: string) {
    return verifyResendDomain(domainId);
  }

  async removeDomain(domainId: string) {
    return removeResendDomain(domainId);
  }
}

export const resendAdapter = new ResendCommunicationAdapter();
