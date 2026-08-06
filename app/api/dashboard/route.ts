import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * DEPRECATED — This route is retained for backward compatibility but
 * is no longer the primary data-loading path for the dashboard.
 *
 * The admin page now loads data directly via the service layer
 * (lib/services/*) which queries Supabase with authenticated session
 * and explicit tenant filtering.
 *
 * This route is kept as a fallback but is now tenant-aware:
 * it extracts the tenant from the authenticated user's session
 * rather than hardcoding a tenant slug.
 */

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin();

    // Extract auth token from request headers
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Set the session from the request
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve tenant from authenticated user
    const { data: userTenant, error: tenantError } = await supabase
      .from('tenant_users')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tenantError || !userTenant) {
      return NextResponse.json({ error: 'No tenant association found' }, { status: 403 });
    }

    const tenantId = userTenant.tenant_id;

    const [stagesRes, oppsRes, customersRes, reservationsRes, pipelineRes] = await Promise.all([
      supabase.from('pipeline_stages').select('*').eq('tenant_id', tenantId).eq('is_active', true).is('archived_at', null).order('stage_order', { ascending: true }),
      supabase.from('opportunities').select('*, customer:customers(*)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200),
      supabase.from('customers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50),
      supabase.from('reservations').select('*').eq('tenant_id', tenantId).order('start_at', { ascending: true }).limit(100),
      supabase.from('pipelines').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('is_default', { ascending: false }),
    ]);

    return NextResponse.json({
      pipeline: pipelineRes.data?.[0] || null,
      stages: stagesRes.data || [],
      opportunities: oppsRes.data || [],
      customers: customersRes.data || [],
      reservations: reservationsRes.data || [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
