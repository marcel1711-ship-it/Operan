import { NextRequest, NextResponse } from 'next/server';
import {
  testStripeConnection,
  testResendConnection,
  testGoogleCalendarConnection,
} from '../../route';

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const providerKey = params.provider;

  switch (providerKey) {
    case 'stripe': {
      const result = await testStripeConnection();
      return NextResponse.json(result);
    }
    case 'resend': {
      const result = await testResendConnection();
      return NextResponse.json(result);
    }
    case 'google_calendar': {
      const result = await testGoogleCalendarConnection();
      return NextResponse.json(result);
    }
    case 'ical':
    case 'webhooks':
    case 'api_access': {
      return NextResponse.json({
        ok: true,
        message: `${providerKey} runtime is deployed and available — no external API to test.`,
      });
    }
    case 'twilio':
    case 'meta_whatsapp':
    case 'twilio_whatsapp':
    case 'quickbooks': {
      return NextResponse.json({
        ok: false,
        message: `${providerKey} integration is coming soon — backend is not yet implemented.`,
      });
    }
    default:
      return NextResponse.json({ ok: false, message: 'Unknown provider' }, { status: 404 });
  }
}
