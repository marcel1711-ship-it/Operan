import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { createResendDomain, isResendConfigured } from '@/lib/integrations/resend-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { domain, region } = body as { domain?: string; region?: string };

    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    const normalizedDomain = domain.toLowerCase().trim();

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(normalizedDomain)) {
      return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
    }

    if (normalizedDomain === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(normalizedDomain)) {
      return NextResponse.json({ error: 'IP addresses and localhost are not allowed' }, { status: 400 });
    }

    if (normalizedDomain.endsWith('.internal') || normalizedDomain.endsWith('.local')) {
      return NextResponse.json({ error: 'Internal domains are not allowed' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabaseAdmin
      .from('tenant_members')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('role', 'tenant_admin')
      .maybeSingle();

    if (!membership?.tenant_id) {
      return NextResponse.json({ error: 'Not authorized — tenant admin required' }, { status: 403 });
    }

    const tenantId = membership.tenant_id;

    const { data: existing } = await supabaseAdmin
      .from('tenant_email_domains')
      .select('id, tenant_id')
      .ilike('domain', normalizedDomain)
      .neq('status', 'disabled')
      .maybeSingle();

    if (existing && existing.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'This domain is already in use by another account' }, { status: 409 });
    }

    if (existing && existing.tenant_id === tenantId) {
      return NextResponse.json({ error: 'You already have this domain configured' }, { status: 409 });
    }

    if (!isResendConfigured()) {
      const domainRecord = await supabaseAdmin
        .from('tenant_email_domains')
        .insert({
          tenant_id: tenantId,
          domain: normalizedDomain,
          status: 'domain_pending',
          created_by: user.id,
        })
        .select()
        .single();

      await supabaseAdmin.from('activity_log').insert({
        tenant_id: tenantId,
        entity_type: 'email_domain',
        entity_id: domainRecord.data?.id,
        action: 'domain_added',
        actor_name: user.email || 'tenant_admin',
        metadata: { domain: normalizedDomain, provider: 'resend', note: 'Provider not configured — domain created locally' },
      });

      return NextResponse.json({
        success: true,
        domain_id: domainRecord.data?.id,
        domain: normalizedDomain,
        status: 'domain_pending',
        dns_records: [],
        note: 'Resend provider not configured. DNS records will be available once the platform credential is set.',
      });
    }

    const result = await createResendDomain(normalizedDomain, region);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to create domain' }, { status: 502 });
    }

    const { data: domainRecord } = await supabaseAdmin
      .from('tenant_email_domains')
      .insert({
        tenant_id: tenantId,
        provider: 'resend',
        provider_domain_id: result.domain_id,
        domain: normalizedDomain,
        status: 'dns_required',
        dns_records: JSON.parse(JSON.stringify(result.records)),
        created_by: user.id,
        last_checked_at: new Date().toISOString(),
      })
      .select()
      .single();

    await supabaseAdmin.from('activity_log').insert({
      tenant_id: tenantId,
      entity_type: 'email_domain',
      entity_id: domainRecord?.id,
      action: 'domain_created',
      actor_name: user.email || 'tenant_admin',
      metadata: { domain: normalizedDomain, provider: 'resend', provider_domain_id: result.domain_id },
    });

    return NextResponse.json({
      success: true,
      domain_id: domainRecord?.id,
      domain: normalizedDomain,
      status: 'dns_required',
      dns_records: result.records,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg.replace(/re_[a-zA-Z0-9_]+/g, '[REDACTED]') }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabaseAdmin
      .from('tenant_members')
      .select('tenant_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership?.tenant_id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data: domains } = await supabaseAdmin
      .from('tenant_email_domains')
      .select('*')
      .eq('tenant_id', membership.tenant_id)
      .neq('status', 'disabled')
      .order('created_at', { ascending: false });

    const { data: senders } = await supabaseAdmin
      .from('tenant_email_senders')
      .select('*')
      .eq('tenant_id', membership.tenant_id)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    return NextResponse.json({ domains: domains || [], senders: senders || [] });
  } catch {
    return NextResponse.json({ error: 'Failed to load email configuration' }, { status: 500 });
  }
}
