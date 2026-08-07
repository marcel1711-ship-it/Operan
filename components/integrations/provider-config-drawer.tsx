'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Loader2, CheckCircle2, AlertCircle, XCircle, Clock,
  RefreshCw, Zap, Shield, Copy, Check, ExternalLink,
  Server, Key, Globe, Webhook, Calendar, Mail,
  CreditCard, MessageSquare, Calculator, Plug,
  ChevronRight, Info, Users, type LucideIcon,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PlatformCredentialForm } from './platform-credential-form';

export type ProviderReadiness = {
  providerKey: string;
  displayName: string;
  category: string;
  description: string;
  status: 'ready' | 'configuration_required' | 'degraded' | 'coming_soon' | 'disabled';
  environment: 'test' | 'live' | null;
  connectionMode: 'platform_managed' | 'tenant_managed' | 'tenant_owned';
  platformConfigurationMode: 'oauth' | 'connect_onboarding' | 'credentials_form' | 'internal_setup' | 'environment_setup' | 'coming_soon';
  tenantConfigurationMode: 'oauth' | 'connect_onboarding' | 'credentials_form' | 'internal_setup' | 'environment_setup' | 'coming_soon';
  credentials: Array<{
    env_var: string;
    label: string;
    purpose: string;
    classification: 'server_only' | 'browser_safe';
    required: boolean;
    configured: boolean;
    where_to_obtain: string;
    where_to_configure: string;
    redeploy_required: boolean;
  }>;
  healthChecks: Array<{
    label: string;
    ok: boolean;
    hint: string;
  }>;
  callbackUrls: Array<{ label: string; url: string; description: string }>;
  webhookUrls: Array<{ label: string; url: string; description: string; required_events: string[] }>;
  tenantCapabilities: Array<{ label: string; description: string }>;
  blockers: string[];
  lastCheckedAt: string;
  setupInstructions: string[];
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

const STATUS_CONFIG: Record<ProviderReadiness['status'], {
  label: string;
  icon: LucideIcon;
  className: string;
}> = {
  ready: { label: 'Ready', icon: CheckCircle2, className: 'border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.12)] text-[#86EFAC]' },
  configuration_required: { label: 'Configuration Required', icon: AlertCircle, className: 'border-[rgba(251,191,36,0.24)] bg-[rgba(251,191,36,0.12)] text-[#FCD34D]' },
  degraded: { label: 'Degraded', icon: AlertCircle, className: 'border-[rgba(251,113,133,0.24)] bg-[rgba(251,113,133,0.12)] text-[#FB7185]' },
  coming_soon: { label: 'Coming Soon', icon: Clock, className: 'border-[rgba(148,163,184,0.20)] bg-[rgba(148,163,184,0.08)] text-[#94A3B8]' },
  disabled: { label: 'Disabled', icon: XCircle, className: 'border-[rgba(148,163,184,0.20)] bg-[rgba(148,163,184,0.08)] text-[#94A3B8]' },
};

export function ProviderConfigDrawer({
  provider,
  open,
  onOpenChange,
}: {
  provider: ProviderReadiness | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [rechecking, setRechecking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [currentProvider, setCurrentProvider] = useState<ProviderReadiness | null>(provider);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (provider) setCurrentProvider(provider);
  }, [provider]);

  const handleRecheck = useCallback(async () => {
    if (!currentProvider) return;
    setRechecking(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/platform-providers-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerKey: currentProvider.providerKey }),
      });
      const data = await res.json();
      if (data.provider) {
        setCurrentProvider(data.provider);
      }
    } catch {
      // keep existing state on error
    }
    setRechecking(false);
  }, [currentProvider]);

  const handleTest = useCallback(async () => {
    if (!currentProvider) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/platform-providers-status/test/${currentProvider.providerKey}`, {
        method: 'POST',
      });
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.message });
    } catch {
      setTestResult({ ok: false, message: 'Connection test failed to execute' });
    }
    setTesting(false);
  }, [currentProvider]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (!currentProvider && open) return null;
  if (!currentProvider) return null;

  const Icon = PROVIDER_ICONS[currentProvider.providerKey] || Plug;
  const statusCfg = STATUS_CONFIG[currentProvider.status];
  const StatusIcon = statusCfg.icon;
  const configuredCreds = currentProvider.credentials.filter(c => c.configured).length;
  const totalCreds = currentProvider.credentials.length;
  const passedChecks = currentProvider.healthChecks.filter(c => c.ok).length;
  const totalChecks = currentProvider.healthChecks.length;
  const isComingSoon = currentProvider.status === 'coming_soon';
  const canTest = !isComingSoon && currentProvider.status !== 'disabled';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl bg-[var(--card-bg)] border-l border-[var(--border-default)] p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-[var(--border-default)]">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-11 w-11 items-center justify-center rounded-xl',
                currentProvider.status === 'ready' ? 'bg-[rgba(74,222,128,0.12)]'
                : currentProvider.status === 'configuration_required' ? 'bg-[rgba(251,191,36,0.12)]'
                : 'bg-[var(--panel-bg)]'
              )}>
                <Icon className={cn(
                  'h-5 w-5',
                  currentProvider.status === 'ready' ? 'text-[#86EFAC]'
                  : currentProvider.status === 'configuration_required' ? 'text-[#FCD34D]'
                  : 'text-[var(--text-muted)]'
                )} />
              </div>
              <div>
                <SheetTitle className="text-base font-semibold text-[var(--text-primary)]">
                  {currentProvider.displayName}
                </SheetTitle>
                <SheetDescription className="text-xs text-[var(--text-muted)] mt-0.5">
                  {currentProvider.description}
                </SheetDescription>
              </div>
            </div>
            <Badge className={cn('border shrink-0', statusCfg.className)}>
              <StatusIcon className="mr-1 h-3 w-3" />
              {statusCfg.label}
            </Badge>
          </div>
        </SheetHeader>

        <div className="px-6 py-5 space-y-6">
          {/* 1. Provider Overview */}
          <Section icon={Info} title="Provider Overview">
            <div className="grid grid-cols-2 gap-3">
              <InfoRow label="Category" value={currentProvider.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
              <InfoRow label="Connection Mode" value={currentProvider.connectionMode === 'platform_managed' ? 'Platform-managed' : currentProvider.connectionMode === 'tenant_managed' ? 'Tenant-managed' : 'Tenant-owned'} />
              <InfoRow label="Platform Setup" value={formatMode(currentProvider.platformConfigurationMode)} />
              <InfoRow label="Tenant Setup" value={formatMode(currentProvider.tenantConfigurationMode)} />
              <InfoRow label="Environment" value={currentProvider.environment ? (currentProvider.environment === 'live' ? 'Live' : 'Test') : 'N/A'} />
              <InfoRow label="Last Checked" value={new Date(currentProvider.lastCheckedAt).toLocaleString()} />
            </div>
          </Section>

          {/* 2. Current Readiness Status */}
          <Section icon={Shield} title="Current Readiness Status">
            <div className={cn(
              'flex items-center gap-3 rounded-lg border p-3',
              currentProvider.status === 'ready' ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.06)]'
              : currentProvider.status === 'configuration_required' ? 'border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.06)]'
              : currentProvider.status === 'degraded' ? 'border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.06)]'
              : 'border-[var(--border-default)] bg-[var(--panel-bg)]'
            )}>
              <StatusIcon className={cn(
                'h-5 w-5 shrink-0',
                currentProvider.status === 'ready' ? 'text-[#86EFAC]'
                : currentProvider.status === 'configuration_required' ? 'text-[#FCD34D]'
                : currentProvider.status === 'degraded' ? 'text-[#FB7185]'
                : 'text-[var(--text-muted)]'
              )} />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{statusCfg.label}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {currentProvider.status === 'ready' && 'All required platform infrastructure exists and health checks pass.'}
                  {currentProvider.status === 'configuration_required' && 'Implementation exists, but required platform configuration is missing.'}
                  {currentProvider.status === 'degraded' && 'Configured, but one or more operational checks fail.'}
                  {currentProvider.status === 'coming_soon' && 'No usable backend flow exists yet.'}
                  {currentProvider.status === 'disabled' && 'Provider has been intentionally disabled.'}
                </p>
              </div>
            </div>
          </Section>

          {/* 3 & 4. Required Platform Credentials + Credential Form */}
          {!isComingSoon && totalCreds > 0 && (
            <Section icon={Key} title="Required Platform Credentials">
              <p className="text-xs text-[var(--text-muted)] mb-3">
                {configuredCreds} of {totalCreds} credentials configured. Enter credentials below — they are encrypted before storage and never displayed again after saving.
              </p>
              <PlatformCredentialForm providerKey={currentProvider.providerKey} />
              <div className="mt-3 space-y-2">
                {currentProvider.credentials.map(cred => (
                  <CredentialCard
                    key={cred.env_var}
                    cred={cred}
                    copiedKey={copiedKey}
                    onCopy={copyToClipboard}
                  />
                ))}
              </div>
            </Section>
          )}

          {!isComingSoon && totalCreds === 0 && (
            <Section icon={Key} title="Required Platform Credentials">
              <p className="text-xs text-[var(--text-muted)]">
                This provider does not require external platform credentials. Readiness is based on the internal OPERAN runtime.
              </p>
            </Section>
          )}

          {/* 5. Callback URLs */}
          {currentProvider.callbackUrls.length > 0 && (
            <Section icon={Globe} title="Callback URLs">
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Register these exact URLs in the external provider's configuration. Copy each URL carefully — they must match exactly.
              </p>
              <div className="space-y-2">
                {currentProvider.callbackUrls.map(cb => (
                  <div key={cb.label} className="rounded-lg border border-[var(--border-default)] bg-[var(--panel-bg)] p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">{cb.label}</span>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(cb.url, `cb-${cb.label}`)}
                        className="h-6 px-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        {copiedKey === `cb-${cb.label}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                    <code className="block text-[11px] font-mono text-[var(--brand-primary)] break-all">{cb.url}</code>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{cb.description}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 6. Webhook URLs */}
          {currentProvider.webhookUrls.length > 0 && (
            <Section icon={Webhook} title="Webhook URLs">
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Configure these endpoints in the external provider's webhook settings. Subscribe to all listed events.
              </p>
              <div className="space-y-2">
                {currentProvider.webhookUrls.map(wh => (
                  <div key={wh.label} className="rounded-lg border border-[var(--border-default)] bg-[var(--panel-bg)] p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-[var(--text-secondary)]">{wh.label}</span>
                      <Button size="sm" variant="ghost" onClick={() => copyToClipboard(wh.url, `wh-${wh.label}`)}
                        className="h-6 px-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        {copiedKey === `wh-${wh.label}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                    <code className="block text-[11px] font-mono text-[var(--brand-primary)] break-all">{wh.url}</code>
                    <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{wh.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {wh.required_events.map(ev => (
                        <Badge key={ev} className="text-[9px] border border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)]">
                          {ev}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 7. Setup Instructions */}
          <Section icon={Server} title="Setup Instructions">
            <ol className="space-y-2">
              {currentProvider.setupInstructions.map((step, idx) => (
                <li key={idx} className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--panel-bg)] text-[10px] font-medium text-[var(--text-muted)]">
                    {idx + 1}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)] leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </Section>

          {/* Vercel Configuration Guide */}
          {!isComingSoon && totalCreds > 0 && <VercelConfigGuide />}

          {/* 8. Health Checks */}
          <Section icon={Zap} title="Health Checks">
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {passedChecks} of {totalChecks} checks passed.
            </p>
            <div className="space-y-1.5">
              {currentProvider.healthChecks.map(check => (
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
                  {!check.ok && (
                    <span className="text-[10px] text-[var(--text-muted)] ml-auto truncate">{check.hint}</span>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* 9. Test Platform Connection */}
          {canTest && (
            <Section icon={Zap} title="Test Platform Connection">
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Perform a safe provider-level test to verify that the configured credentials are accepted by the provider API.
              </p>
              <Button size="sm" onClick={handleTest} disabled={testing}
                className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)]">
                {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
                Test Connection
              </Button>
              {testResult && (
                <div className={cn(
                  'mt-3 flex items-start gap-2 rounded-lg border p-3',
                  testResult.ok ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.06)]'
                  : 'border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.06)]'
                )}>
                  {testResult.ok
                    ? <CheckCircle2 className="h-4 w-4 text-[#86EFAC] shrink-0 mt-0.5" />
                    : <XCircle className="h-4 w-4 text-[#FB7185] shrink-0 mt-0.5" />}
                  <span className={cn('text-xs', testResult.ok ? 'text-[#86EFAC]' : 'text-[#FB7185]')}>
                    {testResult.message}
                  </span>
                </div>
              )}
            </Section>
          )}

          {/* 10. Tenant Capability Status */}
          <Section icon={Users} title="Tenant Capability Status">
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {currentProvider.status === 'ready'
                ? 'Tenants can connect and use this integration.'
                : currentProvider.status === 'coming_soon'
                ? 'This integration is not yet available to tenants.'
                : 'Tenants cannot connect until platform configuration is complete.'}
            </p>
            <div className="space-y-2">
              {currentProvider.tenantCapabilities.map(cap => (
                <div key={cap.label} className="flex items-start gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--panel-bg)] p-2.5">
                  <div className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full shrink-0 mt-0.5',
                    currentProvider.status === 'ready' ? 'bg-[rgba(74,222,128,0.12)]' : 'bg-[rgba(148,163,184,0.08)]'
                  )}>
                    {currentProvider.status === 'ready'
                      ? <CheckCircle2 className="h-3 w-3 text-[#86EFAC]" />
                      : <Clock className="h-3 w-3 text-[var(--text-muted)]" />}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[var(--text-primary)]">{cap.label}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{cap.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* 11. Remaining Blockers */}
          {currentProvider.blockers.length > 0 && (
            <Section icon={AlertCircle} title="Remaining Blockers">
              <div className="space-y-1.5">
                {currentProvider.blockers.map((blocker, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-lg border border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.06)] p-2.5">
                    <AlertCircle className="h-3.5 w-3.5 text-[#FCD34D] shrink-0 mt-0.5" />
                    <span className="text-xs text-[var(--text-secondary)]">{blocker}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Recheck Status Action */}
          <div className="sticky bottom-0 -mx-6 -mb-5 border-t border-[var(--border-default)] bg-[var(--card-bg)] px-6 py-4">
            <Button
              onClick={handleRecheck}
              disabled={rechecking}
              className="w-full bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)]"
            >
              {rechecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Recheck Status
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Sub-components ──

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#DCE5F3] mb-3">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--panel-bg)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="text-xs font-medium text-[var(--text-primary)] mt-0.5">{value}</p>
    </div>
  );
}

function formatMode(mode: string): string {
  switch (mode) {
    case 'oauth': return 'OAuth Redirect';
    case 'connect_onboarding': return 'Provider Onboarding';
    case 'credentials_form': return 'Credentials Form';
    case 'internal_setup': return 'Internal Setup';
    case 'environment_setup': return 'Environment Variables';
    case 'coming_soon': return 'Coming Soon';
    default: return mode;
  }
}

function CredentialCard({
  cred,
  copiedKey,
  onCopy,
}: {
  cred: ProviderReadiness['credentials'][number];
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  return (
    <div className={cn(
      'rounded-lg border p-3',
      cred.configured ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.04)]'
      : 'border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.04)]'
    )}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {cred.configured
            ? <CheckCircle2 className="h-3.5 w-3.5 text-[#86EFAC]" />
            : <XCircle className="h-3.5 w-3.5 text-[#FB7185]" />}
          <code className="text-[11px] font-mono text-[var(--text-primary)]">{cred.env_var}</code>
        </div>
        <div className="flex items-center gap-1.5">
          {cred.required ? (
            <Badge className="text-[9px] border border-[rgba(251,191,36,0.24)] bg-[rgba(251,191,36,0.10)] text-[#FCD34D]">Required</Badge>
          ) : (
            <Badge className="text-[9px] border border-[rgba(148,163,184,0.20)] bg-[rgba(148,163,184,0.08)] text-[#94A3B8]">Optional</Badge>
          )}
          <Badge className={cn(
            'text-[9px] border',
            cred.classification === 'server_only'
              ? 'border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.08)] text-[#FB7185]'
              : 'border-[rgba(99,119,255,0.20)] bg-[rgba(99,119,255,0.08)] text-[var(--brand-primary)]'
          )}>
            {cred.classification === 'server_only' ? 'Server-only' : 'Browser-safe'}
          </Badge>
        </div>
      </div>

      <p className="text-[11px] text-[var(--text-secondary)] mt-1.5">{cred.purpose}</p>

      <div className="mt-2 space-y-1">
        <div className="flex items-start gap-1.5">
          <span className="text-[10px] font-medium text-[var(--text-muted)] shrink-0 w-20">Obtain from:</span>
          <span className="text-[10px] text-[var(--text-secondary)]">{cred.where_to_obtain}</span>
        </div>
        <div className="flex items-start gap-1.5">
          <span className="text-[10px] font-medium text-[var(--text-muted)] shrink-0 w-20">Configure:</span>
          <span className="text-[10px] text-[var(--text-secondary)]">{cred.where_to_configure}</span>
        </div>
        {cred.redeploy_required && (
          <div className="flex items-start gap-1.5">
            <span className="text-[10px] font-medium text-[var(--text-muted)] shrink-0 w-20">After saving:</span>
            <span className="text-[10px] text-[#FCD34D]">Redeploy the application</span>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onCopy(cred.env_var, `cred-${cred.env_var}`)}
          className="h-6 px-2 text-[10px] border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          {copiedKey === `cred-${cred.env_var}` ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
          Copy variable name
        </Button>
        {cred.configured && (
          <span className="text-[10px] text-[#86EFAC] flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Configured
          </span>
        )}
      </div>
    </div>
  );
}

function VercelConfigGuide() {
  const steps = [
    'Open Vercel and select the OPERAN project.',
    'Go to Settings → Environment Variables.',
    'Add each listed variable with its value from the provider dashboard.',
    'Apply it to Preview and/or Production environments.',
    'Redeploy the application for the new variables to take effect.',
    'Return to OPERAN and click Recheck Status to verify.',
  ];

  return (
    <Section icon={ExternalLink} title="Vercel Configuration Guide">
      <div className="rounded-lg border border-[rgba(99,119,255,0.20)] bg-[rgba(99,119,255,0.04)] p-3">
        <p className="text-xs text-[var(--text-secondary)] mb-3">
          Because the application cannot securely write environment variables from the browser, follow these steps to add each missing credential:
        </p>
        <ol className="space-y-1.5">
          {steps.map((step, idx) => (
            <li key={idx} className="flex gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-[9px] font-bold text-white">
                {idx + 1}
              </span>
              <span className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}


