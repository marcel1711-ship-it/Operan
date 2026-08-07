import { NextRequest, NextResponse } from 'next/server';
import { createBookingCheckout } from '@/lib/services/payment-service';
import { getAppBaseUrl } from '@/lib/integrations/stripe-server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { reservation_id, tenant_id, booking_reference, access_token } = body;

    if (!reservation_id) {
      return NextResponse.json(
        { error: 'Missing reservation_id' },
        { status: 400 }
      );
    }

    let resolvedTenantId: string | null = null;
    let resolvedBookingReference: string | null = null;

    const authHeader = req.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const userClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: membership } = await userClient
          .from('tenant_users')
          .select('tenant_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (membership) {
          resolvedTenantId = membership.tenant_id;
          const { data: reservation } = await supabaseAdmin
            .from('reservations')
            .select('tenant_id, booking_reference')
            .eq('id', reservation_id)
            .maybeSingle();
          if (reservation && reservation.tenant_id === resolvedTenantId) {
            resolvedBookingReference = reservation.booking_reference;
          } else {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
          }
        }
      }
    }

    if (!resolvedTenantId && access_token && booking_reference) {
      const { data: reservation } = await supabaseAdmin
        .from('reservations')
        .select('id, tenant_id, booking_reference')
        .eq('id', reservation_id)
        .eq('booking_reference', booking_reference)
        .maybeSingle();

      if (!reservation) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      const crypto = await import('crypto');
      const tokenHash = crypto.createHash('sha256').update(access_token).digest('hex');

      const { data: matchedToken } = await supabaseAdmin
        .from('booking_access_tokens')
        .select('id, expires_at')
        .eq('reservation_id', reservation.id)
        .eq('token_hash', tokenHash)
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!matchedToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      resolvedTenantId = reservation.tenant_id;
      resolvedBookingReference = reservation.booking_reference;
    }

    if (!resolvedTenantId || !resolvedBookingReference) {
      return NextResponse.json(
        { error: 'Authorization required. Provide either an authenticated session or a valid access token.' },
        { status: 401 }
      );
    }

    const baseUrl = getAppBaseUrl();
    const successUrl = `${baseUrl}/booking/${resolvedBookingReference}/payment/success?token=${access_token || ''}`;
    const cancelUrl = `${baseUrl}/booking/${resolvedBookingReference}/payment/cancelled?token=${access_token || ''}`;

    const result = await createBookingCheckout({
      reservation_id,
      tenant_id: resolvedTenantId,
      booking_reference: resolvedBookingReference,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (result.status === 'failed' || !result.checkout_url) {
      return NextResponse.json(
        { error: result.error || 'Failed to create checkout' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      checkout_url: result.checkout_url,
      checkout_session_id: result.checkout_session_id,
      payment_id: result.payment_id,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
