import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const endpointId = url.pathname.split('/').slice(-2, -1)[0];
  const tenantId = url.searchParams.get('tenant_id') || '';

  const auth = await requireTenantAdmin(req, { tenant_id: tenantId });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const { data, error } = await supabaseAdmin
    .from('tenant_webhook_deliveries')
    .select('*')
    .eq('endpoint_id', endpointId)
    .eq('tenant_id', ctx.tenant_id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: 'Failed to load deliveries' }, { status: 500 });
  return NextResponse.json({ deliveries: data });
}
