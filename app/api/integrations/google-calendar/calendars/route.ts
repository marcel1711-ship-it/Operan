import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';
import { getCalendarList } from '@/lib/integrations/google-calendar-service';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id') || '';
  const auth = await requireTenantAdmin(req, { tenant_id: tenantId });
  if (auth instanceof NextResponse) return auth;

  const result = await getCalendarList(tenantId);
  if (result.error) {
    return NextResponse.json({ error: result.error, calendars: null }, { status: result.error.includes('not connected') ? 400 : 500 });
  }
  return NextResponse.json({ calendars: result.calendars });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const auth = await requireTenantAdmin(req, { tenant_id: body.tenant_id });
  if (auth instanceof NextResponse) return auth;

  const { selectCalendar } = await import('@/lib/integrations/google-calendar-service');
  const result = await selectCalendar(body.tenant_id, body.calendar_id, body.calendar_name, body.calendar_timezone);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ success: true });
}
