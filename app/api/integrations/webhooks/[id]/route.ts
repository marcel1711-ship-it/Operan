import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const url = new URL(req.url);
  const endpointId = url.pathname.split('/').pop();

  const auth = await requireTenantAdmin(req, { tenant_id: body.tenant_id });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowed = ['name', 'url', 'events', 'is_active'];
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabaseAdmin
    .from('tenant_webhook_endpoints')
    .update(updates)
    .eq('id', endpointId)
    .eq('tenant_id', ctx.tenant_id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to update endpoint' }, { status: 500 });
  return NextResponse.json({ endpoint: data });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const endpointId = url.pathname.split('/').pop();
  const tenantId = url.searchParams.get('tenant_id') || '';

  const auth = await requireTenantAdmin(req, { tenant_id: tenantId });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const { error } = await supabaseAdmin
    .from('tenant_webhook_endpoints')
    .delete()
    .eq('id', endpointId)
    .eq('tenant_id', ctx.tenant_id);

  if (error) return NextResponse.json({ error: 'Failed to delete endpoint' }, { status: 500 });
  return NextResponse.json({ success: true });
}
