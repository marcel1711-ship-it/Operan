import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const url = new URL(req.url);
  const feedId = url.pathname.split('/').pop();

  const auth = await requireTenantAdmin(req, { tenant_id: body.tenant_id });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowed = ['name', 'include_cancelled', 'include_customer_info', 'selected_listing_ids', 'source_url', 'assigned_listing_ids', 'conflict_handling', 'sync_frequency', 'status'];
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await supabaseAdmin
    .from('tenant_ical_feeds')
    .update(updates)
    .eq('id', feedId)
    .eq('tenant_id', ctx.tenant_id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to update feed' }, { status: 500 });
  return NextResponse.json({ feed: data });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const feedId = url.pathname.split('/').pop();
  const tenantId = url.searchParams.get('tenant_id') || '';

  const auth = await requireTenantAdmin(req, { tenant_id: tenantId });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const { error } = await supabaseAdmin
    .from('tenant_ical_feeds')
    .delete()
    .eq('id', feedId)
    .eq('tenant_id', ctx.tenant_id);

  if (error) return NextResponse.json({ error: 'Failed to delete feed' }, { status: 500 });
  return NextResponse.json({ success: true });
}
