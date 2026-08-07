import { NextRequest, NextResponse } from 'next/server';
import { getAppBaseUrl } from '@/lib/integrations/stripe-server';

// Legacy return route — redirects to integrations page
export async function GET(req: NextRequest) {
  const baseUrl = getAppBaseUrl();
  const status = req.nextUrl.searchParams.get('status') || 'success';
  const stripeStatus = status === 'success' ? 'connected' : status === 'refresh' ? 'requires_action' : 'error';
  return NextResponse.redirect(`${baseUrl}/integrations?stripe_status=${stripeStatus}`);
}
