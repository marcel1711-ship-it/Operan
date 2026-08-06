import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getStripeClientAsync, isStripeConfiguredAsync, getAppBaseUrl } from '@/lib/integrations/stripe-server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  if (!(await isStripeConfiguredAsync())) {
    return NextResponse.json(
      {
        error: 'Stripe Connect has not been enabled for this environment. Once the platform configuration is completed, your business will be able to connect its own Stripe account.',
        code: 'platform_not_configured',
      },
      { status: 503 }
    );
  }

  // Verify we have a proper app base URL for return URLs
  const baseUrl = getAppBaseUrl();
  if (!baseUrl || baseUrl.startsWith('http://localhost')) {
    return NextResponse.json(
      { error: 'Server URL not configured. Contact your platform administrator.', code: 'app_url_missing' },
      { status: 503 }
    );
  }

  try {
    const body = await req.json();
    const { tenant_id, action } = body;

    if (!tenant_id) {
      return NextResponse.json({ error: 'Missing tenant_id' }, { status: 400 });
    }

    // Validate the user is authorized for this tenant via JWT
    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
    const { data: membership } = await userClient
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant_id)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const client = await getStripeClientAsync();
    if (!client) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    // Find existing integration
    const { data: integration } = await supabaseAdmin
      .from('tenant_integrations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('category', 'payments')
      .eq('provider', 'stripe')
      .maybeSingle();

    const baseUrl = getAppBaseUrl();
    const returnUrl = `${baseUrl}/api/stripe-onboarding/return?tenant_id=${tenant_id}`;

    if (action === 'connect' || (!integration && action !== 'continue')) {
      // Create new Stripe connected account
      const account = await client.accounts.create({
        type: 'express',
        country: 'US',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { tenant_id, platform: 'charter_booking' },
      });

      const accountLink = await client.accountLinks.create({
        account: account.id,
        refresh_url: `${returnUrl}?status=refresh`,
        return_url: `${returnUrl}?status=success`,
        type: 'account_onboarding',
      });

      // Create or update tenant integration
      if (integration) {
        await supabaseAdmin
          .from('tenant_integrations')
          .update({
            external_account_id: account.id,
            connection_status: 'connecting',
            updated_at: new Date().toISOString(),
          })
          .eq('id', integration.id);
      } else {
        await supabaseAdmin.from('tenant_integrations').insert({
          tenant_id,
          category: 'payments',
          provider: 'stripe',
          environment: 'test',
          connection_status: 'connecting',
          external_account_id: account.id,
          is_default: true,
          enabled: false,
        });
      }

      return NextResponse.json({ onboarding_url: accountLink.url });
    }

    if (action === 'continue' && integration?.external_account_id) {
      // Continue onboarding for existing account
      const accountLink = await client.accountLinks.create({
        account: integration.external_account_id,
        refresh_url: `${returnUrl}?status=refresh`,
        return_url: `${returnUrl}?status=success`,
        type: 'account_onboarding',
      });

      return NextResponse.json({ onboarding_url: accountLink.url });
    }

    if (action === 'refresh' && integration?.external_account_id) {
      // Sync status from Stripe
      const account = await client.accounts.retrieve(integration.external_account_id);

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

      return NextResponse.json({
        connection_status: isReady ? 'connected' : 'requires_action',
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        requirements_pending: requirementsPending,
      });
    }

    if (action === 'disconnect' && integration?.external_account_id) {
      await client.accounts.del(integration.external_account_id);

      await supabaseAdmin
        .from('tenant_integrations')
        .update({
          connection_status: 'disconnected',
          enabled: false,
          external_account_id: null,
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
