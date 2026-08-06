import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateApiKey, hasScope, unauthorized, forbidden } from '../_lib/auth';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth?.authenticated) return unauthorized('Valid API key required');
  if (!hasScope(auth, 'customers:read')) return forbidden('Missing scope: customers:read');

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const search = url.searchParams.get('search');

  let query = admin
    .from('customers')
    .select('id, full_name, email, phone, created_at, updated_at', { count: 'exact' })
    .eq('tenant_id', auth.tenant_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });

  return NextResponse.json({
    data,
    pagination: { limit, offset, total: count || 0 },
  });
}
