import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const required = ['firstName', 'companyName', 'email', 'fleetSize', 'bookingManagement'] as const;
    const missing = required.filter((f) => !body[f]?.toString().trim());
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const payload = {
      firstName: body.firstName?.trim(),
      companyName: body.companyName?.trim(),
      email: body.email?.trim().toLowerCase(),
      phone: body.phone?.trim() || null,
      fleetSize: body.fleetSize,
      bookingManagement: body.bookingManagement,
      biggestChallenge: body.biggestChallenge?.trim() || null,
      utmSource: body.utmSource || null,
      utmMedium: body.utmMedium || null,
      utmCampaign: body.utmCampaign || null,
      utmContent: body.utmContent || null,
      utmTerm: body.utmTerm || null,
      source: body.source || null,
      pageUrl: body.pageUrl || null,
      submittedAt: new Date().toISOString(),
    };

    // ── GHL integration point ──
    // When GoHighLevel is configured, send the payload here.
    // Required env vars:
    //   GHL_API_KEY        – GoHighLevel API key
    //   GHL_LOCATION_ID    – GHL location/sub-account ID
    //   GHL_PIPELINE_ID    – Sales pipeline ID for opportunities
    //   GHL_STAGE_ID       – Initial pipeline stage ID
    //
    // The integration should:
    //   1. Create/update a Contact (firstName, email, phone, companyName)
    //   2. Set custom fields (fleetSize, bookingManagement, biggestChallenge)
    //   3. Create an Opportunity in the OPERAN Sales pipeline
    //   4. Tag with attribution (utmSource, source, etc.)
    //
    // Example:
    // const ghlApiKey = process.env.GHL_API_KEY;
    // if (ghlApiKey) {
    //   await sendToGHL(payload, ghlApiKey);
    // }

    console.log('[demo-request] Lead received:', payload.email);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[demo-request] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
