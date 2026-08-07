import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/integrations/super-admin-auth';
import { isStripeConfigured, getStripeWebhookSecret, getStripeEnvironment, getStripePublishableKey } from '@/lib/integrations/stripe-server';

export async function GET(req: NextRequest) {
  const authResult = await requireSuperAdmin(req);
  if (authResult instanceof NextResponse) return authResult;

  return NextResponse.json({
    configured: isStripeConfigured(),
    webhook_configured: !!getStripeWebhookSecret(),
    publishable_key_configured: !!getStripePublishableKey(),
    environment: getStripeEnvironment(),
    onboarding_route_available: true,
    webhook_route_available: true,
  });
}
