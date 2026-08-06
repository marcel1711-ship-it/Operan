'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CreditCard, Loader2, CheckCircle2, AlertCircle, XCircle,
  RefreshCw, Zap, Shield, Clock,
  Calendar, MessageSquare, Mail, Calculator, Plug,
  Key, Webhook, Settings,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  ProviderConfigDrawer,
  type ProviderReadiness,
} from '@/components/integrations/provider-config-drawer';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from '@/lib/integrations/provider-definitions';

type PlatformFeeConfig = {
  id: string;
  fee_type: 'percentage' | 'fixed' | 'none';
  fee_percentage: number;
  fee_fixed_amount: number;
  fee_currency: string;
  apply_to: string;
};

const PROVIDER_ICONS: Record<string, LucideIcon> = {
  stripe: CreditCard,
  resend: Mail,
  google_calendar: Calendar,
  ical: Calendar,
  webhooks: Webhook,
  api_access: Key,
  twilio: MessageSquare,
  twilio_whatsapp: MessageSquare,
  meta_whatsapp: MessageSquare,
  quickbooks: Calculator,
};

export default function SuperAdminIntegrationsPage() {
  const [providers, setProviders] = useState<ProviderReadiness[]>([]);
  const [feeConfig, setFeeConfig] = useState<PlatformFeeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [feeForm, setFeeForm] = useState({ fee_type: 'percentage', fee_percentage: '0', fee_fixed_amount: '0' });
  const [savingFees, setSavingFees] = useState(false);
  const [drawerProvider, setDrawerProvider] = useState<ProviderReadiness | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [statusRes, feeRes] = await Promise.all([
      fetch('/api/platform-providers-status').then(r => r.json()).catch(() => ({ providers: [] })),
      supabase.from('platform_fee_config').select('*').maybeSingle(),
    ]);
    setProviders((statusRes.providers || []) as ProviderReadiness[]);
    if (feeRes.data) {
      const fee = feeRes.data as PlatformFeeConfig;
      setFeeConfig(fee);
      setFeeForm({ fee_type: fee.fee_type, fee_percentage: String(fee.fee_percentage), fee_fixed_amount: String(fee.fee_fixed_amount) });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function saveFees() {
    setSavingFees(true);
    const payload = {
      fee_type: feeForm.fee_type,
      fee_percentage: parseFloat(feeForm.fee_percentage) || 0,
      fee_fixed_amount: parseFloat(feeForm.fee_fixed_amount) || 0,
      fee_currency: 'USD',
      apply_to: 'all_providers',
      updated_at: new Date().toISOString(),
    };
    if (feeConfig) {
      const { error } = await supabase.from('platform_fee_config').update(payload).eq('id', feeConfig.id);
      if (error) { setMessage({ type: 'error', text: error.message }); setSavingFees(false); return; }
    } else {
      const { error } = await supabase.from('platform_fee_config').insert(payload);
      if (error) { setMessage({ type: 'error', text: error.message }); setSavingFees(false); return; }
    }
    setMessage({ type: 'success', text: 'Platform fee configuration saved.' });
    setSavingFees(false);
    await loadData();
  }

  function openDrawer(provider: ProviderReadiness) {
    setDrawerProvider(provider);
    setDrawerOpen(true);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  const groupedByCategory = CATEGORY_ORDER
    .map(cat => ({ category: cat, items: providers.filter(p => p.category === cat) }))
    .filter(g => g.items.length > 0);

  const readyCount = providers.filter(p => p.status === 'ready').length;
  const requiredCount = providers.filter(p => p.status === 'configuration_required').length;
  const degradedCount = providers.filter(p => p.status === 'degraded').length;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Platform Infrastructure</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Configure platform-level credentials for each integration provider. Each provider is independent —
          configuring one does not affect others. Click any provider&apos;s Configure button for a complete setup guide.
        </p>
      </header>

      {message && (
        <div className={cn(
          'mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm',
          message.type === 'success' ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.12)] text-[#86EFAC]'
          : message.type === 'error' ? 'border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.12)] text-[#FB7185]'
          : 'border-[rgba(99,119,255,0.20)] bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)]'
        )}>
          {message.type === 'success' && <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />}
          {message.type === 'error' && <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          {message.type === 'info' && <Clock className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Summary bar */}
      <div className="mb-6 flex items-center gap-4 rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] px-5 py-3">
        <SummaryStat icon={CheckCircle2} count={readyCount} label="Ready" color="green" />
        <div className="h-8 w-px bg-[var(--border-default)]" />
        <SummaryStat icon={AlertCircle} count={requiredCount} label="Configuration Required" color="amber" />
        {degradedCount > 0 && (
          <>
            <div className="h-8 w-px bg-[var(--border-default)]" />
            <SummaryStat icon={AlertCircle} count={degradedCount} label="Degraded" color="red" />
          </>
        )}
        <div className="h-8 w-px bg-[var(--border-default)]" />
        <SummaryStat icon={Clock} count={providers.length} label="Total Providers" color="muted" />
        <div className="ml-auto">
          <Button size="sm" variant="outline" onClick={() => loadData()} className="border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--panel-bg)]">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="max-w-4xl space-y-8">
        {/* Independent provider cards grouped by category */}
        {groupedByCategory.map(({ category, items }) => (
          <section key={category} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#DCE5F3]">
                {CATEGORY_LABELS[category] || category}
              </h2>
              <span className="text-xs text-[var(--text-muted)]">{items.length} provider{items.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {items.map(provider => (
                <ProviderCard
                  key={provider.providerKey}
                  provider={provider}
                  onConfigure={() => openDrawer(provider)}
                />
              ))}
            </div>
          </section>
        ))}

        {/* Platform Fee Configuration */}
        {providers.some(p => p.category === 'payments') && (
          <section className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <Zap className="h-4 w-4 text-[var(--brand-primary)]" />
              Platform Fee Configuration
            </h2>
            <p className="mb-4 text-sm text-[var(--text-secondary)]">
              Configure the platform fee applied to tenant booking transactions. This fee is collected
              from the tenant&apos;s payment processing and sent to the platform account.
            </p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-[var(--text-secondary)]">Fee Type</Label>
                <Select value={feeForm.fee_type} onValueChange={(v) => setFeeForm({ ...feeForm, fee_type: v })}>
                  <SelectTrigger className="bg-[var(--card-bg)]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Platform Fee</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {feeForm.fee_type === 'percentage' && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Fee Percentage (%)</Label>
                  <Input type="number" value={feeForm.fee_percentage}
                    onChange={(e) => setFeeForm({ ...feeForm, fee_percentage: e.target.value })}
                    className="bg-[var(--card-bg)]" placeholder="e.g. 2.5" />
                </div>
              )}
              {feeForm.fee_type === 'fixed' && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-[var(--text-secondary)]">Fixed Fee Amount (USD)</Label>
                  <Input type="number" value={feeForm.fee_fixed_amount}
                    onChange={(e) => setFeeForm({ ...feeForm, fee_fixed_amount: e.target.value })}
                    className="bg-[var(--card-bg)]" placeholder="e.g. 5.00" />
                </div>
              )}
              <Button size="sm" onClick={saveFees} disabled={savingFees}
                className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)]">
                {savingFees ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                Save Fee Configuration
              </Button>
            </div>
          </section>
        )}

        {/* Tenant Connection Health Overview */}
        <TenantIntegrationHealth />
      </div>

      {/* Unified Provider Configuration Drawer */}
      <ProviderConfigDrawer
        provider={drawerProvider}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}

function SummaryStat({ icon: Icon, count, label, color }: {
  icon: LucideIcon; count: number; label: string; color: 'green' | 'amber' | 'red' | 'muted';
}) {
  const colorClasses = {
    green: 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC]',
    amber: 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D]',
    red: 'bg-[rgba(251,113,133,0.12)] text-[#FB7185]',
    muted: 'bg-[var(--panel-bg)] text-[var(--text-muted)]',
  };
  return (
    <div className="flex items-center gap-2">
      <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', colorClasses[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{count}</p>
        <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      </div>
    </div>
  );
}

