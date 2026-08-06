import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateApiKey, hasScope, unauthorized, forbidden } from '../_lib/auth';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth?.authenticated) return unauthorized('Valid API key required');
  if (!hasScope(auth, 'listings:read')) return forbidden('Missing scope: listings:read');

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const { data, error, count } = await admin
    .from('listings')
    .select('id, name, description, slug, created_at, updated_at', { count: 'exact' })
    .eq('tenant_id', auth.tenant_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: 'Failed to fetch listings' }, { status: 500 });

  return NextResponse.json({
    data,
    pagination: { limit, offset, total: count || 0 },
  });
}
