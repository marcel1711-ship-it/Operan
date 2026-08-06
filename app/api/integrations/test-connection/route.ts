import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';
import { getStripeClient } from '@/lib/integrations/stripe-server';
import { isResendConfigured } from '@/lib/integrations/resend-server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const auth = await requireTenantAdmin(req, { tenant_id: body.tenant_id });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const { category, provider } = body;

  try {
    // Stripe test: retrieve account status
    if (category === 'payments' && provider === 'stripe') {
      const { data: integration } = await supabaseAdmin
        .from('tenant_integrations')
        .select('*')
        .eq('tenant_id', ctx.tenant_id)
        .eq('category', 'payments')
        .eq('provider', 'stripe')
        .maybeSingle();

      if (!integration?.external_account_id) {
        return NextResponse.json({ success: false, error: 'No Stripe account connected' });
      }

      const client = getStripeClient();
      if (!client) {
        return NextResponse.json({ success: false, error: 'Stripe is not configured on the platform' });
      }

      const account = await client.accounts.retrieve(integration.external_account_id);

      const isReady = account.charges_enabled === true && account.details_submitted === true;

      await supabaseAdmin
        .from('tenant_integrations')
        .update({
          last_tested_at: new Date().toISOString(),
          last_success_at: isReady ? new Date().toISOString() : null,
          last_error_at: isReady ? null : new Date().toISOString(),
          last_error_message: isReady ? null : 'Account not fully verified',
          updated_at: new Date().toISOString(),
        })
        .eq('id', integration.id);

      await supabaseAdmin.rpc('log_integration_activity', {
        p_tenant_id: ctx.tenant_id,
        p_category: 'payments',
        p_provider: 'stripe',
        p_action: 'test_connection',
        p_status: isReady ? 'success' : 'failed',
        p_message: isReady ? 'Stripe account verified and ready' : 'Stripe account requires additional setup',
        p_metadata: { charges_enabled: account.charges_enabled, details_submitted: account.details_submitted },
        p_integration_id: integration.id,
      });

      return NextResponse.json({
        success: isReady,
        details: {
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          default_currency: account.default_currency?.toUpperCase(),
        },
      });
    }

    // Resend test: check platform readiness
    if ((category === 'communication' || category === 'messaging') && provider === 'resend') {
      const configured = isResendConfigured();

      await supabaseAdmin.rpc('log_integration_activity', {
        p_tenant_id: ctx.tenant_id,
        p_category: category,
        p_provider: 'resend',
        p_action: 'test_connection',
        p_status: configured ? 'success' : 'failed',
        p_message: configured ? 'Resend platform is configured' : 'Resend platform is not configured',
      });

      return NextResponse.json({
        success: configured,
        details: configured ? { status: 'Platform ready' } : { error: 'Email delivery platform is not configured' },
      });
    }

    // iCal test: fetch and parse the feed
    if (category === 'calendar' && provider === 'ical') {
      const { data: feeds } = await supabaseAdmin
        .from('tenant_ical_feeds')
        .select('*')
        .eq('tenant_id', ctx.tenant_id)
        .eq('status', 'active')
        .eq('feed_type', 'import');

      if (!feeds || feeds.length === 0) {
        return NextResponse.json({ success: true, details: { message: 'No import feeds to test' } });
      }

      let allOk = true;
      const results = [];

      for (const feed of feeds) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(feed.source_url, { signal: controller.signal });
          clearTimeout(timeout);

          if (!response.ok) {
            allOk = false;
            results.push({ feed: feed.name, ok: false, error: `HTTP ${response.status}` });
          } else {
            const text = await response.text();
            const hasCalendar = text.includes('BEGIN:VCALENDAR');
            if (!hasCalendar) {
              allOk = false;
              results.push({ feed: feed.name, ok: false, error: 'Invalid iCal format' });
            } else {
              results.push({ feed: feed.name, ok: true, events: (text.match(/BEGIN:VEVENT/g) || []).length });
            }
          }
        } catch (err) {
          allOk = false;
          results.push({ feed: feed.name, ok: false, error: err instanceof Error ? err.message : 'Fetch failed' });
        }
      }

      await supabaseAdmin.rpc('log_integration_activity', {
        p_tenant_id: ctx.tenant_id,
        p_category: 'calendar',
        p_provider: 'ical',
        p_action: 'test_connection',
        p_status: allOk ? 'success' : 'failed',
        p_message: allOk ? 'All iCal feeds are accessible' : 'One or more iCal feeds failed',
        p_metadata: { results },
      });

      return NextResponse.json({ success: allOk, details: { feeds: results } });
    }

    // Webhooks test: check if any endpoints are configured
    if (category === 'automation' && provider === 'webhooks') {
      const { data: endpoints } = await supabaseAdmin
        .from('tenant_webhook_endpoints')
        .select('id, name, url, is_active')
        .eq('tenant_id', ctx.tenant_id)
        .eq('is_active', true);

      return NextResponse.json({
        success: true,
        details: { active_endpoints: endpoints?.length || 0 },
      });
    }

    // API Access test
    if (category === 'automation' && provider === 'api_access') {
      const { data: keys } = await supabaseAdmin
        .from('tenant_api_keys')
        .select('id, name')
        .eq('tenant_id', ctx.tenant_id)
        .is('revoked_at', null);

      return NextResponse.json({
        success: true,
        details: { active_keys: keys?.length || 0 },
      });
    }

    // Google Calendar test: check if platform OAuth is configured (vault or env)
    if (category === 'calendar' && provider === 'google_calendar') {
      const { isGoogleCalendarConfiguredAsync } = await import('@/lib/integrations/google-calendar-service');
      const configured = await isGoogleCalendarConfiguredAsync();

      return NextResponse.json({
        success: configured,
        details: {
          platform_configured: configured,
          message: configured
            ? 'Google OAuth is configured on the platform'
            : 'Google Calendar OAuth has not been configured on the platform yet',
        },
      });
    }

    // Default: not testable
    return NextResponse.json({
      success: false,
      error: 'Connection testing is not available for this provider yet',
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: 'We could not verify this connection. Please try again.',
    });
  }
}
