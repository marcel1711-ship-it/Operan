// Credential resolver: vault-first, env-fallback, cached.
// Server-only. NEVER import from client code.

import { supabaseAdmin } from '@/lib/supabase-server';
import { decryptSecret } from './platform-vault-crypto';

type CacheEntry = {
  value: string;
  expiresAt: number;
};

const CACHE_TTL_MS = 30_000; // 30 seconds — short enough to pick up vault changes quickly
const cache = new Map<string, CacheEntry>();

function envVarName(providerKey: string, secretName: string): string {
  // Map vault secret names to environment variable names for fallback
  const ENV_MAP: Record<string, string> = {
    'stripe:STRIPE_SECRET_KEY': 'STRIPE_SECRET_KEY',
    'stripe:STRIPE_PUBLISHABLE_KEY': 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'stripe:STRIPE_WEBHOOK_SECRET': 'STRIPE_WEBHOOK_SECRET',
    'resend:RESEND_API_KEY': 'RESEND_API_KEY',
    'resend:RESEND_WEBHOOK_SECRET': 'RESEND_WEBHOOK_SECRET',
    'google_calendar:GOOGLE_CLIENT_ID': 'GOOGLE_CLIENT_ID',
    'google_calendar:GOOGLE_CLIENT_SECRET': 'GOOGLE_CLIENT_SECRET',
  };
  return ENV_MAP[`${providerKey}:${secretName}`] || secretName;
}

export async function resolveCredential(
  providerKey: string,
  secretName: string,
  environment: string = 'production'
): Promise<string | null> {
  const cacheKey = `${providerKey}:${secretName}:${environment}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // 1. Try vault
  try {
    const { data, error } = await supabaseAdmin
      .from('platform_provider_secrets')
      .select('encrypted_value, encryption_iv, authentication_tag, is_active')
      .eq('provider_key', providerKey)
      .eq('secret_name', secretName)
      .eq('environment', environment)
      .eq('is_active', true)
      .maybeSingle();

    if (!error && data) {
      const plaintext = decryptSecret(
        data.encrypted_value as unknown as Buffer,
        data.encryption_iv as unknown as Buffer,
        data.authentication_tag as unknown as Buffer
      );
      cache.set(cacheKey, { value: plaintext, expiresAt: Date.now() + CACHE_TTL_MS });
      return plaintext;
    }
  } catch {
    // vault not available, fall through to env
  }

  // 2. Env fallback
  const envVal = process.env[envVarName(providerKey, secretName)];
  if (envVal && envVal.trim() !== '') {
    cache.set(cacheKey, { value: envVal, expiresAt: Date.now() + CACHE_TTL_MS });
    return envVal;
  }

  // 3. Not found
  return null;
}

export async function hasCredential(
  providerKey: string,
  secretName: string,
  environment: string = 'production'
): Promise<boolean> {
  // Check vault first
  try {
    const { data } = await supabaseAdmin
      .from('platform_provider_secrets')
      .select('id')
      .eq('provider_key', providerKey)
      .eq('secret_name', secretName)
      .eq('environment', environment)
      .eq('is_active', true)
      .maybeSingle();
    if (data) return true;
  } catch {
    // ignore
  }
  // Env fallback
  return !!process.env[envVarName(providerKey, secretName)];
}

export function clearCredentialCache(providerKey?: string, secretName?: string): void {
  if (!providerKey) {
    cache.clear();
    return;
  }
  const prefix = secretName ? `${providerKey}:${secretName}:` : `${providerKey}:`;
  cache.forEach((_v, key) => {
    if (key.startsWith(prefix)) cache.delete(key);
  });
}
