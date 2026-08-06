'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  X, Loader2, AlertCircle, CheckCircle2, XCircle, RefreshCw, Trash2,
  Link2, ExternalLink, Clock, Zap, TestTube, History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { IcalConfigPanel } from './ical-config-panel';
import { WebhooksConfigPanel } from './webhooks-config-panel';
import { ApiKeysConfigPanel } from './api-keys-config-panel';
import { GoogleCalendarConfigPanel } from './google-calendar-config-panel';
import { ResendConfigPanel } from './resend-config-panel';
import { supabase } from '@/lib/supabase';

export type DrawerEntry = {
  category: string;
  provider: string;
  display_name: string;
  description: string | null;
  icon: string;
  is_coming_soon: boolean;
  connection_scope: string;
  tenantConfigurationMode: 'oauth' | 'connect_onboarding' | 'credentials_form' | 'internal_setup' | 'environment_setup' | 'coming_soon';
};

export type DrawerIntegration = {
  id: string;
  connection_status: string;
  external_account_id: string | null;
  capabilities: Record<string, unknown>;
  is_default: boolean;
  enabled: boolean;
  last_synced_at: string | null;
  last_tested_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
};

export function IntegrationConfigDrawer({
  entry, integration, tenantId, platformStatus, onClose, onChanged,
}: {
  entry: DrawerEntry;
  integration: DrawerIntegration | null;
  tenantId: string;
  platformStatus: 'ready' | 'configuration_required' | 'degraded' | 'coming_soon' | 'disabled';
  onClose: () => void;
  onChanged: () => void;
}) {
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<Array<{ id: string; action: string; status: string; message: string | null; created_at: string }>>([]);

  const status = integration?.connection_status || 'not_configured';
  const isConfigured = status === 'connected' || status === 'connecting' || status === 'requires_action';
  const isComingSoon = entry.is_coming_soon || platformStatus === 'coming_soon' || entry.tenantConfigurationMode === 'coming_soon';
  const isPlatformBlocked = platformStatus === 'configuration_required' && !isComingSoon;
  const isDegraded = platformStatus === 'degraded' && !integration;

  const loadLogs = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`/api/integrations/activity-logs?tenant_id=${tenantId}&category=${entry.category}&provider=${entry.provider}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setLogs(data.logs || []);
  }, [tenantId, entry.category, entry.provider]);

  useEffect(() => {
    if (showLogs) loadLogs();
  }, [showLogs, loadLogs]);

  async function connectStripe() {
    setActionLoading(true);
    setMessage(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/stripe-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, action: 'connect' }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: data.error }); setActionLoading(false); return; }
      window.location.href = data.onboarding_url;
    } catch {
      setMessage({ type: 'error', text: 'Failed to start Stripe connection.' });
      setActionLoading(false);
    }
  }

  async function continueStripe() {
    setActionLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/stripe-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, action: 'continue' }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: data.error }); setActionLoading(false); return; }
      window.location.href = data.onboarding_url;
    } catch {
      setMessage({ type: 'error', text: 'Failed to continue onboarding.' });
      setActionLoading(false);
    }
  }

  async function refreshStripe() {
    setActionLoading(true);
    setMessage(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/stripe-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, action: 'refresh' }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: data.error }); setActionLoading(false); return; }
      setMessage({ type: 'success', text: 'Status refreshed.' });
      onChanged();
    } catch {
      setMessage({ type: 'error', text: 'Failed to refresh status.' });
    }
    setActionLoading(false);
  }

  async function disconnectStripe() {
    if (!confirm('Disconnect your Stripe account? Existing payment records will remain, but new online payments will stop.')) return;
    setActionLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      await fetch('/api/stripe-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, action: 'disconnect' }),
      });
      setMessage({ type: 'success', text: 'Stripe account disconnected.' });
      onChanged();
    } catch {
      setMessage({ type: 'error', text: 'Failed to disconnect.' });
    }
    setActionLoading(false);
  }

  async function testConnection() {
    setActionLoading(true);
    setMessage(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/integrations/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, category: entry.category, provider: entry.provider }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: 'Connection test successful.' });
        onChanged();
      } else {
        setMessage({ type: 'error', text: result.error || result.details?.message || 'Connection test failed.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'We could not verify this connection. Please try again.' });
    }
    setActionLoading(false);
  }

  async function toggleEnabled(enabled: boolean) {
    if (!integration) return;
    await supabase
      .from('tenant_integrations')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('id', integration.id);
    onChanged();
  }

  // Render the appropriate config panel based on provider and configuration mode
  function renderConfigPanel() {
    // Never render a config panel for coming_soon providers
    if (entry.tenantConfigurationMode === 'coming_soon') return null;

    if (entry.category === 'calendar' && entry.provider === 'ical') {
      return <IcalConfigPanel tenantId={tenantId} onClose={onClose} />;
    }
    if (entry.category === 'automation' && entry.provider === 'webhooks') {
      return <WebhooksConfigPanel tenantId={tenantId} />;
    }
    if (entry.category === 'automation' && entry.provider === 'api_access') {
      return <ApiKeysConfigPanel tenantId={tenantId} />;
    }
    if (entry.category === 'calendar' && entry.provider === 'google_calendar') {
      return <GoogleCalendarConfigPanel tenantId={tenantId} platformStatus={platformStatus} />;
    }
    if (entry.category === 'communication' && entry.provider === 'resend') {
      return <ResendConfigPanel tenantId={tenantId} />;
    }
    return null;
  }

  const capabilities = integration?.capabilities as Record<string, unknown> || {};
  const chargesEnabled = capabilities.charges_enabled as boolean | undefined;
  const payoutsEnabled = capabilities.payouts_enabled as boolean | undefined;
  const requirementsPending = capabilities.requirements_pending as string[] | undefined;
  const defaultCurrency = capabilities.default_currency as string | undefined;
  const detailsSubmitted = capabilities.details_submitted as boolean | undefined;
  const accountId = integration?.external_account_id;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 h-full w-full max-w-[600px] overflow-y-auto bg-[var(--card-bg)] shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-[var(--border-default)] bg-[var(--card-bg)] px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{entry.display_name}</h2>
              <p className="text-xs text-[var(--text-muted)]">{entry.description}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-5">
          {message && (
            <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
              message.type === 'success' ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.12)] text-[#86EFAC]'
              : message.type === 'error' ? 'border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.12)] text-[#FB7185]'
              : 'border-[rgba(99,119,255,0.20)] bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)]')}>
              {message.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              : message.type === 'error' ? <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              : <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
              <span>{message.text}</span>
            </div>
          )}

          {/* Coming Soon */}
          {isComingSoon && (
            <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[var(--text-muted)]" />
                <p className="text-sm font-semibold text-[var(--text-secondary)]">Coming Soon</p>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                This integration is being prepared and is not yet available for connection.
                We are working to make it available soon. Check back later or contact support for updates.
              </p>
            </div>
          )}

          {/* Platform blocked */}
          {isPlatformBlocked && (
            <div className="rounded-lg border border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.12)] p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-[#FCD34D]" />
                <p className="text-xs font-semibold text-[#FCD34D]">Provider temporarily unavailable</p>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                The OPERAN platform configuration for {entry.display_name} has not been completed yet.
                Your other integrations remain available.
              </p>
            </div>
          )}

          {/* Platform degraded */}
          {isDegraded && (
            <div className="rounded-lg border border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.12)] p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-[#FB7185]" />
                <p className="text-xs font-semibold text-[#FB7185]">Provider requires attention</p>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                The platform connection exists, but one or more {entry.display_name} services are currently unavailable.
                Please try again later or contact support if the issue persists.
              </p>
            </div>
          )}

          {/* Stripe config */}
          {entry.category === 'payments' && entry.provider === 'stripe' && !isComingSoon && !isPlatformBlocked && !isDegraded && (
            <div className="space-y-4">
              {/* Status */}
              <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">Account Status</p>
                  <StatusBadge status={status} />
                </div>
                {isConfigured && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <InfoCell label="Charges" value={chargesEnabled ? 'Enabled' : 'Disabled'} ok={chargesEnabled} />
                    <InfoCell label="Payouts" value={payoutsEnabled ? 'Enabled' : 'Disabled'} ok={payoutsEnabled} />
                    <InfoCell label="Details" value={detailsSubmitted ? 'Submitted' : 'Pending'} ok={detailsSubmitted} />
                    <InfoCell label="Currency" value={defaultCurrency || 'USD'} />
                  </div>
                )}
                {accountId && (
                  <div className="mt-2 rounded-md bg-[var(--card-bg)] border border-[var(--border-default)] p-2">
                    <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">Connected Account</p>
                    <p className="font-mono text-[11px] text-[var(--text-secondary)] mt-0.5">
                      {accountId.substring(0, 8)}••••••••{accountId.substring(accountId.length - 4)}
                    </p>
                  </div>
                )}
                {requirementsPending && requirementsPending.length > 0 && (
                  <div className="mt-2 rounded-md border border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.12)] p-2">
                    <p className="text-[10px] font-medium text-amber-800">Outstanding Requirements ({requirementsPending.length})</p>
                    <ul className="mt-1 text-[10px] text-amber-700 space-y-0.5">
                      {requirementsPending.slice(0, 5).map(r => <li key={r}>- {r}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {/* Enable/disable toggle */}
              {status === 'connected' && (
                <div className="flex items-center justify-between rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-3">
                  <div>
                    <p className="text-xs font-medium text-[var(--text-primary)]">Accept Online Payments</p>
                    <p className="text-[10px] text-[var(--text-muted)]">Enable this to accept online payments for bookings</p>
                  </div>
                  <Switch checked={integration?.enabled || false} onCheckedChange={v => toggleEnabled(v)} />
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {status === 'not_configured' && !isPlatformBlocked && (
                  <Button onClick={connectStripe} disabled={actionLoading || isPlatformBlocked}
                    className="flex-1 bg-primary text-white">
                    {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
                    Connect Stripe
                  </Button>
                )}
                {(status === 'connecting' || status === 'requires_action') && (
                  <Button onClick={continueStripe} disabled={actionLoading}
                    className="flex-1 bg-primary text-white">
                    {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
                    Continue Setup
                  </Button>
                )}
                {isConfigured && (
                  <Button onClick={testConnection} disabled={actionLoading}
                    variant="outline" className="text-xs border-[var(--border-default)] text-[var(--text-secondary)]">
                    {actionLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <TestTube className="mr-1 h-3 w-3" />}
                    Test Connection
                  </Button>
                )}
                {isConfigured && (
                  <Button onClick={refreshStripe} disabled={actionLoading}
                    variant="outline" className="text-xs border-[var(--border-default)] text-[var(--text-secondary)]">
                    <RefreshCw className="mr-1 h-3 w-3" /> Refresh Status
                  </Button>
                )}
                {isConfigured && (
                  <Button onClick={disconnectStripe} disabled={actionLoading}
                    variant="ghost" className="text-xs text-destructive hover:text-destructive">
                    <Trash2 className="mr-1 h-3 w-3" /> Disconnect
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Resend / Email config — now uses ResendConfigPanel */}
          {entry.category === 'communication' && entry.provider === 'resend' && !isComingSoon && !isPlatformBlocked && !isDegraded && (
            <ResendConfigPanel tenantId={tenantId} />
          )}

          {/* Provider-specific config panels */}
          {!isComingSoon && !isPlatformBlocked && renderConfigPanel()}

          {/* Activity logs */}
          {!isComingSoon && !isPlatformBlocked && isConfigured && (
            <div className="border-t border-[var(--border-default)] pt-4">
              <button onClick={() => setShowLogs(!showLogs)} className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <History className="h-3.5 w-3.5" />
                {showLogs ? 'Hide' : 'Show'} Recent Activity
              </button>
              {showLogs && (
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {logs.length === 0 ? (
                    <p className="text-[10px] text-[var(--text-muted)] text-center py-2">No recent activity.</p>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="flex items-center justify-between text-[10px] py-1 border-b border-[var(--border-default)] last:border-0">
                        <div className="flex items-center gap-1.5">
                          {log.status === 'success' ? <CheckCircle2 className="h-3 w-3 text-[#86EFAC]" />
                          : log.status === 'failed' ? <XCircle className="h-3 w-3 text-[#FB7185]" />
                          : <Clock className="h-3 w-3 text-[var(--text-muted)]" />}
                          <span className="text-[var(--text-secondary)]">{log.action.replace(/_/g, ' ')}</span>
                        </div>
                        <span className="text-[var(--text-muted)]">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Disconnect warning */}
          {isConfigured && entry.provider !== 'stripe' && entry.provider !== 'google_calendar' && (
            <div className="border-t border-[var(--border-default)] pt-4">
              <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-3">
                <p className="text-[10px] font-medium uppercase text-[var(--text-muted)] mb-1">Disconnect</p>
                <p className="text-[11px] text-[var(--text-secondary)] mb-2">
                  Disconnecting will stop all synchronization. Historical records will be preserved.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    not_configured: { label: 'Available', className: 'bg-[var(--panel-bg)] text-[var(--text-secondary)]' },
    connecting: { label: 'Setup Required', className: 'bg-[rgba(99,119,255,0.15)] text-[var(--brand-primary)]' },
    connected: { label: 'Connected', className: 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC]' },
    requires_action: { label: 'Action Required', className: 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D]' },
    disconnected: { label: 'Disconnected', className: 'bg-[var(--panel-bg)] text-[var(--text-muted)]' },
    error: { label: 'Error', className: 'bg-[rgba(251,113,133,0.12)] text-[#FB7185]' },
  };
  const cfg = config[status] || config.not_configured;
  return <Badge className={cn('border-0', cfg.className)}>{cfg.label}</Badge>;
}

function InfoCell({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-md bg-[var(--card-bg)] border border-[var(--border-default)] p-2">
      <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">{label}</p>
      <p className={cn('text-xs mt-0.5', ok === true ? 'text-[#86EFAC]' : ok === false ? 'text-[#FB7185]' : 'text-[var(--text-secondary)]')}>{value}</p>
    </div>
  );
}
