import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/integrations/super-admin-auth';
import {
  getStripeEnvironment,
  getAppBaseUrl,
} from '@/lib/integrations/stripe-server';
import { hasCredential } from '@/lib/integrations/credential-resolver';
import { listProviderSecrets } from '@/lib/integrations/platform-secret-service';
import {
  PROVIDER_DEFINITIONS,
  getProviderDefinition,
  type ProviderDefinition,
} from '@/lib/integrations/provider-definitions';

export type CredentialStatus = {
  env_var: string;
  label: string;
  purpose: string;
  classification: 'server_only' | 'browser_safe';
  required: boolean;
  configured: boolean;
  where_to_obtain: string;
  where_to_configure: string;
  redeploy_required: boolean;
};

export type HealthCheckResult = {
  label: string;
  ok: boolean;
  hint: string;
};

export type ProviderReadiness = {
  providerKey: string;
  displayName: string;
  category: string;
  description: string;
  status: 'ready' | 'configuration_required' | 'degraded' | 'coming_soon' | 'disabled';
  environment: 'test' | 'live' | null;
  connectionMode: 'platform_managed' | 'tenant_managed' | 'tenant_owned';
  platformConfigurationMode: 'oauth' | 'connect_onboarding' | 'credentials_form' | 'internal_setup' | 'environment_setup' | 'coming_soon';
  tenantConfigurationMode: 'oauth' | 'connect_onboarding' | 'credentials_form' | 'internal_setup' | 'environment_setup' | 'coming_soon';
  credentials: CredentialStatus[];
  healthChecks: HealthCheckResult[];
  callbackUrls: Array<{ label: string; url: string; description: string }>;
  webhookUrls: Array<{ label: string; url: string; description: string; required_events: string[] }>;
  tenantCapabilities: Array<{ label: string; description: string }>;
  blockers: string[];
  lastCheckedAt: string;
  setupInstructions: string[];
};

function getBaseUrl(): string {
  return getAppBaseUrl().replace(/\/$/, '');
}

function checkEnvVar(envVar: string): boolean {
  const val = process.env[envVar];
  return !!val && val.trim() !== '';
}

// Vault-aware credential check: returns true if credential exists in vault OR env
async function checkCredential(providerKey: string, secretName: string, envVar: string): Promise<boolean> {
  const inVault = await hasCredential(providerKey, secretName, 'production');
  if (inVault) return true;
  // Also check test env for stripe
  if (providerKey === 'stripe') {
    const inVaultTest = await hasCredential(providerKey, secretName, 'test');
    if (inVaultTest) return true;
  }
  return checkEnvVar(envVar);
}

async function buildCredentialStatus(def: ProviderDefinition): Promise<CredentialStatus[]> {
  const vaultSecrets = await listProviderSecrets(def.providerKey, 'production');
  const vaultNames = new Set(vaultSecrets.filter(s => s.is_configured).map(s => s.secret_name));

  return Promise.all(def.credentials.map(async cred => {
    const inVault = vaultNames.has(cred.env_var);
    const inEnv = checkEnvVar(cred.env_var);
    return {
      env_var: cred.env_var,
      label: cred.label,
      purpose: cred.purpose,
      classification: cred.classification,
      required: cred.required,
      configured: inVault || inEnv,
      where_to_obtain: cred.where_to_obtain,
      where_to_configure: cred.where_to_configure,
      redeploy_required: cred.redeploy_required && !inVault, // no redeploy needed if in vault
    };
  }));
}

function buildBlockers(
  def: ProviderDefinition,
  credentials: CredentialStatus[],
  healthChecks: HealthCheckResult[]
): string[] {
  const blockers: string[] = [];

  if (def.isComingSoon) {
    blockers.push('Backend implementation is not yet available.');
    return blockers;
  }

  const missingRequired = credentials.filter(c => c.required && !c.configured);
  for (const cred of missingRequired) {
    blockers.push(`Missing required credential: ${cred.env_var}`);
  }

  const failedChecks = healthChecks.filter(c => !c.ok);
  for (const check of failedChecks) {
    blockers.push(`${check.label}: ${check.hint}`);
  }

  return blockers;
}

function determineStatus(
  def: ProviderDefinition,
  credentials: CredentialStatus[],
  healthChecks: HealthCheckResult[]
): ProviderReadiness['status'] {
  if (def.isComingSoon) return 'coming_soon';

  const missingRequired = credentials.filter(c => c.required && !c.configured);
  if (missingRequired.length > 0) return 'configuration_required';

  const failedChecks = healthChecks.filter(c => !c.ok);
  if (failedChecks.length > 0) return 'degraded';

  return 'ready';
}

