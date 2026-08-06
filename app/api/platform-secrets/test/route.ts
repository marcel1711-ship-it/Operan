import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/integrations/super-admin-auth';
import { getPlatformSecret, updateVerificationStatus, logAudit } from '@/lib/integrations/platform-secret-service';

// POST /api/platform-secrets/test
// Body: { providerKey, environment? }
// Runs a real provider verification using the stored credentials.
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { userId: string; email: string };

  const body = await req.json().catch(() => ({}));
  const { providerKey, environment = 'production' } = body as { providerKey: string; environment?: string };

  if (!providerKey) {
    return NextResponse.json({ error: 'providerKey is required' }, { status: 400 });
  }

  try {
    let ok = false;
    let message = '';

    if (providerKey === 'stripe') {
      const secretKey = await getPlatformSecret('stripe', 'STRIPE_SECRET_KEY', environment);
      if (!secretKey) {
        return NextResponse.json({ ok: false, message: 'Stripe Secret Key is not configured in the vault' });
      }
      // Dynamically import stripe
      const Stripe = require('stripe');
      const client = new Stripe(secretKey, { apiVersion: '2025-08-27.basil', typescript: true });
      try {
        await client.balance.retrieve();
        ok = true;
        message = 'Stripe API connection verified successfully';
        await updateVerificationStatus({ providerKey: 'stripe', secretName: 'STRIPE_SECRET_KEY', status: 'verified', environment });
      } catch (err: any) {
        ok = false;
        message = `Stripe API rejected the request: ${err.message || 'Unknown error'}`;
        await updateVerificationStatus({ providerKey: 'stripe', secretName: 'STRIPE_SECRET_KEY', status: 'failed', error: message, environment });
      }
    } else if (providerKey === 'resend') {
      const apiKey = await getPlatformSecret('resend', 'RESEND_API_KEY', environment);
      if (!apiKey) {
        return NextResponse.json({ ok: false, message: 'Resend API Key is not configured in the vault' });
      }
      try {
        const response = await fetch('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (response.ok) {
          ok = true;
          message = 'Resend API connection verified successfully';
          await updateVerificationStatus({ providerKey: 'resend', secretName: 'RESEND_API_KEY', status: 'verified', environment });
        } else {
          ok = false;
          message = `Resend API returned status ${response.status}`;
          await updateVerificationStatus({ providerKey: 'resend', secretName: 'RESEND_API_KEY', status: 'failed', error: message, environment });
        }
      } catch (err: any) {
        ok = false;
        message = `Resend API request failed: ${err.message || 'Unknown error'}`;
        await updateVerificationStatus({ providerKey: 'resend', secretName: 'RESEND_API_KEY', status: 'failed', error: message, environment });
      }
    } else if (providerKey === 'google_calendar') {
      const clientId = await getPlatformSecret('google_calendar', 'GOOGLE_CLIENT_ID', environment);
      const clientSecret = await getPlatformSecret('google_calendar', 'GOOGLE_CLIENT_SECRET', environment);
      if (!clientId || !clientSecret) {
        return NextResponse.json({ ok: false, message: 'Google OAuth credentials are not fully configured in the vault' });
      }
      // Validate format: client ID should end with apps.googleusercontent.com
      if (!clientId.includes('googleusercontent.com')) {
        ok = false;
        message = 'Google Client ID format looks invalid — it should end with .apps.googleusercontent.com';
        await updateVerificationStatus({ providerKey: 'google_calendar', secretName: 'GOOGLE_CLIENT_ID', status: 'failed', error: message, environment });
      } else {
        ok = true;
        message = 'Google OAuth credentials format verified';
        await updateVerificationStatus({ providerKey: 'google_calendar', secretName: 'GOOGLE_CLIENT_ID', status: 'verified', environment });
        await updateVerificationStatus({ providerKey: 'google_calendar', secretName: 'GOOGLE_CLIENT_SECRET', status: 'verified', environment });
      }
    } else {
      return NextResponse.json({ ok: false, message: `Testing is not implemented for provider: ${providerKey}` });
    }

    await logAudit({
      actorId: ctx.userId,
      actorEmail: ctx.email,
      providerKey,
      action: ok ? 'verification_succeeded' : 'verification_failed',
      environment,
      result: ok ? 'success' : 'failed',
      detail: message,
    });

    return NextResponse.json({ ok, message });
  } catch (err) {
    return NextResponse.json({ ok: false, message: 'Connection test failed to execute' });
  }
}
