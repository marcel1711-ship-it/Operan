import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireAnyTenantMember } from '@/lib/integrations/api-auth';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id') || '';
  const category = url.searchParams.get('category');
  const provider = url.searchParams.get('provider');

  const auth = await requireAnyTenantMember(req, tenantId);
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  let query = supabaseAdmin
    .from('integration_activity_logs')
    .select('*')
    .eq('tenant_id', ctx.tenant_id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (category) query = query.eq('category', category);
  if (provider) query = query.eq('provider', provider);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: 'Failed to load logs' }, { status: 500 });
  return NextResponse.json({ logs: data });
}
