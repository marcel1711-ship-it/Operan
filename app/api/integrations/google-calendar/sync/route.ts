import { NextRequest, NextResponse } from 'next/server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';
import { syncExternalBusyBlocks, syncReservationToCalendar } from '@/lib/integrations/google-calendar-service';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const auth = await requireTenantAdmin(req, { tenant_id: body.tenant_id });
  if (auth instanceof NextResponse) return auth;

  const { action, reservation_id } = body;

  if (action === 'sync_busy_blocks') {
    const result = await syncExternalBusyBlocks(body.tenant_id);
    return NextResponse.json(result);
  }

  if (action === 'sync_reservation' && reservation_id) {
    const result = await syncReservationToCalendar(body.tenant_id, reservation_id, body.event_action || 'create');
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
