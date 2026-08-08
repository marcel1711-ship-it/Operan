'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Mail, Loader2, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function EmailSetupCard() {
  const { tenant } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasTenantKey, setHasTenantKey] = useState(false);
  const [tenantFromEmail, setTenantFromEmail] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<{ ready: boolean; integration_status?: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!tenant?.id) { setLoading(false); return; }
    setLoading(true);

    const integrationRes = await supabase
      .from('tenant_integrations')
      .select('credentials, connection_status')
      .eq('tenant_id', tenant.id)
      .eq('category', 'communication')
      .eq('provider', 'resend')
      .maybeSingle();

    let readinessRes: { data: unknown } = { data: null };
    try {
      readinessRes = await supabase.rpc('check_tenant_email_readiness', { p_tenant_id: tenant.id });
    } catch {};

    if (integrationRes.data) {
      const creds = integrationRes.data.credentials as Record<string, string> | null;
      const connected = integrationRes.data.connection_status === 'connected';
      setHasTenantKey(connected && !!creds?.resend_api_key);
      setTenantFromEmail(creds?.resend_from_email || null);
    }

    setReadiness(readinessRes.data as typeof readiness);
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <Loader2 className="h-5 w-5 animate-spin text-[var(--text-secondary)]" />;
  }

  const isReady = hasTenantKey || readiness?.ready;

  return (
    <div className="rounded-[18px] border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[var(--text-muted)]" />
          <div>
            <p className="text-sm font-semibold text-foreground">Email Delivery</p>
            <p className="text-xs text-muted-foreground">Powered by Resend</p>
          </div>
        </div>
        <Badge className={cn('border-0', isReady ? 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC]' : 'bg-[var(--border-default)] text-[var(--text-secondary)]')}>
          {isReady ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertCircle className="mr-1 h-3 w-3" />}
          {isReady ? 'Connected' : 'Setup Required'}
        </Badge>
      </div>

      <div className="mt-3">
        {hasTenantKey ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-[#86EFAC]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>API key configured — email delivery active</span>
            </div>
            {tenantFromEmail && (
              <p className="text-[11px] text-muted-foreground ml-5.5">
                Sending from: <span className="text-foreground">{tenantFromEmail}</span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Add your Resend API key to enable email delivery. Click to configure.
          </p>
        )}
      </div>
    </div>
  );
}
