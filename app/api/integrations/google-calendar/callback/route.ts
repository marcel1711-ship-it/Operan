import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { encrypt, verifyOAuthState } from '@/lib/integrations/crypto';
import { getGoogleClientIdAsync, getGoogleClientSecretAsync } from '@/lib/integrations/google-calendar-service';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  if (error) {
    return NextResponse.redirect(`${baseUrl}/integrations?google_status=denied`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${baseUrl}/integrations?google_status=error`);
  }

  // Verify HMAC-signed state (CSRF protection + tenant identity)
  const stateResult = verifyOAuthState(state);
  if (!stateResult.valid) {
    return NextResponse.redirect(`${baseUrl}/integrations?google_status=invalid_state`);
  }
  const tenantId = stateResult.tenantId;

  const clientId = await getGoogleClientIdAsync();
  const clientSecret = await getGoogleClientSecretAsync();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${baseUrl}/integrations?google_status=platform_error`);
  }

  const redirectUri = `${baseUrl}/api/integrations/google-calendar/callback`;

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      console.error('[google-calendar] Token exchange failed:', tokenResponse.status, errBody);
      return NextResponse.redirect(`${baseUrl}/integrations?google_status=token_error`);
    }

    const tokens = await tokenResponse.json();

    // Encrypt credentials with AES-256-GCM
    const credentialsJson = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
    });
    const encryptedCredentials = encrypt(credentialsJson);

    // Get user info for the provider account ID
    let providerAccountId: string | null = null;
    let providerEmail: string | null = null;
    try {
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        providerAccountId = userInfo.id;
        providerEmail = userInfo.email;
      }
    } catch {
      // Non-critical
    }

    await supabaseAdmin
      .from('tenant_calendar_connections')
      .upsert({
        tenant_id: tenantId,
        provider: 'google_calendar',
        provider_account_id: providerAccountId,
        encrypted_credentials: encryptedCredentials,
        granted_scopes: tokens.scope ? tokens.scope.split(' ') : [],
        token_expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
        connection_status: 'connected',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,provider' });

    await supabaseAdmin
      .from('tenant_integrations')
      .upsert({
        tenant_id: tenantId,
        category: 'calendar',
        provider: 'google_calendar',
        environment: 'test',
        connection_status: 'connected',
        external_account_id: providerAccountId,
        is_default: true,
        enabled: true,
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,category,provider' });

    await supabaseAdmin.rpc('log_integration_activity', {
      p_tenant_id: tenantId,
      p_category: 'calendar',
      p_provider: 'google_calendar',
      p_action: 'oauth_connected',
      p_status: 'success',
      p_message: `Google Calendar connected${providerEmail ? ` (${providerEmail})` : ''}`,
    });

    return NextResponse.redirect(`${baseUrl}/integrations?google_status=connected`);
  } catch (err) {
    console.error('[google-calendar] Callback error:', err);
    return NextResponse.redirect(`${baseUrl}/integrations?google_status=error`);
  }
}
