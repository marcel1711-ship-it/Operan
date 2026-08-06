import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateApiKey, hasScope, unauthorized, forbidden } from '../../_lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authenticateApiKey(req);
  if (!auth?.authenticated) return unauthorized('Valid API key required');
  if (!hasScope(auth, 'customers:read')) return forbidden('Missing scope: customers:read');

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await admin
    .from('customers')
    .select('id, full_name, email, phone, tags, created_at, updated_at')
    .eq('id', params.id)
    .eq('tenant_id', auth.tenant_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Failed to fetch customer' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  return NextResponse.json({ data });
}
