// Provider definitions for the OPERAN Integration Center.
// Each provider is fully independent — no provider references another.
// This module is shared between server and client code and contains NO secrets.

export type ProviderStatus =
  | 'ready'
  | 'configuration_required'
  | 'degraded'
  | 'coming_soon'
  | 'disabled';

export type ConnectionMode =
  | 'platform_managed'
  | 'tenant_managed'
  | 'tenant_owned';

export type ConfigurationMode =
  | 'oauth'
  | 'connect_onboarding'
  | 'credentials_form'
  | 'internal_setup'
  | 'environment_setup'
  | 'coming_soon';

export type CredentialSpec = {
  env_var: string;
  label: string;
  purpose: string;
  classification: 'server_only' | 'browser_safe';
  required: boolean;
  where_to_obtain: string;
  where_to_configure: string;
  redeploy_required: boolean;
};

export type HealthCheckSpec = {
  label: string;
  hint: string;
};

export type CallbackUrlSpec = {
  label: string;
  path: string;
  description: string;
};

export type WebhookUrlSpec = {
  label: string;
  path: string;
  description: string;
  required_events: string[];
};

export type TenantCapabilitySpec = {
  label: string;
  description: string;
};

export type ProviderDefinition = {
  providerKey: string;
  displayName: string;
  category: string;
  description: string;
  connectionMode: ConnectionMode;
  platformConfigurationMode: ConfigurationMode;
  tenantConfigurationMode: ConfigurationMode;
  isComingSoon: boolean;
  credentials: CredentialSpec[];
  healthChecks: HealthCheckSpec[];
  callbackUrls: CallbackUrlSpec[];
  webhookUrls: WebhookUrlSpec[];
  tenantCapabilities: TenantCapabilitySpec[];
  setupInstructions: string[];
};

export const CATEGORY_LABELS: Record<string, string> = {
  payments: 'Payments',
  communication: 'Email Delivery',
  calendar: 'Calendar',
  automation: 'Automation & Developer',
  messaging: 'Messaging',
  accounting: 'Accounting',
};

