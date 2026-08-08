import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getStripeClientAsync, getStripeWebhookSecretAsync } from '@/lib/integrations/stripe-server';
import type { Stripe } from 'stripe';

async function verifyWebhookEvent(
  body: string,
  signature: string
): Promise<{ event: Stripe.Event; client: Stripe } | null> {
  const StripeLib = require('stripe');

  const platformClient = await getStripeClientAsync();
  const platformSecret = await getStripeWebhookSecretAsync();
  if (platformClient && platformSecret) {
    try {
      const event = platformClient.webhooks.constructEvent(body, signature, platformSecret);
      return { event, client: platformClient };
    } catch {
      // Platform secret didn't match — try tenant secrets below
    }
  }

  const { data: tenantIntegrations } = await supabaseAdmin
    .from('tenant_integrations')
    .select('id, credentials, connection_mode')
    .eq('category', 'payments')
    .eq('provider', 'stripe')
    .eq('enabled', true);

  if (tenantIntegrations) {
    for (const integration of tenantIntegrations) {
      const creds = integration.credentials as Record<string, string> | null;
      const whSecret = creds?.webhook_secret;
      const secretKey = creds?.secret_key;
      if (!whSecret || !whSecret.startsWith('whsec_') || !secretKey) continue;

      try {
        const tenantClient = new StripeLib(secretKey, {
          apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
          typescript: true,
        });
        const event = tenantClient.webhooks.constructEvent(body, signature, whSecret);
        return { event, client: tenantClient };
      } catch {
        continue;
      }
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') || '';

  const result = await verifyWebhookEvent(body, signature);

  if (!result) {
    console.error('[stripe-webhook] No matching webhook secret found for signature');
    return NextResponse.json(
      { error: 'Invalid signature or webhook not configured' },
      { status: 400 }
    );
  }

  const { event, client } = result;

  const environment = event.livemode ? 'live' : 'test';

  const { data: existingEvent } = await supabaseAdmin
    .from('webhook_events')
    .select('id, processing_status')
    .eq('provider', 'stripe')
    .eq('environment', environment)
    .eq('provider_event_id', event.id)
    .maybeSingle();

  if (existingEvent) {
    return NextResponse.json({ received: true, already_processed: true });
  }

  const { data: webhookRecord } = await supabaseAdmin.rpc('record_webhook_event', {
    p_provider: 'stripe',
    p_environment: environment,
    p_provider_event_id: event.id,
    p_event_type: event.type,
    p_safe_metadata: {
      event_type: event.type,
      livemode: event.livemode,
      created: event.created,
    },
  });

  const webhookId = (webhookRecord as { webhook_id?: string })?.webhook_id;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(client, event);
        break;
      case 'checkout.session.expired':
        await handleCheckoutExpired(event);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event);
        break;
      case 'account.updated':
        await handleAccountUpdated(event);
        break;
      default:
        break;
    }

    await supabaseAdmin.rpc('mark_webhook_processed', {
      p_provider: 'stripe',
      p_environment: environment,
      p_provider_event_id: event.id,
      p_success: true,
    });

    return NextResponse.json({ received: true });
  } catch (err) {
    await supabaseAdmin.rpc('mark_webhook_processed', {
      p_provider: 'stripe',
      p_environment: environment,
      p_provider_event_id: event.id,
      p_success: false,
      p_error_message: err instanceof Error ? err.message : 'Processing failed',
    });

    return NextResponse.json(
      { error: 'Processing failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(client: Stripe, event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const metadata = session.metadata || {};
  const reservationId = metadata.reservation_id;

  if (!reservationId) return;

  if (session.payment_status === 'paid') {
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;

    await supabaseAdmin.rpc('confirm_payment_from_webhook', {
      p_provider: 'stripe',
      p_environment: event.livemode ? 'live' : 'test',
      p_provider_event_id: event.id,
      p_provider_checkout_id: session.id,
      p_provider_payment_id: paymentIntentId,
      p_provider_charge_id: null,
      p_amount: session.amount_total ? session.amount_total / 100 : null,
      p_currency: session.currency?.toUpperCase() || null,
      p_payment_type: metadata.payment_type || 'deposit',
      p_metadata: { session_id: session.id },
    });
  }
}

async function handleCheckoutExpired(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;

  await supabaseAdmin.rpc('expire_checkout_session', {
    p_provider_checkout_id: session.id,
    p_provider: 'stripe',
  });
}

async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const metadata = pi.metadata || {};
  const reservationId = metadata.reservation_id;

  if (!reservationId) return;

  let checkoutId: string | null = null;

  const { data: payment } = await supabaseAdmin
    .from('payments')
    .select('id, provider_checkout_session_id, status')
    .eq('reservation_id', reservationId)
    .eq('provider', 'stripe')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (payment?.provider_checkout_session_id) {
    checkoutId = payment.provider_checkout_session_id;
  }

  if (checkoutId) {
    await supabaseAdmin.rpc('confirm_payment_from_webhook', {
      p_provider: 'stripe',
      p_environment: event.livemode ? 'live' : 'test',
      p_provider_event_id: event.id,
      p_provider_checkout_id: checkoutId,
      p_provider_payment_id: pi.id,
      p_provider_charge_id: typeof pi.latest_charge === 'string' ? pi.latest_charge : null,
      p_amount: pi.amount_received ? pi.amount_received / 100 : null,
      p_currency: pi.currency?.toUpperCase() || null,
      p_payment_type: metadata.payment_type || 'deposit',
      p_metadata: { payment_intent_id: pi.id },
    });
  }
}

async function handlePaymentFailed(event: Stripe.Event) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const metadata = pi.metadata || {};
  const reservationId = metadata.reservation_id;

  if (!reservationId) return;

  const { data: payment } = await supabaseAdmin
    .from('payments')
    .select('id, provider_checkout_session_id')
    .eq('reservation_id', reservationId)
    .eq('provider', 'stripe')
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) return;

  const failureCode = pi.last_payment_error?.code || null;
  const failureReason = pi.last_payment_error?.message || 'Payment failed';

  await supabaseAdmin.rpc('record_payment_failure', {
    p_provider: 'stripe',
    p_environment: event.livemode ? 'live' : 'test',
    p_provider_event_id: event.id,
    p_provider_checkout_id: payment.provider_checkout_session_id,
    p_provider_payment_id: pi.id,
    p_failure_code: failureCode,
    p_failure_reason: failureReason,
    p_metadata: { payment_intent_id: pi.id },
  });
}

