// Platform Secret Service — server-only.
// All methods encrypt before persistence, decrypt only server-side,
// never log plaintext, return only masked/status to the UI.

import { supabaseAdmin } from '@/lib/supabase-server';
import { encryptSecret, decryptSecret, maskSecret, lastFour } from './platform-vault-crypto';
import { clearCredentialCache } from './credential-resolver';

export type SecretMetadata = {
  secret_name: string;
  is_configured: boolean;
  last_four: string | null;
  last_verified_at: string | null;
  verification_status: string | null;
  verification_error: string | null;
  updated_at: string | null;
};

export type ProviderSecretStatus = {
  provider_key: string;
  secrets: SecretMetadata[];
};

export async function setPlatformSecret(params: {
  providerKey: string;
  secretName: string;
  plaintextValue: string;
  environment?: string;
  configuredBy: string;
  actorEmail?: string;
}): Promise<{ success: boolean; error: string | null }> {
  const { providerKey, secretName, plaintextValue, environment = 'production', configuredBy, actorEmail } = params;

  if (!plaintextValue || plaintextValue.trim() === '') {
    return { success: false, error: 'Credential value cannot be empty' };
  }

  try {
    const { encryptedValue, iv, authTag, version } = encryptSecret(plaintextValue);
    const lf = lastFour(plaintextValue);

    // Upsert: if active row exists, update; otherwise insert
    const { data: existing } = await supabaseAdmin
      .from('platform_provider_secrets')
      .select('id')
      .eq('provider_key', providerKey)
      .eq('secret_name', secretName)
      .eq('environment', environment)
      .eq('is_active', true)
      .maybeSingle();

    const wasExisting = !!existing;

    if (existing) {
      await supabaseAdmin
        .from('platform_provider_secrets')
        .update({
          encrypted_value: encryptedValue,
          encryption_iv: iv,
          authentication_tag: authTag,
          encryption_version: version,
          last_four: lf,
          configured_by: configuredBy,
          verification_status: 'unverified',
          verification_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('platform_provider_secrets')
        .insert({
          provider_key: providerKey,
          secret_name: secretName,
          encrypted_value: encryptedValue,
          encryption_iv: iv,
          authentication_tag: authTag,
          encryption_version: version,
          environment,
          is_active: true,
          last_four: lf,
          configured_by: configuredBy,
          verification_status: 'unverified',
        });
    }

    clearCredentialCache(providerKey, secretName);

    await logAudit({
      actorId: configuredBy,
      actorEmail,
      providerKey,
      action: wasExisting ? 'replaced' : 'configured',
      environment,
      result: 'success',
      detail: `${secretName} ${wasExisting ? 'replaced' : 'saved'} (••••${lf})`,
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save credential' };
  }
}

export async function getPlatformSecret(
  providerKey: string,
  secretName: string,
  environment: string = 'production'
): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('platform_provider_secrets')
      .select('encrypted_value, encryption_iv, authentication_tag')
      .eq('provider_key', providerKey)
      .eq('secret_name', secretName)
      .eq('environment', environment)
      .eq('is_active', true)
      .maybeSingle();

    if (!data) return null;
    return decryptSecret(
      data.encrypted_value as unknown as Buffer,
      data.encryption_iv as unknown as Buffer,
      data.authentication_tag as unknown as Buffer
    );
  } catch {
    return null;
  }
}

export async function deletePlatformSecret(params: {
  providerKey: string;
  secretName: string;
  environment?: string;
  actorId: string;
  actorEmail?: string;
}): Promise<{ success: boolean; error: string | null }> {
  const { providerKey, secretName, environment = 'production', actorId, actorEmail } = params;

  try {
    const { data: existing } = await supabaseAdmin
      .from('platform_provider_secrets')
      .select('id, last_four')
      .eq('provider_key', providerKey)
      .eq('secret_name', secretName)
      .eq('environment', environment)
      .eq('is_active', true)
      .maybeSingle();

    if (!existing) {
      return { success: false, error: 'Credential not found' };
    }

    await supabaseAdmin
      .from('platform_provider_secrets')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    clearCredentialCache(providerKey, secretName);

    await logAudit({
      actorId,
      actorEmail,
      providerKey,
      action: 'deleted',
      environment,
      result: 'success',
      detail: `${secretName} deleted (was ••••${existing.last_four || ''})`,
    });

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete credential' };
  }
}

export async function hasPlatformSecret(
  providerKey: string,
  secretName: string,
  environment: string = 'production'
): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('platform_provider_secrets')
      .select('id')
      .eq('provider_key', providerKey)
      .eq('secret_name', secretName)
      .eq('environment', environment)
      .eq('is_active', true)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

export async function listProviderSecrets(
  providerKey: string,
  environment: string = 'production'
): Promise<SecretMetadata[]> {
  try {
    const { data } = await supabaseAdmin
      .from('platform_provider_secrets')
      .select('secret_name, is_active, last_four, last_verified_at, verification_status, verification_error, updated_at')
      .eq('provider_key', providerKey)
      .eq('environment', environment)
      .order('secret_name');

    return (data || []).map((row: any) => ({
      secret_name: row.secret_name,
      is_configured: row.is_active,
      last_four: row.last_four,
      last_verified_at: row.last_verified_at,
      verification_status: row.verification_status,
      verification_error: row.verification_error,
      updated_at: row.updated_at,
    }));
  } catch {
    return [];
  }
}

export async function updateVerificationStatus(params: {
  providerKey: string;
  secretName: string;
  status: 'verified' | 'failed';
  error?: string | null;
  environment?: string;
}): Promise<void> {
  const { providerKey, secretName, status, error = null, environment = 'production' } = params;
  try {
    await supabaseAdmin
      .from('platform_provider_secrets')
      .update({
        verification_status: status,
        verification_error: error,
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('provider_key', providerKey)
      .eq('secret_name', secretName)
      .eq('environment', environment)
      .eq('is_active', true);
  } catch {
    // best-effort
  }
}

export async function logAudit(params: {
  actorId: string;
  actorEmail?: string;
  providerKey: string;
  action: string;
  environment?: string;
  result: string;
  detail?: string;
}): Promise<void> {
  try {
    await supabaseAdmin.from('platform_secret_audit_log').insert({
      actor_id: params.actorId,
      actor_email: params.actorEmail,
      provider_key: params.providerKey,
      action: params.action,
      environment: params.environment || null,
      result: params.result,
      detail: params.detail || null,
    });
  } catch {
    // best-effort
  }
}

export { maskSecret };
