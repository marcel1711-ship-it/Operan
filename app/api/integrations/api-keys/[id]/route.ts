import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { requireTenantAdmin } from '@/lib/integrations/api-auth';

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const keyId = url.pathname.split('/').pop();
  const tenantId = url.searchParams.get('tenant_id') || '';

  const auth = await requireTenantAdmin(req, { tenant_id: tenantId });
  if (auth instanceof NextResponse) return auth;
  const ctx = auth as { tenant_id: string };

  // Soft-revoke: set revoked_at timestamp
  const { error } = await supabaseAdmin
    .from('tenant_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('tenant_id', ctx.tenant_id)
    .is('revoked_at', null);

  if (error) return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 });

  await supabaseAdmin.rpc('log_integration_activity', {
    p_tenant_id: ctx.tenant_id,
    p_category: 'automation',
    p_provider: 'api_access',
    p_action: 'key_revoked',
    p_status: 'info',
    p_message: `Revoked API key`,
    p_metadata: { key_id: keyId },
  });

  return NextResponse.json({ success: true });
}
