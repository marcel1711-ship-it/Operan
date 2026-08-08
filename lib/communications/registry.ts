import type { CommunicationProviderAdapter, CommunicationChannel } from './types';
import { mockAdapter } from './adapters/mock-adapter';
import { resendAdapter } from './adapters/resend-adapter';
import { createTwilioSmsAdapter, createTwilioWhatsAppAdapter } from './adapters/twilio-adapter';

const adapterRegistry = new Map<string, CommunicationProviderAdapter>();

function key(channel: string, provider: string): string {
  return `${channel}::${provider}`;
}

export function registerCommunicationAdapter(
  channel: CommunicationChannel,
  provider: string,
  adapter: CommunicationProviderAdapter
) {
  adapterRegistry.set(key(channel, provider), adapter);
}

export function getCommunicationAdapter(
  channel: CommunicationChannel,
  provider: string
): CommunicationProviderAdapter | null {
  const adapter = adapterRegistry.get(key(channel, provider));
  if (adapter) return adapter;

  if (provider === 'mock' || !provider) {
    return mockAdapter;
  }

  return null;
}

export function getAvailableCommunicationProviders(channel: CommunicationChannel): string[] {
  const prefix = `${channel}::`;
  const providers: string[] = [];
  for (const k of Array.from(adapterRegistry.keys())) {
    if (k.startsWith(prefix)) {
      providers.push(k.slice(prefix.length));
    }
  }
  return providers;
}

registerCommunicationAdapter('email', 'mock', mockAdapter);
registerCommunicationAdapter('email', 'resend', resendAdapter);
registerCommunicationAdapter('sms', 'mock', mockAdapter);
registerCommunicationAdapter('whatsapp', 'mock', mockAdapter);

export function createTenantTwilioAdapters(creds: {
  account_sid: string;
  auth_token: string;
  phone_number: string;
  whatsapp_number?: string;
}) {
  return {
    sms: createTwilioSmsAdapter(creds),
    whatsapp: createTwilioWhatsAppAdapter(creds),
  };
}