export const CATEGORY_ORDER = [
  'payments',
  'communication',
  'calendar',
  'automation',
  'messaging',
  'accounting',
];

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  // ── Provider 1: Stripe Connect ──
  {
    providerKey: 'stripe',
    displayName: 'Stripe Connect',
    category: 'payments',
    description: 'Process tenant booking payments through Stripe Connect with platform-fee splitting.',
    connectionMode: 'tenant_managed',
    platformConfigurationMode: 'environment_setup',
    tenantConfigurationMode: 'connect_onboarding',
    isComingSoon: false,
    credentials: [
      {
        env_var: 'STRIPE_SECRET_KEY',
        label: 'Stripe Secret Key',
        purpose: 'Authenticates OPERAN\'s Stripe platform account for creating charges, managing Connect accounts, and processing refunds.',
        classification: 'server_only',
        required: true,
        where_to_obtain: 'Stripe Dashboard → Developers → API keys',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
      {
        env_var: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
        label: 'Stripe Publishable Key',
        purpose: 'Used by the browser to initialize Stripe.js for checkout and payment element rendering.',
        classification: 'browser_safe',
        required: true,
        where_to_obtain: 'Stripe Dashboard → Developers → API keys',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
      {
        env_var: 'STRIPE_WEBHOOK_SECRET',
        label: 'Stripe Webhook Signing Secret',
        purpose: 'Verifies that incoming webhook events are genuinely from Stripe.',
        classification: 'server_only',
        required: true,
        where_to_obtain: 'Stripe Dashboard → Developers → Webhooks → (your endpoint) → Signing secret',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
    ],
    healthChecks: [
      { label: 'Stripe API Key', hint: 'Set STRIPE_SECRET_KEY in environment variables' },
      { label: 'Webhook Secret', hint: 'Set STRIPE_WEBHOOK_SECRET in environment variables' },
      { label: 'Publishable Key', hint: 'Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in environment variables' },
      { label: 'Onboarding Route', hint: '/api/stripe-onboarding' },
      { label: 'Webhook Route', hint: '/api/stripe-webhook' },
    ],
    callbackUrls: [],
    webhookUrls: [
      {
        label: 'Stripe Webhook Endpoint',
        path: '/api/stripe-webhook',
        description: 'Receives payment, checkout, and Connect account events from Stripe.',
        required_events: [
          'checkout.session.completed',
          'checkout.session.expired',
          'payment_intent.succeeded',
          'payment_intent.payment_failed',
          'account.updated',
          'capability.updated',
        ],
      },
    ],
    tenantCapabilities: [
      { label: 'Connect Stripe Account', description: 'Tenants connect their own Stripe account via Stripe Connect onboarding.' },
      { label: 'Accept Payments', description: 'Process booking deposits and full payments with platform-fee splitting.' },
      { label: 'Issue Refunds', description: 'Refund charges directly from the OPERAN dashboard.' },
    ],
    setupInstructions: [
      'Create a Stripe account at dashboard.stripe.com if you don\'t have one.',
      'Navigate to Developers → API keys and copy your Secret key and Publishable key.',
      'Navigate to Developers → Webhooks and create a new endpoint pointing to your deployed webhook URL.',
      'Select the required events listed in the Webhook URLs section.',
      'Copy the signing secret from the webhook endpoint details.',
      'Add all three environment variables in Vercel and redeploy.',
      'Return to OPERAN and click Recheck Status to verify the connection.',
    ],
  },

  // ── Provider 2: Resend Email ──
  {
    providerKey: 'resend',
    displayName: 'Resend Email',
    category: 'communication',
    description: 'Platform-managed email delivery for booking confirmations, reminders, and notifications.',
    connectionMode: 'platform_managed',
    platformConfigurationMode: 'environment_setup',
    tenantConfigurationMode: 'internal_setup',
    isComingSoon: false,
    credentials: [
      {
        env_var: 'RESEND_API_KEY',
        label: 'Resend API Key',
        purpose: 'Authenticates OPERAN\'s Resend account for sending emails and managing domains.',
        classification: 'server_only',
        required: true,
        where_to_obtain: 'Resend Dashboard → API Keys → Create API Key',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
      {
        env_var: 'RESEND_WEBHOOK_SECRET',
        label: 'Resend Webhook Secret',
        purpose: 'Verifies that incoming email delivery webhook events are genuinely from Resend.',
        classification: 'server_only',
        required: false,
        where_to_obtain: 'Resend Dashboard → Webhooks → (your endpoint) → Webhook Secret',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
    ],
    healthChecks: [
      { label: 'Resend API Key', hint: 'Set RESEND_API_KEY in environment variables' },
      { label: 'Webhook Secret', hint: 'Set RESEND_WEBHOOK_SECRET for webhook signature verification' },
      { label: 'Webhook Route', hint: '/api/webhooks/resend' },
    ],
    callbackUrls: [],
    webhookUrls: [
      {
        label: 'Resend Webhook Endpoint',
        path: '/api/webhooks/resend',
        description: 'Receives email delivery status events (sent, delivered, bounced, failed) from Resend.',
        required_events: [
          'email.sent',
          'email.delivered',
          'email.bounced',
          'email.complained',
          'email.failed',
        ],
      },
    ],
    tenantCapabilities: [
      { label: 'Add Sending Domain', description: 'Tenants register and verify their own sending domain via DNS records.' },
      { label: 'Configure Sender', description: 'Set a verified sender email address for outgoing messages.' },
      { label: 'Send Test Email', description: 'Verify the email pipeline with a test send.' },
    ],
    setupInstructions: [
      'Create a Resend account at resend.com if you don\'t have one.',
      'Navigate to API Keys and create a new API key with full access.',
      'Navigate to Webhooks and create a new endpoint pointing to your deployed webhook URL.',
      'Select the required events listed in the Webhook URLs section.',
      'Copy the webhook secret from the webhook endpoint details.',
      'Add the API key and webhook secret as environment variables in Vercel and redeploy.',
      'Return to OPERAN and click Recheck Status to verify the connection.',
    ],
  },

  // ── Provider 3: Google Calendar ──
  {
    providerKey: 'google_calendar',
    displayName: 'Google Calendar',
    category: 'calendar',
    description: 'Two-way calendar sync: export bookings to Google Calendar and import external busy blocks.',
    connectionMode: 'tenant_managed',
    platformConfigurationMode: 'environment_setup',
    tenantConfigurationMode: 'oauth',
    isComingSoon: false,
    credentials: [
      {
        env_var: 'GOOGLE_CLIENT_ID',
        label: 'Google OAuth Client ID',
        purpose: 'Identifies the OPERAN OAuth application for Google Calendar API access.',
        classification: 'server_only',
        required: true,
        where_to_obtain: 'Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
      {
        env_var: 'GOOGLE_CLIENT_SECRET',
        label: 'Google OAuth Client Secret',
        purpose: 'Authenticates the OPERAN OAuth application during the token exchange flow.',
        classification: 'server_only',
        required: true,
        where_to_obtain: 'Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
      {
        env_var: 'INTEGRATION_ENCRYPTION_KEY',
        label: 'Integration Encryption Key',
        purpose: 'Encrypts tenant Google OAuth tokens at rest in the database.',
        classification: 'server_only',
        required: true,
        where_to_obtain: 'Generate a 32-byte hex string (e.g. openssl rand -hex 32)',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
    ],
    healthChecks: [
      { label: 'Google OAuth Client ID', hint: 'Set GOOGLE_CLIENT_ID in environment variables' },
      { label: 'Google OAuth Client Secret', hint: 'Set GOOGLE_CLIENT_SECRET in environment variables' },
      { label: 'Encryption Key', hint: 'Set INTEGRATION_ENCRYPTION_KEY for secure token storage' },
      { label: 'OAuth Callback Route', hint: '/api/integrations/google-calendar/callback' },
    ],
    callbackUrls: [
      {
        label: 'Google OAuth Redirect URI',
        path: '/api/integrations/google-calendar/callback',
        description: 'Register this exact URI in your Google Cloud Console OAuth 2.0 Client configuration. The full URL must match exactly.',
      },
    ],
    webhookUrls: [],
    tenantCapabilities: [
      { label: 'Authorize Google Account', description: 'Tenants connect their own Google account via OAuth.' },
      { label: 'Select Calendar', description: 'Choose which Google Calendar to sync bookings to.' },
      { label: 'Configure Sync', description: 'Control event templates, customer details, and busy-block import.' },
    ],
    setupInstructions: [
      'Go to console.cloud.google.com and create or select a project.',
      'Enable the Google Calendar API under APIs & Services → Library.',
      'Configure the OAuth consent screen with your app name and support email.',
      'Create OAuth 2.0 Client ID credentials (type: Web application).',
      'Add the exact Redirect URI listed in the Callback URLs section to the authorized redirect URIs.',
      'Copy the Client ID and Client Secret.',
      'Generate a 32-byte encryption key for token storage (e.g. openssl rand -hex 32).',
      'Add all three environment variables in Vercel and redeploy.',
      'Return to OPERAN and click Recheck Status to verify the connection.',
    ],
  },

  // ── Provider 4: iCal ──
  {
    providerKey: 'ical',
    displayName: 'iCal Feed',
    category: 'calendar',
    description: 'Export bookings as iCal feeds and import external iCal feeds for availability blocking.',
    connectionMode: 'tenant_managed',
    platformConfigurationMode: 'internal_setup',
    tenantConfigurationMode: 'internal_setup',
    isComingSoon: false,
    credentials: [],
    healthChecks: [
      { label: 'Export Endpoint', hint: '/ical/[token] route is deployed' },
      { label: 'Import Worker', hint: 'sync-ical-imports edge function is deployed' },
      { label: 'Feed Token Generation', hint: 'Token generation RPC is available' },
    ],
    callbackUrls: [],
    webhookUrls: [],
    tenantCapabilities: [
      { label: 'Generate Export Feed', description: 'Create a read-only iCal URL for external calendar apps.' },
      { label: 'Import External Feed', description: 'Subscribe to an external iCal URL to block availability.' },
      { label: 'Assign Listings', description: 'Map imported events to specific listings.' },
    ],
    setupInstructions: [
      'iCal requires no external platform credentials.',
      'The export endpoint and import worker are part of the OPERAN runtime.',
      'If health checks fail, ensure the latest deployment includes the iCal routes and edge functions.',
      'Click Recheck Status to verify runtime availability.',
    ],
  },

  // ── Provider 5: Outgoing Webhooks ──
  {
    providerKey: 'webhooks',
    displayName: 'Outgoing Webhooks',
    category: 'automation',
    description: 'Deliver event notifications to tenant-configured endpoints with HMAC signing and retry.',
    connectionMode: 'tenant_managed',
    platformConfigurationMode: 'internal_setup',
    tenantConfigurationMode: 'internal_setup',
    isComingSoon: false,
    credentials: [],
    healthChecks: [
      { label: 'Delivery Worker', hint: 'deliver-webhooks edge function is deployed' },
      { label: 'Outbox Processing', hint: 'process-outbox edge function is deployed' },
      { label: 'HMAC Signing', hint: 'Webhook secret rotation is available' },
      { label: 'Dead-Letter Handling', hint: 'Failed deliveries are tracked for retry' },
    ],
    callbackUrls: [],
    webhookUrls: [],
    tenantCapabilities: [
      { label: 'Create Endpoint', description: 'Register a URL to receive event notifications.' },
      { label: 'Select Events', description: 'Choose which event types trigger delivery.' },
      { label: 'Test Delivery', description: 'Send a test payload to verify connectivity.' },
      { label: 'View History', description: 'Inspect delivery attempts and response codes.' },
      { label: 'Rotate Secret', description: 'Generate a new HMAC signing secret.' },
    ],
    setupInstructions: [
      'Outgoing webhooks require no external platform credentials.',
      'The delivery and outbox workers are part of the OPERAN runtime.',
      'If health checks fail, ensure the latest deployment includes the webhook edge functions.',
      'Click Recheck Status to verify runtime availability.',
    ],
  },

  // ── Provider 6: API Access ──
  {
    providerKey: 'api_access',
    displayName: 'API Access',
    category: 'automation',
    description: 'Tenant API keys for programmatic access to reservations, customers, and listings.',
    connectionMode: 'tenant_managed',
    platformConfigurationMode: 'internal_setup',
    tenantConfigurationMode: 'internal_setup',
    isComingSoon: false,
    credentials: [],
    healthChecks: [
      { label: 'API Routes', hint: '/api/v1/* routes are deployed' },
      { label: 'Key Hashing', hint: 'API key authentication RPC is available' },
      { label: 'Rate Limiting', hint: 'Rate limiting is active on API routes' },
      { label: 'Tenant Isolation', hint: 'Tenant membership checks are enforced' },
    ],
    callbackUrls: [],
    webhookUrls: [],
    tenantCapabilities: [
      { label: 'Create API Key', description: 'Generate a new API key with selected scopes.' },
      { label: 'Revoke API Key', description: 'Permanently revoke an API key.' },
      { label: 'Assign Scopes', description: 'Choose which resources the key can access.' },
      { label: 'View Last Usage', description: 'See when and how the key was last used.' },
    ],
    setupInstructions: [
      'API Access requires no external platform credentials.',
      'The API routes and authentication RPCs are part of the OPERAN runtime.',
      'If health checks fail, ensure the latest deployment includes the /api/v1/* routes.',
      'Click Recheck Status to verify runtime availability.',
    ],
  },

  // ── Provider 7: Twilio SMS ──
  {
    providerKey: 'twilio',
    displayName: 'Twilio SMS',
    category: 'messaging',
    description: 'Send SMS notifications to customers via Twilio.',
    connectionMode: 'tenant_managed',
    platformConfigurationMode: 'environment_setup',
    tenantConfigurationMode: 'credentials_form',
    isComingSoon: false,
    credentials: [],
    healthChecks: [],
    callbackUrls: [],
    webhookUrls: [],
    tenantCapabilities: [
      { label: 'Configure Sender Number', description: 'Enter your Twilio phone number for outbound SMS.' },
      { label: 'Send SMS Notifications', description: 'Automated SMS for booking confirmations and reminders.' },
      { label: 'Test Connection', description: 'Verify your Twilio credentials are working.' },
    ],
    setupInstructions: [
      'Create a Twilio account at twilio.com if you don\'t have one.',
      'From the Console Dashboard, copy your Account SID and Auth Token.',
      'Go to Phone Numbers → Manage → Active Numbers and copy your Twilio phone number (or buy one).',
      'Enter your credentials in the configuration panel below and click Save & Connect.',
    ],
  },

  // ── Provider 8: WhatsApp (Meta Cloud API) ──
  {
    providerKey: 'meta_whatsapp',
    displayName: 'WhatsApp (Meta Cloud API)',
    category: 'messaging',
    description: 'Send WhatsApp messages to customers via the Meta WhatsApp Cloud API.',
    connectionMode: 'platform_managed',
    platformConfigurationMode: 'environment_setup',
    tenantConfigurationMode: 'coming_soon',
    isComingSoon: true,
    credentials: [
      {
        env_var: 'META_APP_ID',
        label: 'Meta App ID',
        purpose: 'Identifies the OPERAN Meta application for WhatsApp Cloud API access.',
        classification: 'server_only',
        required: true,
        where_to_obtain: 'Meta for Developers → My Apps → (your app) → App ID',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
      {
        env_var: 'META_APP_SECRET',
        label: 'Meta App Secret',
        purpose: 'Verifies webhook signatures from the Meta WhatsApp Cloud API.',
        classification: 'server_only',
        required: true,
        where_to_obtain: 'Meta for Developers → My Apps → (your app) → App Secret',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
      {
        env_var: 'WHATSAPP_VERIFY_TOKEN',
        label: 'WhatsApp Verify Token',
        purpose: 'Used during webhook subscription verification with Meta.',
        classification: 'server_only',
        required: true,
        where_to_obtain: 'Choose any secure string — you will enter it in the Meta webhook configuration.',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
    ],
    healthChecks: [
      { label: 'Meta App ID', hint: 'Set META_APP_ID in environment variables' },
      { label: 'Meta App Secret', hint: 'Set META_APP_SECRET in environment variables' },
      { label: 'Verify Token', hint: 'Set WHATSAPP_VERIFY_TOKEN in environment variables' },
    ],
    callbackUrls: [],
    webhookUrls: [],
    tenantCapabilities: [
      { label: 'Connect WhatsApp Business Account', description: 'Tenants link their WhatsApp Business number.' },
      { label: 'Send WhatsApp Messages', description: 'Automated WhatsApp notifications for bookings.' },
    ],
    setupInstructions: [
      'WhatsApp (Meta Cloud API) integration is currently in development.',
      'The backend adapter and tenant connection flow are not yet available.',
      'No configuration is required at this time.',
    ],
  },

  // ── Provider 9: QuickBooks Online ──
  {
    providerKey: 'quickbooks',
    displayName: 'QuickBooks Online',
    category: 'accounting',
    description: 'Sync booking revenue and customer data to QuickBooks Online.',
    connectionMode: 'tenant_managed',
    platformConfigurationMode: 'environment_setup',
    tenantConfigurationMode: 'coming_soon',
    isComingSoon: true,
    credentials: [
      {
        env_var: 'QUICKBOOKS_CLIENT_ID',
        label: 'QuickBooks Client ID',
        purpose: 'Identifies the OPERAN OAuth application for QuickBooks Online API access.',
        classification: 'server_only',
        required: true,
        where_to_obtain: 'Intuit Developer → My Apps → (your app) → Client ID',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
      {
        env_var: 'QUICKBOOKS_CLIENT_SECRET',
        label: 'QuickBooks Client Secret',
        purpose: 'Authenticates the OPERAN OAuth application during the token exchange flow.',
        classification: 'server_only',
        required: true,
        where_to_obtain: 'Intuit Developer → My Apps → (your app) → Client Secret',
        where_to_configure: 'Vercel → Project → Settings → Environment Variables',
        redeploy_required: true,
      },
    ],
    healthChecks: [
      { label: 'QuickBooks Client ID', hint: 'Set QUICKBOOKS_CLIENT_ID in environment variables' },
      { label: 'QuickBooks Client Secret', hint: 'Set QUICKBOOKS_CLIENT_SECRET in environment variables' },
    ],
    callbackUrls: [],
    webhookUrls: [],
    tenantCapabilities: [
      { label: 'Connect QuickBooks Company', description: 'Tenants authorize their QuickBooks Online company via OAuth.' },
      { label: 'Sync Revenue', description: 'Automatically sync booking payments to QuickBooks.' },
    ],
    setupInstructions: [
      'QuickBooks Online integration is currently in development.',
      'The backend OAuth flow and sync engine are not yet available.',
      'No configuration is required at this time.',
    ],
  },

  // ── Provider 10: Twilio WhatsApp ──
  {
    providerKey: 'twilio_whatsapp',
    displayName: 'WhatsApp (Twilio)',
    category: 'messaging',
    description: 'Send WhatsApp messages to customers via Twilio\'s WhatsApp Business API.',
    connectionMode: 'tenant_managed',
    platformConfigurationMode: 'environment_setup',
    tenantConfigurationMode: 'credentials_form',
    isComingSoon: false,
    credentials: [],
    healthChecks: [],
    callbackUrls: [],
    webhookUrls: [],
    tenantCapabilities: [
      { label: 'Configure WhatsApp Sender', description: 'Enter your Twilio WhatsApp sender number.' },
      { label: 'Send WhatsApp Messages', description: 'Automated WhatsApp notifications for bookings.' },
      { label: 'Test Connection', description: 'Verify your Twilio credentials are working.' },
    ],
    setupInstructions: [
      'Create a Twilio account at twilio.com if you don\'t have one.',
      'From the Console Dashboard, copy your Account SID and Auth Token.',
      'Go to Messaging → Try it out → Send a WhatsApp message to set up your WhatsApp Sandbox.',
      'For production, apply for a WhatsApp Business Profile in the Twilio console.',
      'Enter your credentials in the configuration panel below and click Save & Connect.',
    ],
  },
];

export function getProviderDefinition(providerKey: string): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find(p => p.providerKey === providerKey);
}
