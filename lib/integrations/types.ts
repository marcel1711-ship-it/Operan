// Generic Integration Framework Types
// Provider-neutral, category-aware. Payments is one category among many.

export type IntegrationCategory =
  | 'payments'
  | 'calendar'
  | 'messaging'
  | 'crm'
  | 'accounting'
  | string; // allow future categories without type changes

export type ConnectionStatus =
  | 'not_configured'
  | 'connecting'
  | 'connected'
  | 'requires_action'
  | 'disconnected'
  | 'error';

export type WebhookStatus = 'not_configured' | 'active' | 'failing' | 'disabled';

export type IntegrationEnvironment = 'test' | 'live';

// What's stored in the `capabilities` JSONB column
export type IntegrationCapabilities = {
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  requirements_pending?: string[];
  default_currency?: string;
  [key: string]: unknown;
};

export type PlatformIntegration = {
  id: string;
  category: IntegrationCategory;
  provider: string;
  environment: IntegrationEnvironment;
  connection_status: ConnectionStatus;
  external_account_id: string | null;
  capabilities: IntegrationCapabilities;
  webhook_status: WebhookStatus;
  webhook_last_event_at: string | null;
  metadata: Record<string, unknown>;
  connected_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantIntegration = {
  id: string;
  tenant_id: string;
  category: IntegrationCategory;
  provider: string;
  environment: IntegrationEnvironment;
  connection_status: ConnectionStatus;
  external_account_id: string | null;
  capabilities: IntegrationCapabilities;
  is_default: boolean;
  enabled: boolean;
  metadata: Record<string, unknown>;
  connected_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CatalogEntry = {
  id: string;
  category: IntegrationCategory;
  provider: string;
  display_name: string;
  description: string | null;
  icon: string;
  is_active: boolean;
  config_schema: Record<string, unknown>;
  sort_order: number;
};

// ---- Adapter interface (implemented per provider) ----

export type CreateConnectionResult = {
  external_account_id: string | null;
  onboarding_url: string | null;
  connection_status: ConnectionStatus;
  error: string | null;
};

export type ConnectionStatusResult = {
  connection_status: ConnectionStatus;
  capabilities: IntegrationCapabilities;
  external_account_id: string | null;
  onboarding_url: string | null;
  error: string | null;
};

export type CheckoutResult = {
  checkout_url: string | null;
  checkout_session_id: string | null;
  client_secret: string | null;
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed';
  error: string | null;
};

export type CreateCheckoutParams = {
  tenant_id: string;
  listing_id: string;
  reservation_id: string;
  amount: number;
  currency: string;
  description: string;
  customer_email: string | null;
  customer_name: string;
  success_url: string;
  cancel_url: string;
  platform_fee_amount?: number;
  metadata?: Record<string, string>;
};

export interface IntegrationAdapter {
  readonly category: IntegrationCategory;
  readonly provider: string;

  createConnection(params: {
    tenant_id: string;
    environment: IntegrationEnvironment;
    country: string;
    email?: string;
  }): Promise<CreateConnectionResult>;

  continueOnboarding(params: {
    external_account_id: string;
    return_url: string;
  }): Promise<{ onboarding_url: string | null; error: string | null }>;

  getConnectionStatus(params: {
    external_account_id: string;
  }): Promise<ConnectionStatusResult>;

  // Category-specific operations are optional; adapters that don't support
  // a given operation return a clear "not supported" error.
  performAction?(action: string, params: Record<string, unknown>): Promise<{ data: unknown; error: string | null }>;
}

export type RetrieveCheckoutResult = {
  status: 'open' | 'complete' | 'expired' | 'paid' | 'unpaid';
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  payment_intent_id: string | null;
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string>;
  error: string | null;
};

export type ParseWebhookEventResult = {
  event_id: string;
  event_type: string;
  data: Record<string, unknown>;
  raw_event: unknown;
  error: string | null;
};

// Subset for payment-capable adapters
export interface PaymentAdapter extends IntegrationAdapter {
  createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>;
  retrieveCheckout(params: { checkout_session_id: string }): Promise<RetrieveCheckoutResult>;
  getPaymentStatus(params: { external_payment_id: string }): Promise<{
    status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
    amount_paid: number;
    amount_refunded: number;
    currency: string;
    external_payment_id: string | null;
    error: string | null;
  }>;
  refundPayment(params: { external_payment_id: string; amount?: number; reason?: string }): Promise<{
    refund_id: string | null;
    amount_refunded: number;
    status: 'succeeded' | 'failed' | 'pending';
    error: string | null;
  }>;
  verifyWebhook(params: { raw_body: string; signature: string; headers: Record<string, string> }): Promise<{
    verified: boolean;
    event_type: string | null;
    payment_id: string | null;
    amount: number | null;
    currency: string | null;
    metadata: Record<string, string>;
    error: string | null;
  }>;
  parseWebhookEvent(params: { raw_event: unknown }): Promise<ParseWebhookEventResult>;
  disconnect(params: { external_account_id: string }): Promise<{ success: boolean; error: string | null }>;
}
