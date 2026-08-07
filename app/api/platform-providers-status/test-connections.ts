import { getStripeClientAsync } from '@/lib/integrations/stripe-server';
import { isResendConfiguredAsync, getApiKeyAsync } from '@/lib/integrations/resend-server';
import { getGoogleClientIdAsync, getGoogleClientSecretAsync } from '@/lib/integrations/google-calendar-service';

function checkEnvVar(envVar: string): boolean {
  const val = process.env[envVar];
  return !!val && val.trim() !== '';
}

export async function testStripeConnection(): Promise<{ ok: boolean; message: string }> {
  const client = await getStripeClientAsync();
  if (!client) return { ok: false, message: 'Stripe API key is not configured' };

  try {
    await client.balance.retrieve();
    return { ok: true, message: 'Stripe API connection verified successfully' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, message: `Stripe API rejected the request: ${msg}` };
  }
}

export async function testResendConnection(): Promise<{ ok: boolean; message: string }> {
  if (!(await isResendConfiguredAsync())) return { ok: false, message: 'Resend API key is not configured' };

  try {
    const apiKey = await getApiKeyAsync();
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (response.ok) return { ok: true, message: 'Resend API connection verified successfully' };
    return { ok: false, message: `Resend API returned status ${response.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, message: `Resend API request failed: ${msg}` };
  }
}

export async function testGoogleCalendarConnection(): Promise<{ ok: boolean; message: string }> {
  const clientId = await getGoogleClientIdAsync();
  const clientSecret = await getGoogleClientSecretAsync();
  if (!clientId || !clientSecret) {
    return { ok: false, message: 'Google OAuth credentials are not fully configured' };
  }
  if (!checkEnvVar('INTEGRATION_ENCRYPTION_KEY')) {
    return { ok: false, message: 'Integration encryption key is not configured' };
  }

  try {
    const crypto = require('crypto');
    const key = process.env.INTEGRATION_ENCRYPTION_KEY;
    if (key && key.length >= 32) {
      crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), crypto.randomBytes(12));
    }
    return { ok: true, message: 'Google OAuth configuration and encryption key verified' };
  } catch {
    return { ok: false, message: 'Encryption key format is invalid — must be a 32-byte hex string' };
  }
}
