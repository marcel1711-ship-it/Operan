import { NextResponse } from 'next/server';

/**
 * @deprecated This route is retained for migration verification only.
 * The application no longer requires GHL synchronization at runtime.
 * Do not call this route from active UI components.
 *
 * Returns a deprecation notice. The original sync logic has been removed
 * to eliminate the active GHL dependency. Legacy GHL data remains in the
 * database for verification purposes.
 */

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({
    deprecated: true,
    message: 'GHL sync is no longer active. The platform operates natively without GoHighLevel.',
  }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({
    deprecated: true,
    message: 'GHL sync is no longer active. The platform operates natively without GoHighLevel.',
  }, { status: 410 });
}
