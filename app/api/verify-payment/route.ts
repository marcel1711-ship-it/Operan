import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const { reservation_id, booking_reference, access_token } = await req.json();

    if (!reservation_id || !booking_reference || !access_token) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(access_token).digest('hex');

    const { data: token } = await supabaseAdmin
      .from('booking_access_tokens')
      .select('id')
      .eq('reservation_id', reservation_id)
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: reservation } = await supabaseAdmin
      .from('reservations')
      .select('id, tenant_id, booking_status, payment_status')
      .eq('id', reservation_id)
      .eq('booking_reference', booking_reference)
      .maybeSingle();

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    if (reservation.payment_status === 'deposit_paid' || reservation.payment_status === 'paid_in_full' || reservation.booking_status === 'confirmed') {
      return NextResponse.json({ verified: true, booking_status: reservation.booking_status, payment_status: reservation.payment_status });
    }

    const { data: payment } = await supabaseAdmin
      .from('payments')
      .select('id, provider_checkout_session_id, status, payment_type')
      .eq('reservation_id', reservation_id)
      .eq('provider', 'stripe')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment?.provider_checkout_session_id) {
      return NextResponse.json({ verified: false, reason: 'No checkout session found' });
    }

    const { data: integration } = await supabaseAdmin
      .from('tenant_integrations')
      .select('credentials')
      .eq('tenant_id', reservation.tenant_id)
      .eq('category', 'payments')
      .eq('provider', 'stripe')
      .eq('enabled', true)
      .maybeSingle();

    const creds = integration?.credentials as Record<string, string> | null;
    const secretKey = creds?.secret_key;

    if (!secretKey) {
      return NextResponse.json({ verified: false, reason: 'No Stripe credentials' });
    }

    const Stripe = require('stripe');
    const stripe = new Stripe(secretKey, { apiVersion: '2025-08-27.basil' as string });

    const session = await stripe.checkout.sessions.retrieve(payment.provider_checkout_session_id);

    if (session.payment_status === 'paid') {
      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;

      await supabaseAdmin.rpc('confirm_payment_from_webhook', {
        p_provider: 'stripe',
        p_environment: secretKey.startsWith('sk_live_') ? 'live' : 'test',
        p_provider_event_id: `verify_${payment.id}_${Date.now()}`,
        p_provider_checkout_id: session.id,
        p_provider_payment_id: paymentIntentId,
        p_provider_charge_id: null,
        p_amount: session.amount_total ? session.amount_total / 100 : null,
        p_currency: session.currency?.toUpperCase() || null,
        p_payment_type: payment.payment_type || 'deposit',
        p_metadata: { source: 'direct_verification', session_id: session.id },
      });

      return NextResponse.json({ verified: true, booking_status: 'confirmed', payment_status: 'deposit_paid' });
    }

    return NextResponse.json({ verified: false, stripe_status: session.payment_status });
  } catch (err) {
    console.error('[verify-payment] Error:', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
