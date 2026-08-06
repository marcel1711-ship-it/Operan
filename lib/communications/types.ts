import type { IntegrationEnvironment } from '@/lib/integrations/types';

export type CommunicationChannel = 'email' | 'sms' | 'whatsapp' | 'in_app';

export type MessageStatus = 'queued' | 'scheduled' | 'sending' | 'sent' | 'sent_mock' | 'delivered' | 'failed' | 'failed_mock' | 'cancelled' | 'skipped' | 'action_required';

export type SendEmailParams = {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  metadata?: Record<string, unknown>;
};

export type SendSmsParams = {
  to: string;
  from: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export type SendWhatsAppParams = {
  to: string;
  from: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export type SendResult = {
  success: boolean;
  provider_message_id: string | null;
  status: MessageStatus;
  error: string | null;
  metadata?: Record<string, unknown>;
};

export type DeliveryStatusResult = {
  status: MessageStatus;
  provider_status: string | null;
  error: string | null;
};

export interface CommunicationProviderAdapter {
  readonly provider: string;
  readonly channel: CommunicationChannel;

  sendEmail?(params: SendEmailParams): Promise<SendResult>;
  sendSms?(params: SendSmsParams): Promise<SendResult>;
  sendWhatsApp?(params: SendWhatsAppParams): Promise<SendResult>;
  getDeliveryStatus?(params: { provider_message_id: string }): Promise<DeliveryStatusResult>;
  verifyWebhook?(params: { raw_body: string; signature: string; headers: Record<string, string> }): Promise<{
    verified: boolean;
    event_type: string | null;
    message_id: string | null;
    status: MessageStatus | null;
    error: string | null;
  }>;
  parseWebhookEvent?(params: { raw_event: unknown }): Promise<{
    event_type: string;
    message_id: string | null;
    status: MessageStatus | null;
    error: string | null;
  }>;
  getConnectionStatus?(params: { integration_id: string }): Promise<{
    connected: boolean;
    error: string | null;
  }>;
  disconnect?(params: { integration_id: string }): Promise<{ success: boolean; error: string | null }>;
}
