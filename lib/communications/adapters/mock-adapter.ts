import type { CommunicationProviderAdapter, SendResult, MessageStatus } from '../types';

export class MockCommunicationAdapter implements CommunicationProviderAdapter {
  readonly provider = 'mock';
  readonly channel = 'email' as const;

  async sendEmail(params: {
    to: string;
    from: string;
    subject: string;
    html: string;
    replyTo?: string;
  }): Promise<SendResult> {
    const id = `mock_email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      success: true,
      provider_message_id: id,
      status: 'sent' as MessageStatus,
      error: null,
      metadata: { provider_status: 'sent_mock', environment: 'mock', is_mock: true },
    };
  }

  async sendSms(params: {
    to: string;
    from: string;
    body: string;
  }): Promise<SendResult> {
    const id = `mock_sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      success: true,
      provider_message_id: id,
      status: 'sent' as MessageStatus,
      error: null,
      metadata: { provider_status: 'sent_mock', environment: 'mock', is_mock: true },
    };
  }

  async sendWhatsApp(params: {
    to: string;
    from: string;
    body: string;
  }): Promise<SendResult> {
    const id = `mock_wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      success: true,
      provider_message_id: id,
      status: 'sent' as MessageStatus,
      error: null,
      metadata: { provider_status: 'sent_mock', environment: 'mock', is_mock: true },
    };
  }

  async getDeliveryStatus(params: { provider_message_id: string }): Promise<{
    status: MessageStatus;
    provider_status: string | null;
    error: string | null;
  }> {
    return {
      status: 'sent' as MessageStatus,
      provider_status: 'sent_mock',
      error: null,
    };
  }

  async getConnectionStatus(): Promise<{ connected: boolean; error: string | null }> {
    return { connected: true, error: null };
  }

  async disconnect(): Promise<{ success: boolean; error: string | null }> {
    return { success: true, error: null };
  }
}

export const mockAdapter = new MockCommunicationAdapter();
