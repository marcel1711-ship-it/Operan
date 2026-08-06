import { NextResponse } from 'next/server';
import { isStripeConfigured, getStripeWebhookSecret, getStripeEnvironment, getStripePublishableKey } from '@/lib/integrations/stripe-server';

export async function GET() {
  return NextResponse.json({
    configured: isStripeConfigured(),
    webhook_configured: !!getStripeWebhookSecret(),
    publishable_key_configured: !!getStripePublishableKey(),
    environment: getStripeEnvironment(),
    onboarding_route_available: true,
    webhook_route_available: true,
  });
}
