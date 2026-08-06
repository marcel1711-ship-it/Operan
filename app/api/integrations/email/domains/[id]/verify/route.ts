import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { verifyResendDomain, isResendConfigured } from '@/lib/integrations/resend-server';

export async function POST(
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

    if (!isResendConfigured()) {
      return NextResponse.json({
        success: false,
        status: domain.status,
        error: 'Resend provider not configured. Verification requires the platform credential.',
      }, { status: 503 });
    }

    if (!domain.provider_domain_id) {
      return NextResponse.json({ error: 'No provider domain ID — domain was created locally' }, { status: 400 });
    }

    const result = await verifyResendDomain(domain.provider_domain_id);

    const newStatus = result.verified ? 'verified' : domain.status;
    const updateData: Record<string, unknown> = {
      status: newStatus,
      verification_status: result.status,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (result.verified) {
      updateData.verified_at = new Date().toISOString();
      updateData.sending_enabled = true;
    }

    await supabaseAdmin
      .from('tenant_email_domains')
      .update(updateData)
      .eq('id', domain.id);

    await supabaseAdmin.from('activity_log').insert({
      tenant_id: membership.tenant_id,
      entity_type: 'email_domain',
      entity_id: domain.id,
      action: result.verified ? 'domain_verified' : 'domain_verification_checked',
      actor_name: user.email || 'tenant_admin',
      metadata: { domain: domain.domain, provider_status: result.status },
    });

    return NextResponse.json({
      success: true,
      verified: result.verified,
      status: newStatus,
      verification_status: result.status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg.replace(/re_[a-zA-Z0-9_]+/g, '[REDACTED]') }, { status: 500 });
  }
}
