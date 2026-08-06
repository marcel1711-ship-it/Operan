import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';
import { createHash, randomBytes } from 'crypto';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenant_id = url.searchParams.get('tenant_id');
  const auth = await requireTenantAdmin(req, { tenant_id: tenant_id || undefined });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const { data, error } = await supabaseAdmin
    .from('tenant_api_keys')
    .select('id, name, key_prefix, scopes, last_used_at, created_at, revoked_at')
    .eq('tenant_id', ctx.tenant_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 });
  return NextResponse.json({ keys: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const auth = await requireTenantAdmin(req, { tenant_id: body.tenant_id });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string; user_id: string };

  const { name, scopes } = body;
  if (!name) {
    return NextResponse.json({ error: 'Key name is required' }, { status: 400 });
  }

  // Generate a random API key: opk_<32 hex chars>
  const rawKey = `opk_${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 12);

  const { data, error } = await supabaseAdmin
    .from('tenant_api_keys')
    .insert({
      tenant_id: ctx.tenant_id,
      name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes: scopes || ['read'],
    })
    .select('id, name, key_prefix, scopes, created_at')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });

  await supabaseAdmin.rpc('log_integration_activity', {
    p_tenant_id: ctx.tenant_id,
    p_category: 'automation',
    p_provider: 'api_access',
    p_action: 'key_created',
    p_status: 'success',
    p_message: `Created API key: ${name}`,
    p_metadata: { key_id: data.id },
  });

  // Return the raw key only once — never stored or retrievable again
  return NextResponse.json({ key: data, raw_key: rawKey });
}