// ---- Independent Provider Card ----

function ProviderCard({
  provider,
  onConfigure,
}: {
  provider: ProviderReadiness;
  onConfigure: () => void;
}) {
  const Icon = PROVIDER_ICONS[provider.providerKey] || Plug;
  const isReady = provider.status === 'ready';
  const isComingSoon = provider.status === 'coming_soon';
  const isDegraded = provider.status === 'degraded';
  const needsConfig = provider.status === 'configuration_required';

  const passedChecks = provider.healthChecks.filter(c => c.ok).length;
  const totalChecks = provider.healthChecks.length;
  const configuredCreds = provider.credentials.filter(c => c.configured).length;
  const totalCreds = provider.credentials.length;

  return (
    <div className={cn(
      'flex flex-col rounded-[18px] border bg-[var(--card-bg)] p-5 shadow-sm transition-all',
      isReady ? 'border-[var(--border-default)]'
      : needsConfig ? 'border-[rgba(251,191,36,0.24)]'
      : isDegraded ? 'border-[rgba(251,113,133,0.24)]'
      : 'border-[var(--border-default)]'
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            isReady ? 'bg-[rgba(74,222,128,0.12)]'
            : needsConfig ? 'bg-[rgba(251,191,36,0.12)]'
            : isDegraded ? 'bg-[rgba(251,113,133,0.12)]'
            : 'bg-[var(--panel-bg)]'
          )}>
            <Icon className={cn(
              'h-5 w-5',
              isReady ? 'text-[#86EFAC]'
              : needsConfig ? 'text-[#FCD34D]'
              : isDegraded ? 'text-[#FB7185]'
              : 'text-[var(--text-muted)]'
            )} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{provider.displayName}</h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {provider.connectionMode === 'platform_managed' ? 'Platform-managed' : 'Tenant-managed'}
              {provider.environment ? ` · ${provider.environment === 'live' ? 'Live' : 'Test'}` : ''}
            </p>
          </div>
        </div>
        <StatusBadge status={provider.status} />
      </div>

      {/* Description */}
      <p className="text-xs text-[var(--text-secondary)] mb-3 line-clamp-2">{provider.description}</p>

      {/* Health checks summary */}
      <div className="space-y-1.5 mb-4">
        {provider.healthChecks.slice(0, 4).map(check => (
          <div key={check.label} className="flex items-center gap-2">
            <div className={cn(
              'flex h-4 w-4 items-center justify-center rounded-full shrink-0',
              check.ok ? 'bg-[rgba(74,222,128,0.12)]' : 'bg-[rgba(251,113,133,0.10)]'
            )}>
              {check.ok
                ? <CheckCircle2 className="h-2.5 w-2.5 text-[#86EFAC]" />
                : <XCircle className="h-2.5 w-2.5 text-[#FB7185]" />}
            </div>
            <span className={cn('text-xs', check.ok ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]')}>
              {check.label}
            </span>
          </div>
        ))}
        {provider.healthChecks.length > 4 && (
          <p className="text-[10px] text-[var(--text-muted)] pl-6">
            +{provider.healthChecks.length - 4} more checks
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between border-t border-[var(--border-default)] pt-3">
        <span className="text-[11px] text-[var(--text-muted)]">
          {isComingSoon ? 'Not yet available'
          : isReady ? `${passedChecks}/${totalChecks} checks passed`
          : totalCreds > 0 ? `${configuredCreds}/${totalCreds} credentials set`
          : `${passedChecks}/${totalChecks} checks passed`}
        </span>
        <Button size="sm" variant="outline" onClick={onConfigure}
          className="border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--panel-bg)]">
          <Settings className="mr-1.5 h-3.5 w-3.5" />
          {isReady ? 'Manage' : 'Configure'}
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ProviderReadiness['status'] }) {
  if (status === 'ready') {
    return (
      <Badge className="border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.12)] text-[#86EFAC]">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Ready
      </Badge>
    );
  }
  if (status === 'configuration_required') {
    return (
      <Badge className="border border-[rgba(251,191,36,0.24)] bg-[rgba(251,191,36,0.12)] text-[#FCD34D]">
        <AlertCircle className="mr-1 h-3 w-3" />
        Configuration Required
      </Badge>
    );
  }
  if (status === 'degraded') {
    return (
      <Badge className="border border-[rgba(251,113,133,0.24)] bg-[rgba(251,113,133,0.12)] text-[#FB7185]">
        <AlertCircle className="mr-1 h-3 w-3" />
        Degraded
      </Badge>
    );
  }
  return (
    <Badge className="border border-[rgba(148,163,184,0.20)] bg-[rgba(148,163,184,0.08)] text-[#94A3B8]">
      <Clock className="mr-1 h-3 w-3" />
      Coming Soon
    </Badge>
  );
}

// ---- Tenant Integration Health ----

function TenantIntegrationHealth() {
  const [tenants, setTenants] = useState<Array<{
    id: string; name: string; slug: string; plan: string;
    integrations?: Array<{ category: string; provider: string; connection_status: string; enabled: boolean }>;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [tenantRes, intRes] = await Promise.all([
        supabase.from('tenants').select('id, name, slug, plan').order('name'),
        supabase.from('tenant_integrations').select('id, tenant_id, category, provider, connection_status, enabled'),
      ]);
      const ints = intRes.data || [];
      const mapped = (tenantRes.data || []).map((t: any) => ({
        ...t,
        integrations: ints.filter((i: any) => i.tenant_id === t.id),
      }));
      setTenants(mapped);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-[var(--text-secondary)]" />;

  return (
    <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <Shield className="h-4 w-4 text-[var(--brand-primary)]" />
        Tenant Integration Health
      </h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Overview of each tenant&apos;s integration connections across all categories. Super Admin can view health
        but cannot see tenant credentials, tokens, or bank details.
      </p>
      {tenants.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No tenants yet.</p>
      ) : (
        <div className="space-y-2">
          {tenants.map((t) => {
            const active = t.integrations?.filter(i => i.connection_status === 'connected' && i.enabled) || [];
            const pending = t.integrations?.filter(i => i.connection_status !== 'connected' && i.connection_status !== 'not_configured' && i.connection_status !== 'disconnected') || [];
            return (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--panel-bg)] px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{t.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)] capitalize">{t.plan} plan · {t.integrations?.length || 0} integration(s)</p>
                </div>
                <div className="flex items-center gap-2">
                  {active.length > 0 && (
                    <Badge className="border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.12)] text-[#86EFAC]">{active.length} Active</Badge>
                  )}
                  {pending.length > 0 && (
                    <Badge className="border border-[rgba(251,191,36,0.24)] bg-[rgba(251,191,36,0.12)] text-[#FCD34D]">{pending.length} Pending</Badge>
                  )}
                  {(!t.integrations || t.integrations.length === 0) && (
                    <Badge className="border border-[rgba(148,163,184,0.20)] bg-[rgba(148,163,184,0.08)] text-[#94A3B8]">No Integrations</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
