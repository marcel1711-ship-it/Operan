import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const endpointId = url.pathname.split('/').slice(-2, -1)[0];
  const body = await req.json();

  const auth = await requireTenantAdmin(req, { tenant_id: body.tenant_id });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const { data: secretData } = await supabaseAdmin.rpc('generate_webhook_signing_secret');
  const newSecret = secretData as string;

  const { data, error } = await supabaseAdmin
    .from('tenant_webhook_endpoints')
    .update({ signing_secret: newSecret, updated_at: new Date().toISOString() })
    .eq('id', endpointId)
    .eq('tenant_id', ctx.tenant_id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to rotate secret' }, { status: 500 });
  return NextResponse.json({ endpoint: data });
}
