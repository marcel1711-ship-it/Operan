import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getAppBaseUrl } from '@/lib/integrations/stripe-server';
import { resolveCredential } from '@/lib/integrations/credential-resolver';
import { verifyOAuthState } from '@/lib/integrations/crypto';

export async function GET(req: NextRequest) {
  const baseUrl = getAppBaseUrl();
  const code = req.nextUrl.searchParams.get('code');
  const stateParam = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');
  const errorDescription = req.nextUrl.searchParams.get('error_description');

  if (error) {
    console.error('[stripe-oauth-callback] Error:', error, errorDescription);
    return NextResponse.redirect(`${baseUrl}/integrations?stripe_status=error`);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${baseUrl}/integrations?stripe_status=error`);
  }

  const { tenantId, valid } = verifyOAuthState(stateParam);
  if (!valid || !tenantId) {
    console.error('[stripe-oauth-callback] Invalid or expired OAuth state');
    return NextResponse.redirect(`${baseUrl}/integrations?stripe_status=error`);
  }

  try {
    // Get the platform's Stripe secret key to exchange the code
    const secretKey = await resolveCredential('stripe', 'STRIPE_SECRET_KEY', 'test') ||
                      await resolveCredential('stripe', 'STRIPE_SECRET_KEY', 'production') ||
                      process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      console.error('[stripe-oauth-callback] No platform secret key to exchange OAuth code');
      return NextResponse.redirect(`${baseUrl}/integrations?stripe_status=error`);
    }

    // Exchange the authorization code for access token
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stripe = require('stripe');
    const stripe = new Stripe(secretKey, { apiVersion: '2025-08-27.basil' as string });

    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    });

    const {
      access_token,
      stripe_user_id,
      stripe_publishable_key,
      scope,
      livemode,
    } = response;

    if (!access_token || !stripe_user_id) {
      console.error('[stripe-oauth-callback] Missing tokens in response');
      return NextResponse.redirect(`${baseUrl}/integrations?stripe_status=error`);
    }

    // Verify we can use the token
    const connectedStripe = new Stripe(access_token, { apiVersion: '2025-08-27.basil' as string });
    const account = await connectedStripe.accounts.retrieve(stripe_user_id);

    const environment = livemode ? 'live' : 'test';
    const credentials = {
      access_token,
      stripe_user_id,
      stripe_publishable_key: stripe_publishable_key || null,
      scope: scope || 'read_write',
      livemode: !!livemode,
    };

    const capabilities = {
      charges_enabled: account.charges_enabled ?? true,
      payouts_enabled: account.payouts_enabled ?? true,
      details_submitted: account.details_submitted ?? true,
      default_currency: (account.default_currency || 'usd').toUpperCase(),
      requirements_pending: [
        ...(account.requirements?.currently_due || []),
        ...(account.requirements?.past_due || []),
      ],
      business_name: account.business_profile?.name || account.settings?.dashboard?.display_name || null,
    };

    const hasRequirements = capabilities.requirements_pending.length > 0;
    const connectionStatus = hasRequirements ? 'requires_action' : 'connected';

    // Upsert tenant integration
    const { data: existing } = await supabaseAdmin
      .from('tenant_integrations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('category', 'payments')
      .eq('provider', 'stripe')
      .maybeSingle();

    const payload = {
      credentials,
      environment,
      connection_status: connectionStatus,
      external_account_id: stripe_user_id,
      enabled: connectionStatus === 'connected',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      capabilities,
    };

    if (existing) {
      await supabaseAdmin.from('tenant_integrations').update(payload).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('tenant_integrations').insert({
        tenant_id: tenantId,
        category: 'payments',
        provider: 'stripe',
        is_default: true,
        ...payload,
      });
    }

    return NextResponse.redirect(`${baseUrl}/integrations?stripe_status=connected`);
  } catch (err) {
    console.error('[stripe-oauth-callback] Error exchanging code:', err);
    return NextResponse.redirect(`${baseUrl}/integrations?stripe_status=error`);
  }
}
