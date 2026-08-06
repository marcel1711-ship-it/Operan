import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';
import { createOAuthState } from '@/lib/integrations/crypto';
import { getGoogleClientIdAsync, getGoogleClientSecretAsync } from '@/lib/integrations/google-calendar-service';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');

  const auth = await requireTenantAdmin(req, { tenant_id: tenantId || undefined });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const clientId = await getGoogleClientIdAsync();
  const clientSecret = await getGoogleClientSecretAsync();

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      error: 'Google Calendar integration has not been enabled for this environment yet. Please check back later.',
      code: 'platform_not_configured',
    }, { status: 503 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const redirectUri = `${baseUrl}/api/integrations/google-calendar/callback`;

  // Use HMAC-signed state for CSRF protection
  const state = createOAuthState(ctx.tenant_id);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return NextResponse.json({ auth_url: authUrl.toString() });
}
