import type {
  PaymentAdapter,
  IntegrationEnvironment,
  CreateConnectionResult,
  ConnectionStatusResult,
  CheckoutResult,
  CreateCheckoutParams,
  RetrieveCheckoutResult,
  ParseWebhookEventResult,
} from '../types';
import {
  getStripeClientAsync,
  getStripeClient,
  isStripeConfigured,
  getStripeEnvironment,
  getAppBaseUrl,
} from '../stripe-server';
import type { Stripe } from 'stripe';

const NOT_CONFIGURED = 'Stripe is not configured. Set STRIPE_SECRET_KEY in environment variables.';

export class StripeAdapter implements PaymentAdapter {
  readonly category = 'payments' as const;
  readonly provider = 'stripe';

  private getClient(): Stripe | null {
    return getStripeClient();
  }

  private async getClientAsync(): Promise<Stripe | null> {
    return await getStripeClientAsync();
  }

  async createConnection(params: {
    tenant_id: string;
    environment: IntegrationEnvironment;
    country: string;
    email?: string;
  }): Promise<CreateConnectionResult> {
    const client = await this.getClientAsync();
    if (!client) {
      return {
        external_account_id: null,
        onboarding_url: null,
        connection_status: 'not_configured',
        error: NOT_CONFIGURED,
      };
    }

    try {
      const account = await client.accounts.create({
        type: 'express',
        country: params.country || 'US',
        email: params.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          tenant_id: params.tenant_id,
          platform: 'charter_booking',
        },
      });

      const baseUrl = getAppBaseUrl();
      const accountLink = await client.accountLinks.create({
        account: account.id,
        refresh_url: `${baseUrl}/api/stripe-onboarding/return?status=refresh`,
        return_url: `${baseUrl}/api/stripe-onboarding/return?status=success`,
        type: 'account_onboarding',
      });

      return {
        external_account_id: account.id,
        onboarding_url: accountLink.url,
        connection_status: 'connecting',
        error: null,
      };
    } catch (err) {
      return {
        external_account_id: null,
        onboarding_url: null,
        connection_status: 'error',
        error: err instanceof Error ? err.message : 'Failed to create Stripe account',
      };
    }
  }

  async continueOnboarding(params: {
    external_account_id: string;
    return_url: string;
  }): Promise<{ onboarding_url: string | null; error: string | null }> {
    const client = await this.getClientAsync();
    if (!client) return { onboarding_url: null, error: NOT_CONFIGURED };

    try {
      const accountLink = await client.accountLinks.create({
        account: params.external_account_id,
        refresh_url: params.return_url,
        return_url: params.return_url,
        type: 'account_onboarding',
      });

      return { onboarding_url: accountLink.url, error: null };
    } catch (err) {
      return {
        onboarding_url: null,
        error: err instanceof Error ? err.message : 'Failed to create onboarding link',
      };
    }
  }

  async getConnectionStatus(params: {
    external_account_id: string;
  }): Promise<ConnectionStatusResult> {
    const client = await this.getClientAsync();
    if (!client) {
      return {
        connection_status: 'not_configured',
        capabilities: {},
        external_account_id: null,
        onboarding_url: null,
        error: NOT_CONFIGURED,
      };
    }

    try {
      const account = await client.accounts.retrieve(params.external_account_id);

      const requirementsPending: string[] = [];
      if (account.requirements?.currently_due) {
        requirementsPending.push(...account.requirements.currently_due);
      }
      if (account.requirements?.past_due) {
        requirementsPending.push(...account.requirements.past_due);
      }

      const isReady =
        account.charges_enabled === true &&
        account.details_submitted === true &&
        requirementsPending.length === 0;

      return {
        connection_status: isReady ? 'connected' : 'requires_action',
        capabilities: {
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          requirements_pending: requirementsPending,
          default_currency: account.default_currency?.toUpperCase() || 'USD',
          details_submitted: account.details_submitted,
        },
        external_account_id: account.id,
        onboarding_url: null,
        error: null,
      };
    } catch (err) {
      return {
        connection_status: 'error',
        capabilities: {},
        external_account_id: params.external_account_id,
        onboarding_url: null,
        error: err instanceof Error ? err.message : 'Failed to retrieve account status',
      };
    }
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const client = await this.getClientAsync();
    if (!client) {
      return {
        checkout_url: null,
        checkout_session_id: null,
        client_secret: null,
        status: 'failed',
        error: NOT_CONFIGURED,
      };
    }

    try {
      const session = await client.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: params.currency.toLowerCase(),
                product_data: {
                  name: params.description || 'Booking Deposit',
                },
                unit_amount: Math.round(params.amount * 100),
              },
            },
          ],
          success_url: params.success_url,
          cancel_url: params.cancel_url,
          metadata: {
            reservation_id: params.reservation_id,
            tenant_id: params.tenant_id,
            listing_id: params.listing_id,
            booking_reference: params.metadata?.booking_reference || '',
            payment_type: params.metadata?.payment_type || 'deposit',
            internal_payment_id: params.metadata?.internal_payment_id || '',
            ...params.metadata,
          },
          payment_intent_data: {
            metadata: {
              reservation_id: params.reservation_id,
              tenant_id: params.tenant_id,
              booking_reference: params.metadata?.booking_reference || '',
              internal_payment_id: params.metadata?.internal_payment_id || '',
            },
            ...(params.platform_fee_amount && params.platform_fee_amount > 0
              ? {
                  application_fee_amount: Math.round(params.platform_fee_amount * 100),
                }
              : {}),
          },
        },
        {
          stripeAccount: params.metadata?.stripe_account_id || undefined,
        }
      );

      return {
        checkout_url: session.url,
        checkout_session_id: session.id,
        client_secret: null,
        status: 'pending',
        error: null,
      };
    } catch (err) {
      return {
        checkout_url: null,
        checkout_session_id: null,
        client_secret: null,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Failed to create checkout session',
      };
    }
  }

  async retrieveCheckout(params: { checkout_session_id: string }): Promise<RetrieveCheckoutResult> {
    const client = await this.getClientAsync();
    if (!client) {
      return {
        status: 'expired',
        payment_status: 'unpaid',
        payment_intent_id: null,
        amount_total: null,
        currency: null,
        metadata: {},
        error: NOT_CONFIGURED,
      };
    }

    try {
      const session = await client.checkout.sessions.retrieve(params.checkout_session_id);

      return {
        status: session.status as 'open' | 'complete' | 'expired',
        payment_status: session.payment_status as 'paid' | 'unpaid' | 'no_payment_required',
        payment_intent_id:
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
        amount_total: session.amount_total ? session.amount_total / 100 : null,
        currency: session.currency?.toUpperCase() || null,
        metadata: (session.metadata || {}) as Record<string, string>,
        error: null,
      };
    } catch (err) {
      return {
        status: 'expired',
        payment_status: 'unpaid',
        payment_intent_id: null,
        amount_total: null,
        currency: null,
        metadata: {},
        error: err instanceof Error ? err.message : 'Failed to retrieve checkout session',
      };
    }
  }

  async getPaymentStatus(params: { external_payment_id: string }): Promise<{
    status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
    amount_paid: number;
    amount_refunded: number;
    currency: string;
    external_payment_id: string | null;
    error: string | null;
  }> {
    const client = await this.getClientAsync();
    if (!client) {
      return {
        status: 'failed',
        amount_paid: 0,
        amount_refunded: 0,
        currency: 'USD',
        external_payment_id: null,
        error: NOT_CONFIGURED,
      };
    }

    try {
      const pi = await client.paymentIntents.retrieve(params.external_payment_id);

      let status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
      if (pi.status === 'succeeded') {
        const charges = pi.latest_charge;
        let chargeObj: Stripe.Charge | null = null;
        if (typeof charges === 'string') {
          chargeObj = await client.charges.retrieve(charges);
        } else if (charges) {
          chargeObj = charges as Stripe.Charge;
        }
        if (chargeObj?.amount_refunded && chargeObj.amount_refunded > 0) {
          status = chargeObj.amount_refunded >= (chargeObj.amount || 0) ? 'refunded' : 'partially_refunded';
        } else {
          status = 'succeeded';
        }
      } else if (pi.status === 'processing') {
        status = 'processing';
      } else if (pi.status === 'requires_payment_method' || pi.status === 'canceled') {
        status = 'failed';
      } else {
        status = 'pending';
      }

      const chargeAmount = typeof pi.latest_charge === 'string'
        ? (await client.charges.retrieve(pi.latest_charge))
        : (pi.latest_charge as Stripe.Charge | null);

      return {
        status,
        amount_paid: (pi.amount_received || 0) / 100,
        amount_refunded: (chargeAmount?.amount_refunded || 0) / 100,
        currency: pi.currency?.toUpperCase() || 'USD',
        external_payment_id: pi.id,
        error: null,
      };
    } catch (err) {
      return {
        status: 'failed',
        amount_paid: 0,
        amount_refunded: 0,
        currency: 'USD',
        external_payment_id: null,
        error: err instanceof Error ? err.message : 'Failed to retrieve payment status',
      };
    }
  }

  async refundPayment(params: {
    external_payment_id: string;
    amount?: number;
    reason?: string;
  }): Promise<{
    refund_id: string | null;
    amount_refunded: number;
    status: 'succeeded' | 'failed' | 'pending';
    error: string | null;
  }> {
    const client = await this.getClientAsync();
    if (!client) {
      return { refund_id: null, amount_refunded: 0, status: 'failed', error: NOT_CONFIGURED };
    }

    try {
      const refund = await client.refunds.create({
        payment_intent: params.external_payment_id,
        amount: params.amount ? Math.round(params.amount * 100) : undefined,
        reason: (params.reason as Stripe.RefundCreateParams.Reason) || 'requested_by_customer',
      });

      return {
        refund_id: refund.id,
        amount_refunded: refund.amount / 100,
        status: refund.status === 'succeeded' ? 'succeeded' : refund.status === 'pending' ? 'pending' : 'failed',
        error: null,
      };
    } catch (err) {
      return {
        refund_id: null,
        amount_refunded: 0,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Failed to process refund',
      };
    }
  }

  async verifyWebhook(params: {
    raw_body: string;
    signature: string;
    headers: Record<string, string>;
  }): Promise<{
    verified: boolean;
    event_type: string | null;
    payment_id: string | null;
    amount: number | null;
    currency: string | null;
    metadata: Record<string, string>;
    error: string | null;
  }> {
    const client = await this.getClientAsync();
    const { getStripeWebhookSecretAsync } = await import('../stripe-server');
    const webhookSecret = await getStripeWebhookSecretAsync();

    if (!client || !webhookSecret) {
      return {
        verified: false,
        event_type: null,
        payment_id: null,
        amount: null,
        currency: null,
        metadata: {},
        error: NOT_CONFIGURED,
      };
    }

    try {
      const event = client.webhooks.constructEvent(
        params.raw_body,
        params.signature,
        webhookSecret
      );

      return {
        verified: true,
        event_type: event.type,
        payment_id: null,
        amount: null,
        currency: null,
        metadata: {},
        error: null,
      };
    } catch (err) {
      return {
        verified: false,
        event_type: null,
        payment_id: null,
        amount: null,
        currency: null,
        metadata: {},
        error: err instanceof Error ? err.message : 'Webhook verification failed',
      };
    }
  }

  async parseWebhookEvent(params: { raw_event: unknown }): Promise<ParseWebhookEventResult> {
    try {
      const event = params.raw_event as Stripe.Event;
      return {
        event_id: event.id,
        event_type: event.type,
        data: (event.data.object as unknown as Record<string, unknown>) || {},
        raw_event: event,
        error: null,
      };
    } catch (err) {
      return {
        event_id: '',
        event_type: '',
        data: {},
        raw_event: null,
        error: err instanceof Error ? err.message : 'Failed to parse event',
      };
    }
  }

  async disconnect(params: {
    external_account_id: string;
  }): Promise<{ success: boolean; error: string | null }> {
    const client = await this.getClientAsync();
    if (!client) return { success: false, error: NOT_CONFIGURED };

    try {
      await client.accounts.del(params.external_account_id);
      return { success: true, error: null };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to disconnect account',
      };
    }
  }
}
