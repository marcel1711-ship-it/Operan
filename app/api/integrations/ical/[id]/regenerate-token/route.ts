import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const feedId = url.pathname.split('/').slice(-2, -1)[0];
  const body = await req.json();

  const auth = await requireTenantAdmin(req, { tenant_id: body.tenant_id });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const { data: tokenData } = await supabaseAdmin.rpc('generate_ical_feed_token');
  const newToken = tokenData as string;

  const { data, error } = await supabaseAdmin
    .from('tenant_ical_feeds')
    .update({ feed_token: newToken, updated_at: new Date().toISOString() })
    .eq('id', feedId)
    .eq('tenant_id', ctx.tenant_id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to regenerate token' }, { status: 500 });
  return NextResponse.json({ feed: data });
}
