import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenant_id = url.searchParams.get('tenant_id');
  const auth = await requireTenantAdmin(req, { tenant_id: tenant_id || undefined });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  const { data, error } = await supabaseAdmin
    .from('tenant_ical_feeds')
    .select('*')
    .eq('tenant_id', ctx.tenant_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to load feeds' }, { status: 500 });
  return NextResponse.json({ feeds: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const auth = await requireTenantAdmin(req, { tenant_id: body.tenant_id });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string; user_id: string };

  const { feed_type, name, source_url, assigned_listing_ids, conflict_handling, sync_frequency, include_cancelled, include_customer_info, selected_listing_ids } = body;

  if (!feed_type || !['export', 'import'].includes(feed_type)) {
    return NextResponse.json({ error: 'Invalid feed type' }, { status: 400 });
  }

  if (feed_type === 'import' && !source_url) {
    return NextResponse.json({ error: 'Source URL is required for import feeds' }, { status: 400 });
  }

  if (feed_type === 'import' && source_url) {
    if (!source_url.startsWith('https://') && !source_url.startsWith('http://')) {
      return NextResponse.json({ error: 'Source URL must be a valid HTTP or HTTPS URL' }, { status: 400 });
    }
    try {
      const parsed = new URL(source_url);
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('10.') || hostname.startsWith('192.168.') || hostname.startsWith('172.16.') || hostname === '0.0.0.0') {
        return NextResponse.json({ error: 'Source URL must be a publicly accessible URL' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }
  }

  let feedToken: string | null = null;
  if (feed_type === 'export') {
    const { data: tokenData } = await supabaseAdmin.rpc('generate_ical_feed_token');
    if (tokenData) feedToken = tokenData as string;
  }

  const insertData: Record<string, unknown> = {
    tenant_id: ctx.tenant_id,
    feed_type,
    name: name || (feed_type === 'export' ? 'Calendar Export' : 'Calendar Import'),
    status: 'active',
  };

  if (feed_type === 'export') {
    insertData.feed_token = feedToken;
    insertData.include_cancelled = include_cancelled ?? false;
    insertData.include_customer_info = include_customer_info ?? false;
    insertData.selected_listing_ids = selected_listing_ids || [];
  } else {
    insertData.source_url = source_url;
    insertData.assigned_listing_ids = assigned_listing_ids || [];
    insertData.conflict_handling = conflict_handling || 'skip';
    insertData.sync_frequency = sync_frequency || 'daily';
  }

  const { data, error } = await supabaseAdmin
    .from('tenant_ical_feeds')
    .insert(insertData)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to create feed' }, { status: 500 });

  await supabaseAdmin.rpc('log_integration_activity', {
    p_tenant_id: ctx.tenant_id,
    p_category: 'calendar',
    p_provider: 'ical',
    p_action: 'feed_created',
    p_status: 'success',
    p_message: `Created ${feed_type} feed: ${name || feed_type}`,
    p_metadata: { feed_id: data.id },
  });

  return NextResponse.json({ feed: data });
}
