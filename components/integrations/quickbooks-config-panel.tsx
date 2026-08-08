'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Loader2, AlertCircle, CheckCircle2, Save, Eye, EyeOff, Trash2, Calculator,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function QuickBooksConfigPanel({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [hasCreds, setHasCreds] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [companyId, setCompanyId] = useState('');

  const loadState = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tenant_integrations')
      .select('credentials, connection_status')
      .eq('tenant_id', tenantId)
      .eq('category', 'accounting')
      .eq('provider', 'quickbooks')
      .maybeSingle();

    if (data) {
      const creds = data.credentials as Record<string, string> | null;
      setHasCreds(!!(creds?.qb_client_id && creds?.qb_client_secret));
      setIsConnected(data.connection_status === 'connected');
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadState(); }, [loadState]);

  async function saveCredentials() {
    if (!clientId || !clientSecret) return;
    setSaving(true);
    setMessage(null);

    const credentials: Record<string, string> = {
      qb_client_id: clientId,
      qb_client_secret: clientSecret,
    };
    if (companyId) credentials.qb_company_id = companyId;

    const { data: existing } = await supabase
      .from('tenant_integrations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('category', 'accounting')
      .eq('provider', 'quickbooks')
      .maybeSingle();

    if (existing) {
      await supabase.from('tenant_integrations').update({
        credentials,
        connection_status: 'connecting',
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('tenant_integrations').insert({
        tenant_id: tenantId,
        category: 'accounting',
        provider: 'quickbooks',
        environment: 'production',
        connection_status: 'connecting',
        credentials,
        is_default: true,
        enabled: false,
      });
    }

    setHasCreds(true);
    setClientId('');
    setClientSecret('');
    setCompanyId('');
    setMessage({ type: 'success', text: 'QuickBooks credentials saved. Full OAuth sync is coming soon — your credentials are securely stored for when it launches.' });
    setSaving(false);
  }

  async function disconnect() {
    if (!confirm('Remove QuickBooks credentials?')) return;
    await supabase.from('tenant_integrations').update({
      connection_status: 'disconnected',
      enabled: false,
      credentials: null,
      updated_at: new Date().toISOString(),
    }).eq('tenant_id', tenantId).eq('category', 'accounting').eq('provider', 'quickbooks');
    setHasCreds(false);
    setIsConnected(false);
    setMessage({ type: 'success', text: 'QuickBooks credentials removed.' });
  }

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" /></div>;

  return (
    <div className="space-y-4">
      {message && (
        <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
          message.type === 'success' ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.12)] text-[#86EFAC]'
          : message.type === 'error' ? 'border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.12)] text-[#FB7185]'
          : 'border-[rgba(99,119,255,0.20)] bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)]')}>
          {message.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {hasCreds && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-[var(--text-primary)]" />
              <p className="text-sm font-medium text-[var(--text-primary)]">QuickBooks</p>
            </div>
            <Badge className="border-0 bg-[rgba(99,119,255,0.15)] text-[var(--brand-primary)] text-[10px]">Credentials Saved</Badge>
          </div>
          <div className="rounded-md bg-[var(--panel-bg)] border border-[var(--border-default)] p-3">
            <p className="text-[11px] text-[var(--text-muted)]">
              Your QuickBooks API credentials are securely stored. Full invoice sync and payment reconciliation are being developed and will activate automatically when ready.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={disconnect} className="text-xs text-destructive hover:text-destructive">
            <Trash2 className="mr-1 h-3 w-3" /> Remove Credentials
          </Button>
        </div>
      )}

      {!hasCreds && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Connect QuickBooks to automatically sync invoices and payment data from your bookings.
          </p>

          <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">QuickBooks API Credentials</p>

            <div className="rounded-md bg-[var(--card-bg)] border border-[var(--border-default)] p-3 space-y-2">
              <p className="text-[11px] font-medium text-[var(--text-secondary)]">How to get your credentials:</p>
              <ol className="text-[11px] text-[var(--text-muted)] space-y-1.5 list-decimal list-inside">
                <li>Go to <span className="text-[var(--brand-primary)] font-medium">developer.intuit.com</span> and sign in</li>
                <li>Create a new app (select <span className="font-medium text-[var(--text-secondary)]">QuickBooks Online and Payments</span>)</li>
                <li>Go to <span className="font-medium text-[var(--text-secondary)]">Keys &amp; credentials</span> in your app settings</li>
                <li>Copy the <span className="font-medium text-[var(--text-secondary)]">Client ID</span> and <span className="font-medium text-[var(--text-secondary)]">Client Secret</span></li>
                <li>Your <span className="font-medium text-[var(--text-secondary)]">Company ID</span> is in the URL when you open QuickBooks Online (the number after /app/)</li>
              </ol>
            </div>

            <div className="space-y-2">
              <div>
                <Label className="text-[11px] text-[var(--text-muted)]">Client ID *</Label>
                <Input type="text" value={clientId} onChange={e => setClientId(e.target.value)}
                  placeholder="ABxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="bg-[var(--card-bg)] text-xs font-mono" />
              </div>
              <div>
                <Label className="text-[11px] text-[var(--text-muted)]">Client Secret *</Label>
                <div className="relative">
                  <Input type={showSecret ? 'text' : 'password'} value={clientSecret} onChange={e => setClientSecret(e.target.value)}
                    placeholder="Your QuickBooks Client Secret" className="bg-[var(--card-bg)] text-xs font-mono pr-8" />
                  <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                    {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-[var(--text-muted)]">Company ID (optional)</Label>
                <Input type="text" value={companyId} onChange={e => setCompanyId(e.target.value)}
                  placeholder="123456789" className="bg-[var(--card-bg)] text-xs font-mono" />
              </div>
              <Button onClick={saveCredentials} disabled={saving || !clientId || !clientSecret}
                className="w-full bg-[var(--brand-primary)] text-white hover:bg-primary-hover text-xs">
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Save Credentials
              </Button>
            </div>

            <div className="rounded-md bg-[rgba(99,119,255,0.08)] border border-[rgba(99,119,255,0.20)] p-2">
              <p className="text-[10px] text-[var(--brand-primary)]">
                Invoice sync and payment reconciliation are in development. Save your credentials now — they will activate automatically when the feature launches.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
