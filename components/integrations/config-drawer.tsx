'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  X, Loader2, AlertCircle, CheckCircle2, XCircle, RefreshCw, Trash2,
  Link2, ExternalLink, Clock, Zap, TestTube, History, Eye, EyeOff, Copy, Webhook, Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { IcalConfigPanel } from './ical-config-panel';
import { WebhooksConfigPanel } from './webhooks-config-panel';
import { ApiKeysConfigPanel } from './api-keys-config-panel';
import { GoogleCalendarConfigPanel } from './google-calendar-config-panel';
import { ResendConfigPanel } from './resend-config-panel';
import { TwilioConfigPanel } from './twilio-config-panel';
import { QuickBooksConfigPanel } from './quickbooks-config-panel';
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
  credentials: Record<string, unknown> | null;
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
  const isPlatformBlocked = false;
  const isDegraded = false;

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
    if (entry.category === 'messaging' && entry.provider === 'twilio') {
      return <TwilioConfigPanel tenantId={tenantId} channel="sms" />;
    }
    if (entry.category === 'messaging' && entry.provider === 'meta_whatsapp') {
      return <TwilioConfigPanel tenantId={tenantId} channel="whatsapp" />;
    }
    if (entry.category === 'messaging' && entry.provider === 'twilio_whatsapp') {
      return <TwilioConfigPanel tenantId={tenantId} channel="whatsapp" />;
    }
    if (entry.category === 'accounting' && entry.provider === 'quickbooks') {
      return <QuickBooksConfigPanel tenantId={tenantId} />;
    }
    return null;
  }

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

          {/* Stripe config — tenant enters their own API keys */}
          {entry.category === 'payments' && entry.provider === 'stripe' && !isComingSoon && !isPlatformBlocked && !isDegraded && (
            <StripeCredentialsPanel
              tenantId={tenantId}
              integration={integration}
              status={status}
              onChanged={onChanged}
              onMessage={setMessage}
            />
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

function StripeCredentialsPanel({
  tenantId, integration, status, onChanged, onMessage,
}: {
  tenantId: string;
  integration: DrawerIntegration | null;
  status: string;
  onChanged: () => void;
  onMessage: (msg: { type: 'success' | 'error' | 'info'; text: string } | null) => void;
}) {
  const [showManualKeys, setShowManualKeys] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [publishableKey, setPublishableKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const isConnected = status === 'connected';

  async function connectOAuth() {
    setLoading(true);
    onMessage(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/stripe-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, action: 'connect' }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'no_client_id') {
          setShowManualKeys(true);
          onMessage({ type: 'info', text: 'OAuth not available. Use API keys instead.' });
        } else {
          onMessage({ type: 'error', text: data.error });
        }
        setLoading(false);
        return;
      }
      window.location.href = data.auth_url;
    } catch {
      onMessage({ type: 'error', text: 'Failed to start Stripe connection.' });
      setLoading(false);
    }
  }

  async function saveKeys() {
    setLoading(true);
    onMessage(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/stripe-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tenant_id: tenantId,
          action: 'save_keys',
          secret_key: secretKey,
          publishable_key: publishableKey,
          webhook_secret: webhookSecret || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onMessage({ type: 'error', text: data.error });
      } else {
        onMessage({ type: 'success', text: `Stripe connected successfully (${data.environment} mode).` });
        setSecretKey('');
        setPublishableKey('');
        setWebhookSecret('');
        onChanged();
      }
    } catch {
      onMessage({ type: 'error', text: 'Failed to save Stripe credentials.' });
    }
    setLoading(false);
  }

  async function testConnection() {
    setLoading(true);
    onMessage(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/stripe-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, action: 'test' }),
      });
      const data = await res.json();
      if (!res.ok) {
        onMessage({ type: 'error', text: data.error });
      } else {
        onMessage({ type: 'success', text: 'Stripe connection is working.' });
        onChanged();
      }
    } catch {
      onMessage({ type: 'error', text: 'Connection test failed.' });
    }
    setLoading(false);
  }

  async function disconnect() {
    if (!confirm('Disconnect Stripe? Existing payment records remain, but new payments will stop.')) return;
    setLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      await fetch('/api/stripe-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, action: 'disconnect' }),
      });
      onMessage({ type: 'success', text: 'Stripe disconnected.' });
      onChanged();
    } catch {
      onMessage({ type: 'error', text: 'Failed to disconnect.' });
    }
    setLoading(false);
  }

  // --- Connected state ---
  if (isConnected) {
    const capabilities = integration?.capabilities as Record<string, unknown> || {};
    const businessName = capabilities.business_name as string | null;
    return (
      <div className="space-y-4">
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-[var(--text-secondary)]">Account Status</p>
            <StatusBadge status={status} />
          </div>
          {businessName && (
            <p className="text-xs text-[var(--text-primary)] mb-2">{businessName}</p>
          )}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <InfoCell label="Charges" value={capabilities.charges_enabled ? 'Enabled' : 'Disabled'} ok={!!capabilities.charges_enabled} />
            <InfoCell label="Payouts" value={capabilities.payouts_enabled ? 'Enabled' : 'Disabled'} ok={!!capabilities.payouts_enabled} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-3">
          <div>
            <p className="text-xs font-medium text-[var(--text-primary)]">Accept Online Payments</p>
            <p className="text-[10px] text-[var(--text-muted)]">Enable to accept payments for bookings</p>
          </div>
          <Switch checked={integration?.enabled || false} onCheckedChange={async (v) => {
            if (!integration) return;
            await supabase.from('tenant_integrations').update({ enabled: v, updated_at: new Date().toISOString() }).eq('id', integration.id);
            onChanged();
          }} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={testConnection} disabled={loading} variant="outline" className="text-xs border-[var(--border-default)] text-[var(--text-secondary)]">
            {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <TestTube className="mr-1 h-3 w-3" />}
            Test Connection
          </Button>
          <Button onClick={disconnect} disabled={loading} variant="ghost" className="text-xs text-destructive hover:text-destructive">
            <Trash2 className="mr-1 h-3 w-3" /> Disconnect
          </Button>
        </div>

        <WebhookConfigSection tenantId={tenantId} integration={integration} loading={loading} setLoading={setLoading} onMessage={onMessage} />
      </div>
    );
  }

  // --- Not connected state ---
  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-secondary)]">
        Connect your Stripe account to start accepting payments for your bookings.
      </p>

      {/* Primary: OAuth Connect button */}
      <Button onClick={connectOAuth} disabled={loading} className="w-full bg-[#635BFF] hover:bg-[#5851DB] text-white h-11">
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <svg className="mr-2 h-5 w-5" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M14 28C21.732 28 28 21.732 28 14C28 6.26801 21.732 0 14 0C6.26801 0 0 6.26801 0 14C0 21.732 6.26801 28 14 28ZM13.1 11.27C13.1 10.68 13.58 10.44 14.37 10.44C15.52 10.44 16.96 10.81 18.11 11.44V7.7C16.85 7.2 15.6 7 14.37 7C11.47 7 9.58 8.49 9.58 10.97C9.58 14.87 15.14 14.2 15.14 15.87C15.14 16.57 14.54 16.81 13.69 16.81C12.43 16.81 10.84 16.28 9.56 15.56V19.35C10.97 19.95 12.4 20.21 13.69 20.21C16.66 20.21 18.68 18.77 18.68 16.25C18.68 12.04 13.1 12.84 13.1 11.27Z" fill="white"/>
          </svg>
        )}
        Connect with Stripe
      </Button>

      <div className="rounded-md bg-[var(--panel-bg)] border border-[var(--border-default)] p-2.5 space-y-1">
        <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">What happens</p>
        <ul className="text-[11px] text-[var(--text-secondary)] space-y-0.5">
          <li>- You&apos;ll be redirected to Stripe to log in or create an account</li>
          <li>- Authorize OPERAN to process payments on your behalf</li>
          <li>- You keep full control of your Stripe account</li>
          <li>- Payments go directly to your Stripe balance</li>
        </ul>
      </div>

      {/* Fallback: manual API keys */}
      <div className="border-t border-[var(--border-default)] pt-3">
        <button onClick={() => setShowManualKeys(!showManualKeys)}
          className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
          <ExternalLink className="h-3 w-3" />
          {showManualKeys ? 'Hide' : 'Or connect with API keys manually'}
        </button>

        {showManualKeys && (
          <div className="mt-3 rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-3 space-y-3">
            <div>
              <Label className="text-[11px] text-[var(--text-muted)]">Secret Key *</Label>
              <div className="relative">
                <Input type={showSecret ? 'text' : 'password'} value={secretKey} onChange={e => setSecretKey(e.target.value)}
                  placeholder="sk_test_... or sk_live_..." className="bg-[var(--card-bg)] text-xs pr-8 font-mono" />
                <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-[var(--text-muted)]">Publishable Key *</Label>
              <Input type="text" value={publishableKey} onChange={e => setPublishableKey(e.target.value)}
                placeholder="pk_test_... or pk_live_..." className="bg-[var(--card-bg)] text-xs font-mono" />
            </div>
            <div>
              <Label className="text-[11px] text-[var(--text-muted)]">Webhook Secret (optional)</Label>
              <Input type={showSecret ? 'text' : 'password'} value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)}
                placeholder="whsec_..." className="bg-[var(--card-bg)] text-xs font-mono" />
            </div>
            <Button onClick={saveKeys} disabled={loading || !secretKey || !publishableKey} className="w-full bg-primary text-white text-xs">
              {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
              Connect with API Keys
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function WebhookConfigSection({
  tenantId, integration, loading, setLoading, onMessage,
}: {
  tenantId: string;
  integration: DrawerIntegration | null;
  loading: boolean;
  setLoading: (v: boolean) => void;
  onMessage: (msg: { type: 'success' | 'error' | 'info'; text: string } | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [whSecret, setWhSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);

  const creds = integration?.credentials as Record<string, string> | null;
  const hasWebhookSecret = !!creds?.webhook_secret;
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/stripe-webhook`
    : '/api/stripe-webhook';

  async function copyUrl() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveWebhookSecret() {
    setLoading(true);
    onMessage(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/stripe-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, action: 'update_webhook_secret', webhook_secret: whSecret }),
      });
      const data = await res.json();
      if (!res.ok) {
        onMessage({ type: 'error', text: data.error });
      } else {
        onMessage({ type: 'success', text: 'Webhook secret saved successfully.' });
        setWhSecret('');
        setExpanded(false);
      }
    } catch {
      onMessage({ type: 'error', text: 'Failed to save webhook secret.' });
    }
    setLoading(false);
  }

  return (
    <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-3 space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center gap-1.5">
          <Webhook className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span className="text-xs font-medium text-[var(--text-primary)]">Webhook Configuration</span>
        </div>
        <div className="flex items-center gap-1.5">
          {hasWebhookSecret ? (
            <Badge className="border-0 bg-[rgba(74,222,128,0.12)] text-[#86EFAC] text-[10px]">Configured</Badge>
          ) : (
            <Badge className="border-0 bg-[rgba(251,191,36,0.12)] text-[#FCD34D] text-[10px]">Not Set</Badge>
          )}
          <ExternalLink className={cn('h-3 w-3 text-[var(--text-muted)] transition-transform', expanded && 'rotate-90')} />
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-[11px] text-[var(--text-muted)]">Webhook URL</Label>
            <p className="text-[10px] text-[var(--text-muted)] mb-1">Add this URL in your Stripe Dashboard → Developers → Webhooks</p>
            <div className="flex items-center gap-1">
              <Input readOnly value={webhookUrl} className="bg-[var(--card-bg)] text-[10px] font-mono flex-1" />
              <Button variant="outline" size="sm" onClick={copyUrl} className="h-8 px-2 border-[var(--border-default)]">
                {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-[#86EFAC]" /> : <Copy className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-[11px] text-[var(--text-muted)]">Required Events</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {['checkout.session.completed', 'checkout.session.expired', 'payment_intent.succeeded', 'payment_intent.payment_failed'].map(evt => (
                <span key={evt} className="rounded bg-[var(--card-bg)] border border-[var(--border-default)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-secondary)]">{evt}</span>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-[11px] text-[var(--text-muted)]">
              Signing Secret {hasWebhookSecret && <span className="text-[#86EFAC]">(saved)</span>}
            </Label>
            <p className="text-[10px] text-[var(--text-muted)] mb-1">After creating the webhook in Stripe, copy the signing secret (whsec_...) and paste it here</p>
            <div className="flex items-center gap-1">
              <div className="relative flex-1">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={whSecret}
                  onChange={e => setWhSecret(e.target.value)}
                  placeholder={hasWebhookSecret ? 'whsec_••••••••••••••• (update)' : 'whsec_...'}
                  className="bg-[var(--card-bg)] text-xs font-mono pr-8"
                />
                <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Button
                onClick={saveWebhookSecret}
                disabled={loading || !whSecret || !whSecret.startsWith('whsec_')}
                size="sm"
                className="h-8 bg-primary text-white text-xs"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
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