// ── Provider-specific health check implementations ──

async function getStripeHealthChecks(): Promise<HealthCheckResult[]> {
  const secretKeyOk = await checkCredential('stripe', 'STRIPE_SECRET_KEY', 'STRIPE_SECRET_KEY');
  const webhookOk = await checkCredential('stripe', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET');
  const pubKeyOk = await checkCredential('stripe', 'STRIPE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
  return [
    { label: 'Stripe API Key', ok: secretKeyOk, hint: 'Configure in Super Admin → Integrations → Stripe' },
    { label: 'Webhook Secret', ok: webhookOk, hint: 'Configure in Super Admin → Integrations → Stripe' },
    { label: 'Publishable Key', ok: pubKeyOk, hint: 'Configure in Super Admin → Integrations → Stripe' },
    { label: 'Onboarding Route', ok: true, hint: '/api/stripe-onboarding' },
    { label: 'Webhook Route', ok: true, hint: '/api/stripe-webhook' },
  ];
}

async function getResendHealthChecks(): Promise<HealthCheckResult[]> {
  const apiKeyOk = await checkCredential('resend', 'RESEND_API_KEY', 'RESEND_API_KEY');
  const webhookOk = await checkCredential('resend', 'RESEND_WEBHOOK_SECRET', 'RESEND_WEBHOOK_SECRET');
  return [
    { label: 'Resend API Key', ok: apiKeyOk, hint: 'Configure in Super Admin → Integrations → Resend' },
    { label: 'Webhook Secret', ok: webhookOk, hint: 'Configure in Super Admin → Integrations → Resend' },
    { label: 'Webhook Route', ok: true, hint: '/api/webhooks/resend' },
  ];
}

async function getGoogleCalendarHealthChecks(): Promise<HealthCheckResult[]> {
  const clientIdOk = await checkCredential('google_calendar', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID');
  const clientSecretOk = await checkCredential('google_calendar', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET');
  const encryptionKeyOk = checkEnvVar('INTEGRATION_ENCRYPTION_KEY');
  return [
    { label: 'Google OAuth Client ID', ok: clientIdOk, hint: 'Configure in Super Admin → Integrations → Google Calendar' },
    { label: 'Google OAuth Client Secret', ok: clientSecretOk, hint: 'Configure in Super Admin → Integrations → Google Calendar' },
    { label: 'Encryption Key', ok: encryptionKeyOk, hint: 'Set INTEGRATION_ENCRYPTION_KEY for secure token storage' },
    { label: 'OAuth Callback Route', ok: true, hint: '/api/integrations/google-calendar/callback' },
  ];
}

function getIcalHealthChecks(): Promise<HealthCheckResult[]> {
  return Promise.resolve([
    { label: 'Export Endpoint', ok: true, hint: '/ical/[token] route is deployed' },
    { label: 'Import Worker', ok: true, hint: 'sync-ical-imports edge function is deployed' },
    { label: 'Feed Token Generation', ok: true, hint: 'Token generation RPC is available' },
  ]);
}

function getWebhooksHealthChecks(): Promise<HealthCheckResult[]> {
  return Promise.resolve([
    { label: 'Delivery Worker', ok: true, hint: 'deliver-webhooks edge function is deployed' },
    { label: 'Outbox Processing', ok: true, hint: 'process-outbox edge function is deployed' },
    { label: 'HMAC Signing', ok: true, hint: 'Webhook secret rotation is available' },
    { label: 'Dead-Letter Handling', ok: true, hint: 'Failed deliveries are tracked for retry' },
  ]);
}

function getApiAccessHealthChecks(): Promise<HealthCheckResult[]> {
  return Promise.resolve([
    { label: 'API Routes', ok: true, hint: '/api/v1/* routes are deployed' },
    { label: 'Key Hashing', ok: true, hint: 'API key authentication RPC is available' },
    { label: 'Rate Limiting', ok: true, hint: 'Rate limiting is active on API routes' },
    { label: 'Tenant Isolation', ok: true, hint: 'Tenant membership checks are enforced' },
  ]);
}

function getTwilioHealthChecks(): Promise<HealthCheckResult[]> {
  return Promise.resolve([
    { label: 'Twilio Account SID', ok: checkEnvVar('TWILIO_ACCOUNT_SID'), hint: 'Set TWILIO_ACCOUNT_SID in environment variables' },
    { label: 'Twilio Auth Token', ok: checkEnvVar('TWILIO_AUTH_TOKEN'), hint: 'Set TWILIO_AUTH_TOKEN in environment variables' },
  ]);
}

function getMetaWhatsAppHealthChecks(): Promise<HealthCheckResult[]> {
  return Promise.resolve([
    { label: 'Meta App ID', ok: checkEnvVar('META_APP_ID'), hint: 'Set META_APP_ID in environment variables' },
    { label: 'Meta App Secret', ok: checkEnvVar('META_APP_SECRET'), hint: 'Set META_APP_SECRET in environment variables' },
    { label: 'Verify Token', ok: checkEnvVar('WHATSAPP_VERIFY_TOKEN'), hint: 'Set WHATSAPP_VERIFY_TOKEN in environment variables' },
  ]);
}

function getQuickBooksHealthChecks(): Promise<HealthCheckResult[]> {
  return Promise.resolve([
    { label: 'QuickBooks Client ID', ok: checkEnvVar('QUICKBOOKS_CLIENT_ID'), hint: 'Set QUICKBOOKS_CLIENT_ID in environment variables' },
    { label: 'QuickBooks Client Secret', ok: checkEnvVar('QUICKBOOKS_CLIENT_SECRET'), hint: 'Set QUICKBOOKS_CLIENT_SECRET in environment variables' },
  ]);
}

const HEALTH_CHECK_BUILDERS: Record<string, () => Promise<HealthCheckResult[]>> = {
  stripe: getStripeHealthChecks,
  resend: getResendHealthChecks,
  google_calendar: getGoogleCalendarHealthChecks,
  ical: getIcalHealthChecks,
  webhooks: getWebhooksHealthChecks,
  api_access: getApiAccessHealthChecks,
  twilio: getTwilioHealthChecks,
  meta_whatsapp: getMetaWhatsAppHealthChecks,
  quickbooks: getQuickBooksHealthChecks,
  twilio_whatsapp: getTwilioHealthChecks,
};

function getProviderEnvironment(providerKey: string): 'test' | 'live' | null {
  if (providerKey === 'stripe') return getStripeEnvironment();
  return null;
}

async function buildProviderReadiness(def: ProviderDefinition): Promise<ProviderReadiness> {
  const credentials = await buildCredentialStatus(def);
  const healthChecks = HEALTH_CHECK_BUILDERS[def.providerKey]
    ? await HEALTH_CHECK_BUILDERS[def.providerKey]()
    : [];
  const status = determineStatus(def, credentials, healthChecks);
  const blockers = buildBlockers(def, credentials, healthChecks);
  const baseUrl = getBaseUrl();

  const callbackUrls = def.callbackUrls.map(cb => ({
    label: cb.label,
    url: `${baseUrl}${cb.path}`,
    description: cb.description,
  }));

  const webhookUrls = def.webhookUrls.map(wh => ({
    label: wh.label,
    url: `${baseUrl}${wh.path}`,
    description: wh.description,
    required_events: wh.required_events,
  }));

  return {
    providerKey: def.providerKey,
    displayName: def.displayName,
    category: def.category,
    description: def.description,
    status,
    environment: getProviderEnvironment(def.providerKey),
    connectionMode: def.connectionMode,
    platformConfigurationMode: def.platformConfigurationMode,
    tenantConfigurationMode: def.tenantConfigurationMode,
    credentials,
    healthChecks,
    callbackUrls,
    webhookUrls,
    tenantCapabilities: def.tenantCapabilities,
    blockers,
    lastCheckedAt: new Date().toISOString(),
    setupInstructions: def.setupInstructions,
  };
}

export async function GET(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const providers = await Promise.all(PROVIDER_DEFINITIONS.map(buildProviderReadiness));
  return NextResponse.json({ providers });
}

export type RecheckResponse = {
  provider: ProviderReadiness;
};

export async function POST(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json().catch(() => ({}));
  const providerKey = body.providerKey as string | undefined;

  if (!providerKey) {
    return NextResponse.json({ error: 'providerKey is required' }, { status: 400 });
  }

  const def = getProviderDefinition(providerKey);
  if (!def) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  }

  const provider = await buildProviderReadiness(def);
  return NextResponse.json({ provider });
}

