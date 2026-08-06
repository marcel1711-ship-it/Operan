import { supabase } from '@/lib/supabase';
import { getAdapter } from './registry';
import type {
  TenantIntegration,
  PlatformIntegration,
  CatalogEntry,
  IntegrationCategory,
  CheckoutResult,
  CreateCheckoutParams,
  PaymentAdapter,
} from './types';

// ---- Tenant integration queries ----

export async function getTenantIntegration(
  tenantId: string,
  category: IntegrationCategory
): Promise<TenantIntegration | null> {
  const { data, error } = await supabase
    .from('tenant_integrations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('category', category)
    .order('is_default', { ascending: false })
    .maybeSingle();
  if (error || !data) return null;
  return data as TenantIntegration;
}

export async function getTenantIntegrationsByCategory(
  tenantId: string
): Promise<Record<string, TenantIntegration[]>> {
  const { data, error } = await supabase
    .from('tenant_integrations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('category')
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error || !data) return {};
  const grouped: Record<string, TenantIntegration[]> = {};
  for (const row of data as TenantIntegration[]) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(row);
  }
  return grouped;
}

export async function createTenantIntegration(
  tenantId: string,
  category: IntegrationCategory,
  provider: string,
  environment: 'test' | 'live' = 'test'
): Promise<TenantIntegration | null> {
  const { data, error } = await supabase
    .from('tenant_integrations')
    .insert({
      tenant_id: tenantId,
      category,
      provider,
      environment,
      connection_status: 'connecting',
      is_default: true,
    })
    .select()
    .single();
  if (error) return null;
  return data as TenantIntegration;
}

export async function updateTenantIntegration(
  id: string,
  updates: Partial<TenantIntegration>
): Promise<boolean> {
  const { error } = await supabase
    .from('tenant_integrations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

export async function disconnectTenantIntegration(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('tenant_integrations')
    .update({
      connection_status: 'disconnected',
      enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return !error;
}

// ---- Platform integration queries ----

export async function getPlatformIntegration(
  category: IntegrationCategory
): Promise<PlatformIntegration | null> {
  const { data, error } = await supabase
    .from('platform_integrations')
    .select('*')
    .eq('category', category)
    .order('updated_at', { ascending: false })
    .maybeSingle();
  if (error || !data) return null;
  return data as PlatformIntegration;
}

export async function createPlatformIntegration(
  category: IntegrationCategory,
  provider: string,
  environment: 'test' | 'live' = 'test'
): Promise<PlatformIntegration | null> {
  const { data, error } = await supabase
    .from('platform_integrations')
    .insert({ category, provider, environment, connection_status: 'connecting' })
    .select()
    .single();
  if (error) return null;
  return data as PlatformIntegration;
}

export async function updatePlatformIntegration(
  id: string,
  updates: Partial<PlatformIntegration>
): Promise<boolean> {
  const { error } = await supabase
    .from('platform_integrations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

export async function disconnectPlatformIntegration(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('platform_integrations')
    .update({
      connection_status: 'disconnected',
      webhook_status: 'disabled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return !error;
}

// ---- Catalog queries ----

export async function getCatalog(): Promise<CatalogEntry[]> {
  const { data, error } = await supabase
    .from('integration_catalog')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
    .order('display_name');
  if (error || !data) return [];
  return data as CatalogEntry[];
}

export async function getCatalogByCategory(category: IntegrationCategory): Promise<CatalogEntry[]> {
  const { data, error } = await supabase
    .from('integration_catalog')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .order('sort_order')
    .order('display_name');
  if (error || !data) return [];
  return data as CatalogEntry[];
}

// ---- Payment-specific helpers (built on top of the generic framework) ----

export function isTenantReadyForPayments(conn: TenantIntegration | null): boolean {
  if (!conn) return false;
  return (
    conn.connection_status === 'connected' &&
    (conn.capabilities?.charges_enabled === true) &&
    conn.enabled === true
  );
}

export async function createCheckoutForReservation(
  params: CreateCheckoutParams
): Promise<CheckoutResult> {
  const conn = await getTenantIntegration(params.tenant_id, 'payments');
  if (!isTenantReadyForPayments(conn)) {
    return {
      checkout_url: null,
      checkout_session_id: null,
      client_secret: null,
      status: 'failed',
      error: 'Payment integration is not configured. Configure it from Settings → Integrations → Payments.',
    };
  }

  const adapter = getAdapter('payments', conn!.provider) as PaymentAdapter | null;
  if (!adapter || typeof adapter.createCheckout !== 'function') {
    return {
      checkout_url: null,
      checkout_session_id: null,
      client_secret: null,
      status: 'failed',
      error: `Provider "${conn!.provider}" does not support checkout.`,
    };
  }

  return adapter.createCheckout(params);
}
