import { NextResponse } from 'next/server';
import { getPlatformSecret } from '@/lib/integrations/platform-secret-service';

// GET /api/public/platform-config/stripe
// Returns ONLY the active Stripe publishable key — safe for the browser.
// Never returns the secret key, webhook secret, or any encrypted values.
export async function GET() {
  try {
    // Try vault first (production environment)
    let publishableKey = await getPlatformSecret('stripe', 'STRIPE_PUBLISHABLE_KEY', 'production');

    // Try test environment if production is not configured
    if (!publishableKey) {
      publishableKey = await getPlatformSecret('stripe', 'STRIPE_PUBLISHABLE_KEY', 'test');
    }

    // Env fallback
    if (!publishableKey) {
      publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;
    }

    if (!publishableKey) {
      return NextResponse.json({ publishableKey: null }, { status: 200 });
    }

    return NextResponse.json({ publishableKey });
  } catch {
    return NextResponse.json({ publishableKey: null }, { status: 200 });
  }
}