async function handleChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const metadata = charge.metadata || {};
  const reservationId = metadata.reservation_id;

  if (!reservationId) return;

  const { data: payment } = await supabaseAdmin
    .from('payments')
    .select('id, tenant_id')
    .eq('reservation_id', reservationId)
    .eq('provider', 'stripe')
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment) return;

  const refundAmount = charge.amount_refunded ? charge.amount_refunded / 100 : 0;

  await supabaseAdmin.rpc('process_refund', {
    p_payment_id: payment.id,
    p_refunded_amount: refundAmount,
    p_reason: 'stripe_webhook_refund',
    p_actor_name: 'system',
    p_provider_refund_id: charge.refunds?.data[0]?.id || null,
  });
}

async function handleAccountUpdated(event: Stripe.Event) {
  const account = event.data.object as Stripe.Account;

  const { data: integration } = await supabaseAdmin
    .from('tenant_integrations')
    .select('id, tenant_id')
    .eq('category', 'payments')
    .eq('provider', 'stripe')
    .eq('external_account_id', account.id)
    .maybeSingle();

  if (!integration) return;

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

  await supabaseAdmin
    .from('tenant_integrations')
    .update({
      connection_status: isReady ? 'connected' : 'requires_action',
      capabilities: {
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        requirements_pending: requirementsPending,
        default_currency: account.default_currency?.toUpperCase() || 'USD',
        details_submitted: account.details_submitted,
      },
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', integration.id);

  if (!isReady && requirementsPending.length > 0) {
    await supabaseAdmin.from('notifications').insert({
      tenant_id: integration.tenant_id,
      type: 'stripe_action_required',
      title: 'Stripe Action Required',
      message: `Your Stripe account requires attention: ${requirementsPending.length} item(s) pending. Please complete your Stripe onboarding.`,
      entity_type: 'integration',
      entity_id: integration.id,
      priority: 'high',
    });
  }
}
