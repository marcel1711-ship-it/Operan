import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email_domain_id, sender_name, from_email, reply_to_email, is_default } = body as {
      email_domain_id?: string;
      sender_name?: string;
      from_email?: string;
      reply_to_email?: string;
      is_default?: boolean;
    };

    if (!email_domain_id || !sender_name || !from_email) {
      return NextResponse.json({ error: 'Domain, sender name, and from email are required' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from_email)) {
      return NextResponse.json({ error: 'Invalid from email format' }, { status: 400 });
    }

    if (reply_to_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reply_to_email)) {
      return NextResponse.json({ error: 'Invalid reply-to email format' }, { status: 400 });
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
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const tenantId = membership.tenant_id;

    const { data: domain } = await supabaseAdmin
      .from('tenant_email_domains')
      .select('domain, status')
      .eq('id', email_domain_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    if (domain.status !== 'verified' && domain.status !== 'ready') {
      return NextResponse.json({ error: 'Domain must be verified before creating senders' }, { status: 400 });
    }

    const fromDomain = from_email.split('@')[1].toLowerCase();
    if (fromDomain !== domain.domain.toLowerCase()) {
      return NextResponse.json({ error: 'From email must belong to the selected domain' }, { status: 400 });
    }

    if (is_default) {
      await supabaseAdmin
        .from('tenant_email_senders')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('is_default', true);
    }

    const { data: sender, error } = await supabaseAdmin
      .from('tenant_email_senders')
      .insert({
        tenant_id: tenantId,
        email_domain_id,
        sender_name,
        from_email: from_email.toLowerCase(),
        reply_to_email: reply_to_email?.toLowerCase() || null,
        is_default: is_default ?? false,
        is_active: true,
        verification_status: 'ready',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (is_default) {
      await supabaseAdmin
        .from('tenant_email_domains')
        .update({ status: 'ready', is_default: true, updated_at: new Date().toISOString() })
        .eq('id', email_domain_id);
    }

    await supabaseAdmin.from('activity_log').insert({
      tenant_id: tenantId,
      entity_type: 'email_sender',
      entity_id: sender?.id,
      action: 'sender_created',
      actor_name: user.email || 'tenant_admin',
      metadata: { from_email, domain: domain.domain },
    });

    return NextResponse.json({ success: true, sender });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
