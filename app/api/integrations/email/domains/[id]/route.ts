import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { removeResendDomain, isResendConfigured } from '@/lib/integrations/resend-server';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .eq('role', 'tenant_admin')
      .maybeSingle();

    if (!membership?.tenant_id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { data: domain } = await supabaseAdmin
      .from('tenant_email_domains')
      .select('*')
      .eq('id', params.id)
      .eq('tenant_id', membership.tenant_id)
      .maybeSingle();

    if (!domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    const { count: senderCount } = await supabaseAdmin
      .from('tenant_email_senders')
      .select('id', { count: 'exact', head: true })
      .eq('email_domain_id', domain.id)
      .eq('is_active', true)
      .is('archived_at', null);

    if ((senderCount || 0) > 0) {
      return NextResponse.json({
        error: 'Cannot remove domain with active senders. Archive senders first or select a replacement domain.',
      }, { status: 409 });
    }

    if (domain.provider_domain_id && isResendConfigured()) {
      await removeResendDomain(domain.provider_domain_id);
    }

    await supabaseAdmin
      .from('tenant_email_domains')
      .update({
        status: 'disabled',
        sending_enabled: false,
        is_default: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', domain.id);

    await supabaseAdmin.from('activity_log').insert({
      tenant_id: membership.tenant_id,
      entity_type: 'email_domain',
      entity_id: domain.id,
      action: 'domain_removed',
      actor_name: user.email || 'tenant_admin',
      metadata: { domain: domain.domain },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg.replace(/re_[a-zA-Z0-9_]+/g, '[REDACTED]') }, { status: 500 });
  }
}
