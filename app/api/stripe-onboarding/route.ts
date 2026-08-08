import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { getAppBaseUrl } from '@/lib/integrations/stripe-server';
import { createOAuthState } from '@/lib/integrations/crypto';

// eslint-disable-next-line no-console
const log = (...args: unknown[]) => console.log('[stripe-onboarding]', ...args);

async function getStripeClientId(): Promise<string | null> {
  // Check env first, then vault
  if (process.env.STRIPE_CLIENT_ID) return process.env.STRIPE_CLIENT_ID;

  try {
    const { data } = await supabaseAdmin
      .from('platform_provider_secrets')
      .select('encrypted_value, encryption_iv, authentication_tag')
      .eq('provider_key', 'stripe')
      .eq('secret_name', 'STRIPE_CLIENT_ID')
      .eq('is_active', true)
      .maybeSingle();
    if (data) {
      const { decryptSecret } = await import('@/lib/integrations/platform-vault-crypto');
      return decryptSecret(
        data.encrypted_value as unknown as Buffer,
        data.encryption_iv as unknown as Buffer,
        data.authentication_tag as unknown as Buffer
      );
    }
  } catch { /* vault not available */ }

  return null;
}

async function authenticateRequest(req: NextRequest, body: { tenant_id?: string }) {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    log('No Bearer token');
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  log('getUser:', user?.id, user?.email, 'error:', userError?.message);
  if (!user) return null;

  if (!body.tenant_id) {
    log('No tenant_id in body');
    return null;
  }

  // Use supabaseAdmin to bypass RLS for membership check
  const { data: membership, error: memError } = await supabaseAdmin
    .from('tenant_users')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('tenant_id', body.tenant_id)
    .maybeSingle();

  log('membership check:', { membership, error: memError?.message, user_id: user.id, tenant_id: body.tenant_id });

  if (!membership) return null;
  return { user_id: user.id, tenant_id: body.tenant_id };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    const auth = await authenticateRequest(req, body);
    if (!auth) {
      return NextResponse.json({ error: 'Not authorized for this tenant' }, { status: 403 });
    }
    const { tenant_id } = auth;

    // --- OAuth flow: generate Stripe authorization URL ---
    if (action === 'connect') {
      const clientId = await getStripeClientId();
      if (!clientId) {
        return NextResponse.json({
          error: 'Stripe Connect is not configured. Set STRIPE_CLIENT_ID in your environment or platform settings.',
          code: 'no_client_id',
        }, { status: 503 });
      }

      const baseUrl = getAppBaseUrl();
      const state = createOAuthState(tenant_id);
      const redirectUri = `${baseUrl}/api/stripe-onboarding/callback`;

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: 'read_write',
        redirect_uri: redirectUri,
        state,
        'stripe_landing': 'login',
      });

      const authUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
      return NextResponse.json({ auth_url: authUrl });
    }

    // --- Test stored credentials ---
    if (action === 'test') {
      const { data: integration } = await supabaseAdmin
        .from('tenant_integrations')
        .select('credentials')
        .eq('tenant_id', tenant_id)
        .eq('category', 'payments')
        .eq('provider', 'stripe')
        .maybeSingle();

      if (!integration?.credentials) {
        return NextResponse.json({ error: 'No Stripe credentials configured.' }, { status: 400 });
      }

      const creds = integration.credentials as { access_token?: string; secret_key?: string };
      const key = creds.access_token || creds.secret_key;
      if (!key) {
        return NextResponse.json({ error: 'No Stripe API key found.' }, { status: 400 });
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Stripe = require('stripe');
        const testClient = new Stripe(key, { apiVersion: '2025-08-27.basil' as string });
        const balance = await testClient.balance.retrieve();

        await supabaseAdmin
          .from('tenant_integrations')
          .update({
            last_tested_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            last_error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenant_id)
          .eq('category', 'payments')
          .eq('provider', 'stripe');

        return NextResponse.json({
          success: true,
          balance: {
            available: balance.available?.[0]?.amount ?? 0,
            currency: balance.available?.[0]?.currency ?? 'usd',
          },
        });
      } catch {
        await supabaseAdmin
          .from('tenant_integrations')
          .update({
            last_tested_at: new Date().toISOString(),
            last_error_at: new Date().toISOString(),
            last_error_message: 'Connection test failed',
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenant_id)
          .eq('category', 'payments')
          .eq('provider', 'stripe');

        return NextResponse.json({ error: 'Connection test failed. Your Stripe authorization may have expired.' }, { status: 400 });
      }
    }

    // --- Disconnect ---
    if (action === 'disconnect') {
      const { data: integration } = await supabaseAdmin
        .from('tenant_integrations')
        .select('credentials')
        .eq('tenant_id', tenant_id)
        .eq('category', 'payments')
        .eq('provider', 'stripe')
        .maybeSingle();

      // Deauthorize with Stripe if we have the credentials
      if (integration?.credentials) {
        const creds = integration.credentials as { stripe_user_id?: string };
        if (creds.stripe_user_id) {
          try {
            const clientId = await getStripeClientId();
            const { resolveCredential } = await import('@/lib/integrations/credential-resolver');
            const secretKey = await resolveCredential('stripe', 'STRIPE_SECRET_KEY', 'test') ||
                              await resolveCredential('stripe', 'STRIPE_SECRET_KEY', 'production');
            if (clientId && secretKey) {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const Stripe = require('stripe');
              const stripe = new Stripe(secretKey, { apiVersion: '2025-08-27.basil' as string });
              await stripe.oauth.deauthorize({ client_id: clientId, stripe_user_id: creds.stripe_user_id });
            }
          } catch { /* best effort deauthorization */ }
        }
      }

      await supabaseAdmin
        .from('tenant_integrations')
        .update({
          connection_status: 'disconnected',
          enabled: false,
          credentials: {},
          external_account_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', tenant_id)
        .eq('category', 'payments')
        .eq('provider', 'stripe');

      return NextResponse.json({ success: true });
    }

    // --- Save manual keys (fallback) ---
    if (action === 'save_keys') {
      const { secret_key, publishable_key, webhook_secret } = body;

      if (!secret_key || !publishable_key) {
        return NextResponse.json({ error: 'Secret key and publishable key are required.' }, { status: 400 });
      }

      if (!secret_key.startsWith('sk_test_') && !secret_key.startsWith('sk_live_')) {
        return NextResponse.json({ error: 'Invalid secret key format. Must start with sk_test_ or sk_live_.' }, { status: 400 });
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Stripe = require('stripe');
        const testClient = new Stripe(secret_key, { apiVersion: '2025-08-27.basil' as string });
        await testClient.balance.retrieve();
      } catch {
        return NextResponse.json({ error: 'Invalid Stripe keys. Could not authenticate with Stripe.' }, { status: 400 });
      }

      const environment = secret_key.startsWith('sk_live_') ? 'live' : 'test';
      const credentials = { secret_key, publishable_key, webhook_secret: webhook_secret || null };

      const { data: existing } = await supabaseAdmin
        .from('tenant_integrations')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('category', 'payments')
        .eq('provider', 'stripe')
        .maybeSingle();

      const payload = {
        credentials,
        environment,
        connection_status: 'connected',
        enabled: true,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        capabilities: { charges_enabled: true, payouts_enabled: true, details_submitted: true, default_currency: 'USD', requirements_pending: [] },
      };

      if (existing) {
        await supabaseAdmin.from('tenant_integrations').update(payload).eq('id', existing.id);
      } else {
        await supabaseAdmin.from('tenant_integrations').insert({
          tenant_id,
          category: 'payments',
          provider: 'stripe',
          is_default: true,
          ...payload,
        });
      }

      return NextResponse.json({ success: true, environment });
    }

    if (action === 'update_webhook_secret') {
      const { webhook_secret } = body;

      if (!webhook_secret) {
        return NextResponse.json({ error: 'Webhook secret is required.' }, { status: 400 });
      }

      if (!webhook_secret.startsWith('whsec_')) {
        return NextResponse.json({ error: 'Invalid webhook secret format. Must start with whsec_.' }, { status: 400 });
      }

      const { data: integration } = await supabaseAdmin
        .from('tenant_integrations')
        .select('id, credentials')
        .eq('tenant_id', tenant_id)
        .eq('category', 'payments')
        .eq('provider', 'stripe')
        .maybeSingle();

      if (!integration) {
        return NextResponse.json({ error: 'Stripe integration not found.' }, { status: 404 });
      }

      const existingCreds = (integration.credentials as Record<string, unknown>) || {};
      await supabaseAdmin
        .from('tenant_integrations')
        .update({
          credentials: { ...existingCreds, webhook_secret },
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
