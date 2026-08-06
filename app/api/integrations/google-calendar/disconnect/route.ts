import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';
import { disconnectCalendar } from '@/lib/integrations/google-calendar-service';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const auth = await requireTenantAdmin(req, { tenant_id: body.tenant_id });
  if (auth instanceof NextResponse) return auth;

  const result = await disconnectCalendar(body.tenant_id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true });
}
