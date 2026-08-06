import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { getStripeClientAsync, isStripeConfiguredAsync, getAppBaseUrl } from '@/lib/integrations/stripe-server';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const status = searchParams.get('status') || 'success';
  const tenantId = searchParams.get('tenant_id');
  const baseUrl = getAppBaseUrl();

  // Sync Stripe account status if we have a tenant_id
  if (tenantId && (await isStripeConfiguredAsync())) {
    const client = await getStripeClientAsync();
    if (client) {
      try {
        const { data: integration } = await supabaseAdmin
          .from('tenant_integrations')
          .select('id, external_account_id')
          .eq('tenant_id', tenantId)
          .eq('category', 'payments')
          .eq('provider', 'stripe')
          .maybeSingle();

        if (integration?.external_account_id && client) {
          const account = await client.accounts.retrieve(integration.external_account_id);

          const requirementsPending: string[] = [];
          if (account.requirements?.currently_due) requirementsPending.push(...account.requirements.currently_due);
          if (account.requirements?.past_due) requirementsPending.push(...account.requirements.past_due);

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
        }
      } catch (err) {
        console.error('[stripe-onboarding/return] Failed to sync account:', err);
      }
    }
  }

  const stripeStatus = status === 'success' ? 'connected' : status === 'refresh' ? 'requires_action' : 'error';
  return NextResponse.redirect(`${baseUrl}/integrations?stripe_status=${stripeStatus}`);
}
