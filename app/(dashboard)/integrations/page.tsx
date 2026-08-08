'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CreditCard, Calendar, Mail, Calculator, Users, Zap, Plug, Code, Webhook,
  CheckCircle2, AlertCircle, Clock, XCircle, Loader2, ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EmailSetupCard } from '@/components/dashboard/email-setup-card';
import { IntegrationConfigDrawer, type DrawerEntry, type DrawerIntegration } from '@/components/integrations/config-drawer';

type TenantIntegration = {
  id: string; category: string; provider: string; environment: string;
  connection_status: string; external_account_id: string | null;
  capabilities: Record<string, unknown>; credentials: Record<string, unknown> | null;
  is_default: boolean; enabled: boolean;
  connected_at: string | null; last_synced_at: string | null;
  last_tested_at: string | null; last_success_at: string | null;
  last_error_at: string | null; last_error_message: string | null;
};

type CatalogEntry = {
  id: string; category: string; provider: string; display_name: string;
  description: string | null; icon: string; is_active: boolean; sort_order: number;
  is_coming_soon: boolean; connection_scope: string;
  tenant_configuration_mode: string;
};

const CATEGORY_ORDER = ['payments', 'communication', 'calendar', 'automation', 'accounting', 'crm', 'messaging'];
const CATEGORY_LABELS: Record<string, string> = {
  payments: 'Payments', communication: 'Email Delivery', calendar: 'Calendar',
  automation: 'Automation & Developer', accounting: 'Accounting', crm: 'CRM',
  messaging: 'Messaging',
};
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  payments: CreditCard, communication: Mail, calendar: Calendar,
  automation: Zap, accounting: Calculator, crm: Users, messaging: Mail,
};
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  payments: 'Accept online payments from customers.',
  communication: 'Send transactional and marketing emails.',
  calendar: 'Sync bookings with external calendar systems.',
  automation: 'Automate workflows and integrate with external systems.',
  accounting: 'Sync financial data with accounting software.',
  crm: 'Manage customer relationships.',
  messaging: 'Send SMS and WhatsApp messages.',
};

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: LucideIcon }> = {
  connected: { label: 'Connected', className: 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC] border border-[rgba(74,222,128,0.24)]', icon: CheckCircle2 },
  connecting: { label: 'Setup Required', className: 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D] border border-[rgba(251,191,36,0.24)]', icon: Clock },
  requires_action: { label: 'Action Required', className: 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D] border border-[rgba(251,191,36,0.24)]', icon: AlertCircle },
  not_configured: { label: 'Available', className: 'bg-[rgba(148,163,184,0.12)] text-[#DCE5F3] border border-[rgba(148,163,184,0.28)]', icon: Clock },
  disconnected: { label: 'Disconnected', className: 'bg-[rgba(148,163,184,0.08)] text-[#94A3B8] border border-[rgba(148,163,184,0.20)]', icon: XCircle },
  error: { label: 'Error', className: 'bg-destructive/15 text-destructive', icon: XCircle },
};

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, role, tenant, loading: authLoading } = useAuth();
  const [integrations, setIntegrations] = useState<TenantIntegration[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [providerReadiness, setProviderReadiness] = useState<Record<string, 'ready' | 'configuration_required' | 'degraded' | 'coming_soon' | 'disabled'>>({});
  const [loading, setLoading] = useState(true);
  const [drawerEntry, setDrawerEntry] = useState<DrawerEntry | null>(null);
  const [drawerIntegration, setDrawerIntegration] = useState<DrawerIntegration | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!tenant?.id) { setLoading(false); return; }
    const [intRes, catRes, statusRes] = await Promise.all([
      supabase.from('tenant_integrations').select('*').eq('tenant_id', tenant.id),
      supabase.from('integration_catalog').select('*').eq('is_active', true).order('sort_order').order('display_name'),
      fetch('/api/platform-providers-status').then(r => r.json()).catch(() => ({ providers: [] })),
    ]);
    setIntegrations((intRes.data || []) as TenantIntegration[]);
    setCatalog((catRes.data || []) as CatalogEntry[]);
    const readinessMap: Record<string, 'ready' | 'configuration_required' | 'degraded' | 'coming_soon' | 'disabled'> = {};
    for (const p of (statusRes.providers || [])) {
      readinessMap[`${p.category}::${p.provider}`] = p.status;
    }
    setProviderReadiness(readinessMap);
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role === 'super_admin') { router.push('/super-admin'); return; }
      loadData();
    }
  }, [authLoading, user, role, router, loadData]);

  // Handle Google OAuth callback status
  useEffect(() => {
    const googleStatus = searchParams.get('google_status');
    if (googleStatus) {
      const messages: Record<string, { type: 'success' | 'error' | 'info'; text: string }> = {
        connected: { type: 'success', text: 'Google Calendar connected successfully.' },
        denied: { type: 'error', text: 'Google authorization was denied.' },
        error: { type: 'error', text: 'An error occurred during Google authorization.' },
        token_error: { type: 'error', text: 'Failed to obtain Google authorization tokens.' },
        platform_error: { type: 'error', text: 'Google Calendar is not configured on the platform.' },
      };
      const msg = messages[googleStatus];
      if (msg) { setToast(msg); setTimeout(() => setToast(null), 5000); }
      router.replace('/integrations');
    }
  }, [searchParams, router]);

  // Handle Stripe onboarding return status
  useEffect(() => {
    const stripeStatus = searchParams.get('stripe_status');
    if (stripeStatus) {
      const messages: Record<string, { type: 'success' | 'error' | 'info'; text: string }> = {
        connected: { type: 'success', text: 'Stripe connected successfully. You can now accept payments.' },
        requires_action: { type: 'info', text: 'Stripe onboarding is incomplete. Click Continue Setup to finish.' },
        error: { type: 'error', text: 'An error occurred during Stripe onboarding. Please try again.' },
      };
      const msg = messages[stripeStatus];
      if (msg) { setToast(msg); setTimeout(() => setToast(null), 5000); }
      router.replace('/integrations');
    }
  }, [searchParams, router]);

  function openDrawer(entry: CatalogEntry) {
    const integration = integrations.find(i => i.category === entry.category && i.provider === entry.provider);
    setDrawerEntry({
      category: entry.category, provider: entry.provider,
      display_name: entry.display_name, description: entry.description,
      icon: entry.icon, is_coming_soon: entry.is_coming_soon,
      connection_scope: entry.connection_scope,
      tenantConfigurationMode: entry.tenant_configuration_mode as DrawerEntry['tenantConfigurationMode'],
    });
    setDrawerIntegration(integration ? {
      id: integration.id, connection_status: integration.connection_status,
      external_account_id: integration.external_account_id,
      capabilities: integration.capabilities, credentials: integration.credentials,
      is_default: integration.is_default,
      enabled: integration.enabled, last_synced_at: integration.last_synced_at,
      last_tested_at: integration.last_tested_at, last_success_at: integration.last_success_at,
      last_error_at: integration.last_error_at, last_error_message: integration.last_error_message,
    } : null);
  }

  function closeDrawer() {
    setDrawerEntry(null);
    setDrawerIntegration(null);
    loadData();
  }

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== 'tenant_admin') return null;

  const orderedCategories = CATEGORY_ORDER.filter(c => catalog.some(e => e.category === c));
  const connectedCount = integrations.filter(i => i.connection_status === 'connected' && i.enabled).length;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Integrations</h1>
        <p className="mt-1 text-sm text-[#9FAFC3]">Connect external services, configure sync settings, and manage your integrations.</p>
      </header>

      {/* Toast */}
      {toast && (
        <div className={cn('mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm',
          toast.type === 'success' ? 'border-success/20 bg-success/10 text-success'
          : toast.type === 'error' ? 'border-destructive/20 bg-destructive/10 text-destructive'
          : 'border-primary/20 bg-primary/10 text-primary')}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}

      <div className="max-w-5xl space-y-8">
        {/* Email Delivery — special section with EmailSetupCard */}
        <section className="space-y-3">
          <SectionHeader icon={Mail} label="Email Delivery" description="Send transactional and marketing emails through Resend." connectedCount={integrations.filter(i => i.category === 'communication' && i.connection_status === 'connected').length} />
          <EmailSetupCard />
        </section>

        {/* Catalog categories */}
        {orderedCategories.map(category => {
          if (category === 'communication') return null; // handled by EmailSetupCard
          const catEntries = catalog.filter(e => e.category === category);
          const CatIcon = CATEGORY_ICONS[category] || Plug;
          const catLabel = CATEGORY_LABELS[category] || category;
          const catDesc = CATEGORY_DESCRIPTIONS[category] || '';
          const catConnected = integrations.filter(i => i.category === category && i.connection_status === 'connected').length;

          return (
            <section key={category} className="space-y-3">
              <SectionHeader icon={CatIcon} label={catLabel} description={catDesc} connectedCount={catConnected} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {catEntries.map(entry => (
                  <ProviderCard
                    key={`${entry.category}-${entry.provider}`}
                    entry={entry}
                    integration={integrations.find(i => i.category === entry.category && i.provider === entry.provider) || null}
                    platformStatus={providerReadiness[`${entry.category}::${entry.provider}`] ?? 'ready'}
                    onClick={() => openDrawer(entry)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {catalog.length === 0 && (
          <div className="text-center py-12">
            <Plug className="h-10 w-10 text-[var(--text-muted)] mx-auto" />
            <p className="mt-2 text-sm text-[var(--text-muted)]">No integrations available yet.</p>
          </div>
        )}
      </div>

      {/* Configuration Drawer */}
      {drawerEntry && (
        <IntegrationConfigDrawer
          entry={drawerEntry}
          integration={drawerIntegration}
          tenantId={tenant!.id}
          platformStatus={providerReadiness[`${drawerEntry.category}::${drawerEntry.provider}`] ?? 'ready'}
          onClose={closeDrawer}
          onChanged={loadData}
        />
      )}
    </div>
  );
}

function SectionHeader({ icon: Icon, label, description, connectedCount }: { icon: LucideIcon; label: string; description: string; connectedCount: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#DCE5F3]">{label}</h2>
        {connectedCount > 0 && (
          <Badge className="border border-[rgba(74,222,128,0.24)] bg-[rgba(74,222,128,0.12)] text-[#86EFAC] text-[10px]">{connectedCount} Connected</Badge>
        )}
      </div>
      <p className="text-xs text-[#9FAFC3] hidden sm:block">{description}</p>
    </div>
  );
}

function ProviderCard({
  entry, integration, platformStatus, onClick,
}: {
  entry: CatalogEntry;
  integration: TenantIntegration | null;
  platformStatus: 'ready' | 'configuration_required' | 'degraded' | 'coming_soon' | 'disabled';
  onClick: () => void;
}) {
  const status = integration?.connection_status || 'not_configured';
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_configured;
  const StatusIcon = statusCfg.icon;
  const isComingSoon = entry.is_coming_soon || platformStatus === 'coming_soon';
  const isPlatformBlocked = false;
  const isDegraded = false;

  // Determine display status
  let displayStatus = statusCfg;
  if (isComingSoon) {
    displayStatus = { label: 'Coming Soon', className: 'bg-[rgba(148,163,184,0.08)] text-[#94A3B8] border border-[rgba(148,163,184,0.20)]', icon: Clock };
  } else if (isPlatformBlocked) {
    displayStatus = { label: 'Temporarily Unavailable', className: 'bg-[rgba(251,191,36,0.10)] text-[#FBBF24] border border-[rgba(251,191,36,0.24)]', icon: AlertCircle };
  } else if (isDegraded) {
    displayStatus = { label: 'Requires Attention', className: 'bg-[rgba(251,113,133,0.10)] text-[#FB7185] border border-[rgba(251,113,133,0.24)]', icon: AlertCircle };
  }

  const capabilities = integration?.capabilities as Record<string, unknown> || {};
  const lastSynced = integration?.last_synced_at || integration?.last_success_at;

  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex flex-col rounded-[18px] border bg-[var(--card-bg)] p-4 text-left shadow-sm transition-all hover:shadow-md hover:border-[rgba(99,119,255,0.34)]',
        isComingSoon ? 'opacity-75' : '',
        isPlatformBlocked && 'border-warning/20'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
            <ProviderIcon icon={entry.icon} />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{entry.display_name}</p>
            {entry.description && <p className="text-[11px] text-[#B6C2D3] line-clamp-1">{entry.description}</p>}
          </div>
        </div>
        <Badge className={cn('border-0 shrink-0', displayStatus.className)}>
          <displayStatus.icon className="mr-1 h-3 w-3" />
          {displayStatus.label}
        </Badge>
      </div>

      {/* Capabilities row for connected integrations */}
      {integration && !isComingSoon && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {entry.category === 'payments' && (
            <>
              {capabilities.charges_enabled && <Badge className="border border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.10)] text-[#86EFAC] text-[10px]">Charges</Badge>}
              {capabilities.payouts_enabled && <Badge className="border border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.10)] text-[#86EFAC] text-[10px]">Payouts</Badge>}
              {capabilities.requirements_pending && (capabilities.requirements_pending as string[]).length > 0 && (
                <Badge className="border border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.10)] text-[#FCD34D] text-[10px]">{(capabilities.requirements_pending as string[]).length} Pending</Badge>
              )}
            </>
          )}
          {lastSynced && (
            <span className="text-[10px] text-[#AAB6C8]">
              Last sync: {new Date(lastSynced).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {/* Action hint */}
      <div className="mt-auto pt-2 flex items-center justify-between">
        <span className="text-[11px] text-[#AAB6C8]">
          {isComingSoon ? 'Not yet available'
          : isPlatformBlocked ? 'Awaiting platform setup'
          : isDegraded ? 'Platform issue detected'
          : status === 'connected' ? 'Click to manage'
          : status === 'connecting' || status === 'requires_action' ? 'Click to continue setup'
          : 'Click to configure'}
        </span>
        <ChevronRight className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors" />
      </div>
    </button>
  );
}

function ProviderIcon({ icon }: { icon: string }) {
  const iconMap: Record<string, LucideIcon> = {
    CreditCard, Calendar, Mail, Calculator, Users, Zap, Plug, Code, Webhook,
  };
  const Icon = iconMap[icon] || Plug;
  return <Icon className="h-4 w-4 text-[var(--text-muted)]" />;
}
