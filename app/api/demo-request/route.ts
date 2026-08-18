import { NextRequest, NextResponse } from 'next/server';
import { submitDemoLead, type DemoLeadPayload } from '@/lib/ghl/demo-leads';

const MAX_BODY_BYTES = 8_192;

const VALID_FLEET = ['1', '2–5', '6–10', '11–30', '30+'];
const VALID_MULTI_OWNER = ['Yes', 'No', 'Some of them'];
const VALID_BOOKING = ['WhatsApp', 'Instagram / DMs', 'Calendar', 'Booking software', 'Spreadsheet', 'Phone / Text', 'Other'];

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function sanitize(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, 500);
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again in a moment.' },
        { status: 429 }
      );
    }

    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const firstName = sanitize(body.firstName);
    const companyName = sanitize(body.companyName);
    const email = sanitize(body.email).toLowerCase();
    const phone = sanitize(body.phone);
    const fleetSize = sanitize(body.fleetSize);
    const multiOwnerFleet = sanitize(body.multiOwnerFleet);
    const biggestChallenge = sanitize(body.biggestChallenge) || null;

    const missing: string[] = [];
    if (!firstName) missing.push('firstName');
    if (!companyName) missing.push('companyName');
    if (!email) missing.push('email');
    if (!phone) missing.push('phone');
    if (!fleetSize) missing.push('fleetSize');
    if (!multiOwnerFleet) missing.push('multiOwnerFleet');

    if (!Array.isArray(body.bookingManagement) || body.bookingManagement.length === 0) {
      missing.push('bookingManagement');
    }

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    if (!VALID_FLEET.includes(fleetSize)) {
      return NextResponse.json({ error: 'Invalid fleet size' }, { status: 400 });
    }

    if (!VALID_MULTI_OWNER.includes(multiOwnerFleet)) {
      return NextResponse.json({ error: 'Invalid multi-owner selection' }, { status: 400 });
    }

    const bookingManagement = (body.bookingManagement as unknown[])
      .map((v) => sanitize(v))
      .filter((v) => VALID_BOOKING.includes(v));

    if (bookingManagement.length === 0) {
      return NextResponse.json({ error: 'Invalid booking management selection' }, { status: 400 });
    }

    const payload: DemoLeadPayload = {
      firstName,
      companyName,
      email,
      phone,
      fleetSize,
      multiOwnerFleet,
      bookingManagement,
      biggestChallenge,
      utmSource: sanitize(body.utmSource) || null,
      utmMedium: sanitize(body.utmMedium) || null,
      utmCampaign: sanitize(body.utmCampaign) || null,
      utmContent: sanitize(body.utmContent) || null,
      utmTerm: sanitize(body.utmTerm) || null,
      source: sanitize(body.source) || null,
      pageUrl: sanitize(body.pageUrl) || null,
      submittedAt: new Date().toISOString(),
    };

    console.log('[demo-request] Processing lead:', payload.email);

    const result = await submitDemoLead(payload);

    if (!result.success) {
      console.error('[demo-request] GHL integration failed:', result.error);
      return NextResponse.json({ error: 'Unable to process your request. Please try again.' }, { status: 502 });
    }

    console.log('[demo-request] Lead delivered:', {
      email: payload.email,
      contactId: result.contactId,
      opportunityId: result.opportunityId,
      existingOpportunity: result.existingOpportunity,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'GHL_PRIVATE_INTEGRATION_TOKEN is not configured') {
      console.error('[demo-request] GHL token not configured');
      return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
    }

    console.error('[demo-request] Unexpected error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
