import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export type AuthContext = {
  user_id: string;
  tenant_id: string;
  role: string;
};

export async function requireTenantAdmin(req: NextRequest, body?: { tenant_id?: string }): Promise<AuthContext | NextResponse> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }
  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  let tenantId = body?.tenant_id;
  if (!tenantId) {
    return NextResponse.json({ error: 'Missing tenant_id' }, { status: 400 });
  }

  const { data: membership } = await userClient
    .from('tenant_members')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Not authorized for this tenant' }, { status: 403 });
  }

  return { user_id: user.id, tenant_id: tenantId, role: membership.role };
}

export async function requireAnyTenantMember(req: NextRequest, tenantId: string): Promise<AuthContext | NextResponse> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }
  const token = authHeader.replace('Bearer ', '');
  const userClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { data: membership } = await userClient
    .from('tenant_members')
    .select('tenant_id, role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Not authorized for this tenant' }, { status: 403 });
  }

  return { user_id: user.id, tenant_id: tenantId, role: membership.role };
}
