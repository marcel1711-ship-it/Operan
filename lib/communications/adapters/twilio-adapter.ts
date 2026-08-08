import type { CommunicationProviderAdapter, SendResult, MessageStatus } from '../types';

type TwilioCredentials = {
  account_sid: string;
  auth_token: string;
  phone_number: string;
  whatsapp_number?: string;
};

async function twilioRequest(
  creds: TwilioCredentials,
  to: string,
  body: string,
  from: string
): Promise<SendResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}/Messages.json`;
  const auth = Buffer.from(`${creds.account_sid}:${creds.auth_token}`).toString('base64');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        provider_message_id: null,
        status: 'failed' as MessageStatus,
        error: data.message || `Twilio error ${data.code || response.status}`,
        metadata: { twilio_code: data.code, twilio_status: data.status },
      };
    }

    return {
      success: true,
      provider_message_id: data.sid,
      status: 'sent' as MessageStatus,
      error: null,
      metadata: { twilio_status: data.status, twilio_sid: data.sid },
    };
  } catch (err) {
    return {
      success: false,
      provider_message_id: null,
      status: 'failed' as MessageStatus,
      error: err instanceof Error ? err.message : 'Twilio request failed',
    };
  }
}

export class TwilioSmsAdapter implements CommunicationProviderAdapter {
  readonly provider = 'twilio';
  readonly channel = 'sms' as const;

  constructor(private credentials: TwilioCredentials) {}

  async sendSms(params: { to: string; from: string; body: string }): Promise<SendResult> {
    const from = this.credentials.phone_number || params.from;
    return twilioRequest(this.credentials, params.to, params.body, from);
  }

  async getDeliveryStatus(params: { provider_message_id: string }) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.credentials.account_sid}/Messages/${params.provider_message_id}.json`;
    const auth = Buffer.from(`${this.credentials.account_sid}:${this.credentials.auth_token}`).toString('base64');

    try {
      const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
      const data = await response.json();

      const statusMap: Record<string, MessageStatus> = {
        queued: 'queued', sending: 'sending', sent: 'sent',
        delivered: 'delivered', failed: 'failed', undelivered: 'failed',
      };

      return {
        status: statusMap[data.status] || ('sent' as MessageStatus),
        provider_status: data.status,
        error: data.error_message || null,
      };
    } catch {
      return { status: 'sent' as MessageStatus, provider_status: null, error: null };
    }
  }
}

export class TwilioWhatsAppAdapter implements CommunicationProviderAdapter {
  readonly provider = 'twilio_whatsapp';
  readonly channel = 'whatsapp' as const;

  constructor(private credentials: TwilioCredentials) {}

  async sendWhatsApp(params: { to: string; from: string; body: string }): Promise<SendResult> {
    const whatsappFrom = `whatsapp:${this.credentials.whatsapp_number || this.credentials.phone_number || params.from}`;
    const whatsappTo = params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`;
    return twilioRequest(this.credentials, whatsappTo, params.body, whatsappFrom);
  }
}

export function createTwilioSmsAdapter(creds: TwilioCredentials): TwilioSmsAdapter {
  return new TwilioSmsAdapter(creds);
}

export function createTwilioWhatsAppAdapter(creds: TwilioCredentials): TwilioWhatsAppAdapter {
  return new TwilioWhatsAppAdapter(creds);
}
