import { supabaseAdmin } from '@/lib/supabase-server';
import { getAdapter } from '@/lib/integrations';
import type { PaymentAdapter, CheckoutResult, CreateCheckoutParams } from '@/lib/integrations/types';
import { isStripeConfigured, getStripeEnvironment } from '@/lib/integrations/stripe-server';

export type CreateCheckoutRequest = {
  reservation_id: string;
  tenant_id: string;
  booking_reference: string;
  success_url: string;
  cancel_url: string;
};

export type CheckoutResponse = {
  checkout_url: string | null;
  checkout_session_id: string | null;
  payment_id: string | null;
  status: 'pending' | 'failed';
  error: string | null;
};

export async function createBookingCheckout(
  req: CreateCheckoutRequest
): Promise<CheckoutResponse> {
  // 1. Resolve reservation
  const { data: reservation, error: resError } = await supabaseAdmin
    .from('reservations')
    .select('*')
    .eq('id', req.reservation_id)
    .eq('tenant_id', req.tenant_id)
    .maybeSingle();

  if (resError || !reservation) {
    return { checkout_url: null, checkout_session_id: null, payment_id: null, status: 'failed', error: 'Reservation not found' };
  }

  // 2. Validate reservation status
  if (reservation.booking_status !== 'awaiting_payment') {
    return { checkout_url: null, checkout_session_id: null, payment_id: null, status: 'failed', error: 'Reservation is not awaiting payment' };
  }

  // 3. Validate hold hasn't expired
  if (reservation.expires_at && new Date(reservation.expires_at) < new Date()) {
    return { checkout_url: null, checkout_session_id: null, payment_id: null, status: 'failed', error: 'Booking hold has expired' };
  }

  // 4. Resolve tenant's default active payment integration
  const { data: integration, error: intError } = await supabaseAdmin
    .from('tenant_integrations')
    .select('*')
    .eq('tenant_id', req.tenant_id)
    .eq('category', 'payments')
    .eq('is_default', true)
    .maybeSingle();

  if (intError || !integration) {
    return { checkout_url: null, checkout_session_id: null, payment_id: null, status: 'failed', error: 'No payment integration configured' };
  }

  // 5. Validate integration readiness
  const caps = integration.capabilities as Record<string, unknown>;
  const chargesEnabled = caps.charges_enabled === true;
  const isReady =
    integration.connection_status === 'connected' &&
    chargesEnabled &&
    integration.enabled === true;

  if (!isReady) {
    return { checkout_url: null, checkout_session_id: null, payment_id: null, status: 'failed', error: 'Payment integration is not ready. Complete Stripe onboarding first.' };
  }

  // 6. Determine payment type and amount from server-stored reservation data
  const listing = await supabaseAdmin
    .from('listings')
    .select('payment_mode, deposit_type, deposit_percentage, deposit_fixed_amount, currency')
    .eq('id', reservation.listing_id)
    .maybeSingle();

  if (listing.error || !listing.data) {
    return { checkout_url: null, checkout_session_id: null, payment_id: null, status: 'failed', error: 'Listing not found' };
  }

  const paymentMode = listing.data.payment_mode;
  if (paymentMode === 'request_only' || paymentMode === 'pay_at_location') {
    return { checkout_url: null, checkout_session_id: null, payment_id: null, status: 'failed', error: 'This listing does not require online payment' };
  }

  let amountDue: number;
  let paymentType: string;

  if (paymentMode === 'full_payment') {
    amountDue = Number(reservation.total_amount);
    paymentType = 'full_payment';
  } else {
    // Deposit
    if (listing.data.deposit_type === 'fixed') {
      amountDue = Number(listing.data.deposit_fixed_amount);
    } else {
      // Percentage
      amountDue = (Number(reservation.total_amount) * Number(listing.data.deposit_percentage)) / 100;
    }
    paymentType = 'deposit';
  }

  if (amountDue <= 0) {
    return { checkout_url: null, checkout_session_id: null, payment_id: null, status: 'failed', error: 'Amount due is zero' };
  }

  // 7. Resolve platform fee config
  let platformFeeAmount = 0;
  const { data: feeConfig } = await supabaseAdmin
    .from('platform_fee_config')
    .select('*')
    .maybeSingle();

  if (feeConfig && feeConfig.fee_type === 'percentage') {
    platformFeeAmount = (amountDue * Number(feeConfig.fee_percentage)) / 100;
  } else if (feeConfig && feeConfig.fee_type === 'fixed') {
    platformFeeAmount = Number(feeConfig.fee_fixed_amount);
  }

  // 8. Generate idempotency key
  const idempotencyKey = `checkout_${req.reservation_id}_${paymentType}_${Date.now()}`;

  // 9. Create internal pending payment record via RPC
  const { data: checkoutData, error: checkoutError } = await supabaseAdmin.rpc('create_booking_checkout', {
    p_reservation_id: req.reservation_id,
    p_integration_id: integration.id,
    p_provider: integration.provider,
    p_environment: integration.environment,
    p_payment_type: paymentType,
    p_amount: amountDue,
    p_currency: reservation.currency || 'USD',
    p_idempotency_key: idempotencyKey,
    p_platform_fee_amount: platformFeeAmount,
    p_metadata: {
      booking_reference: req.booking_reference,
      payment_type: paymentType,
    },
  });

  if (checkoutError || !checkoutData || checkoutData.error) {
    return {
      checkout_url: null,
      checkout_session_id: null,
      payment_id: checkoutData?.payment_id || null,
      status: 'failed',
      error: checkoutData?.error || checkoutError?.message || 'Failed to create payment record',
    };
  }

  const paymentId = checkoutData.payment_id;

  // 10. Call the payment adapter to create checkout
  const adapter = getAdapter('payments', integration.provider) as PaymentAdapter | null;
  if (!adapter || typeof adapter.createCheckout !== 'function') {
    return {
      checkout_url: null,
      checkout_session_id: null,
      payment_id: paymentId,
      status: 'failed',
      error: `Provider "${integration.provider}" does not support checkout`,
    };
  }

  const credentials = integration.credentials as Record<string, string> | null;
  const tenantSecretKey = credentials?.secret_key || undefined;

  const checkoutParams: CreateCheckoutParams = {
    tenant_id: req.tenant_id,
    listing_id: reservation.listing_id,
    reservation_id: req.reservation_id,
    amount: amountDue,
    currency: reservation.currency || 'USD',
    description: `${paymentType === 'full_payment' ? 'Full Payment' : 'Deposit'} — ${req.booking_reference}`,
    customer_email: null,
    customer_name: reservation.client_name || 'Customer',
    success_url: req.success_url,
    cancel_url: req.cancel_url,
    platform_fee_amount: platformFeeAmount > 0 ? platformFeeAmount : undefined,
    tenant_secret_key: tenantSecretKey,
    metadata: {
      booking_reference: req.booking_reference,
      payment_type: paymentType,
      internal_payment_id: paymentId,
      stripe_account_id: integration.external_account_id || undefined,
    },
  };

  const result: CheckoutResult = await adapter.createCheckout(checkoutParams);

  if (result.status === 'failed' || !result.checkout_url) {
    return {
      checkout_url: null,
      checkout_session_id: null,
      payment_id: paymentId,
      status: 'failed',
      error: result.error || 'Failed to create checkout session',
    };
  }

  // 11. Update payment record with checkout session ID
  await supabaseAdmin
    .from('payments')
    .update({
      provider_checkout_session_id: result.checkout_session_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId);

  return {
    checkout_url: result.checkout_url,
    checkout_session_id: result.checkout_session_id,
    payment_id: paymentId,
    status: 'pending',
    error: null,
  };
}

export async function getPaymentsForReservation(reservationId: string): Promise<
  Array<{
    id: string;
    payment_type: string;
    provider: string;
    environment: string;
    amount: number;
    currency: string;
    status: string;
    provider_payment_id: string | null;
    provider_charge_id: string | null;
    provider_refund_id: string | null;
    refunded_amount: number;
    failure_code: string | null;
    failure_reason: string | null;
    paid_at: string | null;
    failed_at: string | null;
    refunded_at: string | null;
    created_at: string;
  }>
> {
  const { data, error } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('reservation_id', reservationId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as any[];
}

export async function retryCheckout(req: CreateCheckoutRequest): Promise<CheckoutResponse> {
  // Check for existing pending/processing payment
  const { data: existing } = await supabaseAdmin
    .from('payments')
    .select('id, status')
    .eq('reservation_id', req.reservation_id)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Cancel the old one
    await supabaseAdmin
      .from('payments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  }

  return createBookingCheckout(req);
}

export function isPaymentSystemConfigured(): boolean {
  return isStripeConfigured();
}

export function getPaymentEnvironment(): 'test' | 'live' {
  return getStripeEnvironment();
}
