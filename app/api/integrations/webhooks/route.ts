import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';
import { createHmac, timingSafeEqual } from 'crypto';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenant_id = url.searchParams.get('tenant_id');
  const auth = await requireTenantAdmin(req, { tenant_id: tenant_id || undefined });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const { data, error } = await supabaseAdmin
    .from('tenant_webhook_endpoints')
    .select('*')
    .eq('tenant_id', ctx.tenant_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to load endpoints' }, { status: 500 });
  return NextResponse.json({ endpoints: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const auth = await requireTenantAdmin(req, { tenant_id: body.tenant_id });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string; user_id: string };

  const { name, url: endpointUrl, events } = body;

  if (!name || !endpointUrl) {
    return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 });
  }

  try {
    const parsed = new URL(endpointUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return NextResponse.json({ error: 'URL must use HTTP or HTTPS protocol' }, { status: 400 });
    }
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('172.16.') || hostname === '0.0.0.0' || hostname === '[::1]') {
      return NextResponse.json({ error: 'URL must be a publicly accessible address' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  const { data: secretData } = await supabaseAdmin.rpc('generate_webhook_signing_secret');
  const signingSecret = secretData as string;

  const { data, error } = await supabaseAdmin
    .from('tenant_webhook_endpoints')
    .insert({
      tenant_id: ctx.tenant_id,
      name,
      url: endpointUrl,
      events: events || [],
      signing_secret: signingSecret,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create endpoint' }, { status: 500 });

  await supabaseAdmin.rpc('log_integration_activity', {
    p_tenant_id: ctx.tenant_id,
    p_category: 'automation',
    p_provider: 'webhooks',
    p_action: 'endpoint_created',
    p_status: 'success',
    p_message: `Created webhook endpoint: ${name}`,
    p_metadata: { endpoint_id: data.id },
  });

  return NextResponse.json({ endpoint: data });
}
