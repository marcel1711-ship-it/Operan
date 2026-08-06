import { registerAdapter } from './registry';
import { StripeAdapter } from './adapters/stripe-adapter';

// Register all known providers. To add a new integration:
// 1. Create lib/integrations/adapters/<provider>-adapter.ts
// 2. Import and register it here
// 3. Add a catalog entry in the integration_catalog table
registerAdapter('payments', 'stripe', () => new StripeAdapter());

export { getAdapter, getAvailableProviders, getAvailableCategories, registerAdapter } from './registry';
export type {
  IntegrationCategory,
  ConnectionStatus,
  WebhookStatus,
  IntegrationEnvironment,
  IntegrationCapabilities,
  PlatformIntegration,
  TenantIntegration,
  CatalogEntry,
  IntegrationAdapter,
  PaymentAdapter,
  CreateConnectionResult,
  ConnectionStatusResult,
  CheckoutResult,
  CreateCheckoutParams,
} from './types';
