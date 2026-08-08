'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, AlertCircle, CheckCircle2, Save, Eye, EyeOff, Trash2,
  TestTube, Mail, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

export function ResendConfigPanel({ tenantId }: { tenantId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [hasCreds, setHasCreds] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [testEmailTo, setTestEmailTo] = useState('');

  const loadState = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tenant_integrations')
      .select('credentials, connection_status, enabled')
      .eq('tenant_id', tenantId)
      .eq('category', 'communication')
      .eq('provider', 'resend')
      .maybeSingle();

    if (data) {
      const creds = data.credentials as Record<string, string> | null;
      setHasCreds(!!creds?.resend_api_key);
      setIsConnected(data.connection_status === 'connected');
      if (creds?.resend_from_name) setFromName(creds.resend_from_name);
      if (creds?.resend_from_email) setFromEmail(creds.resend_from_email);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadState(); }, [loadState]);

  async function saveCredentials() {
    if (!apiKey) return;
    setSaving(true);
    setMessage(null);

    const credentials: Record<string, string> = {
      resend_api_key: apiKey,
    };
    if (fromName.trim()) credentials.resend_from_name = fromName.trim();
    if (fromEmail.trim()) credentials.resend_from_email = fromEmail.trim();

    const { data: existing } = await supabase
      .from('tenant_integrations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('category', 'communication')
      .eq('provider', 'resend')
      .maybeSingle();

    if (existing) {
      await supabase.from('tenant_integrations').update({
        credentials,
        connection_status: 'connected',
        enabled: true,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('tenant_integrations').insert({
        tenant_id: tenantId,
        category: 'communication',
        provider: 'resend',
        environment: 'production',
        connection_status: 'connected',
        credentials,
        is_default: true,
        enabled: true,
        connected_at: new Date().toISOString(),
      });
    }

    setHasCreds(true);
    setIsConnected(true);
    setApiKey('');
    setMessage({ type: 'success', text: 'Resend API key saved. Email delivery is now active.' });
    setSaving(false);
  }

  async function testConnection() {
    setTesting(true);
    setMessage(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/integrations/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, category: 'communication', provider: 'resend' }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: 'Connection verified — Resend API key is valid.' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Connection test failed. Check your API key.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Connection test failed.' });
    }
    setTesting(false);
  }

  async function sendTestEmail() {
    if (!testEmailTo.trim()) return;
    setSendingTest(true);
    setMessage(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/api/integrations/email/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipient: testEmailTo.trim() }),
      });
      const result = await res.json();
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Test email sent! Check your inbox.' });
        setTestEmailTo('');
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to send test email.' });
    }
    setSendingTest(false);
  }

  async function disconnect() {
    if (!confirm('Disconnect Resend? Email sending will stop.')) return;
    await supabase.from('tenant_integrations').update({
      connection_status: 'disconnected',
      enabled: false,
      credentials: null,
      updated_at: new Date().toISOString(),
    }).eq('tenant_id', tenantId).eq('category', 'communication').eq('provider', 'resend');
    setHasCreds(false);
    setIsConnected(false);
    setFromName('');
    setFromEmail('');
    setMessage({ type: 'success', text: 'Resend disconnected.' });
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

      {/* Connected state */}
      {isConnected && hasCreds && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[var(--text-primary)]" />
              <p className="text-sm font-medium text-[var(--text-primary)]">Resend Connected</p>
            </div>
            <Badge className="border-0 bg-[rgba(74,222,128,0.12)] text-[#86EFAC]">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
            </Badge>
          </div>

          {(fromName || fromEmail) && (
            <div className="rounded-md bg-[var(--panel-bg)] border border-[var(--border-default)] p-3">
              <p className="text-[11px] text-[var(--text-muted)]">
                Sending as: <span className="text-[var(--text-secondary)] font-medium">{fromName ? `${fromName} <${fromEmail}>` : fromEmail}</span>
              </p>
            </div>
          )}

          {/* Send Test Email */}
          <div className="rounded-md bg-[var(--panel-bg)] border border-[var(--border-default)] p-3 space-y-2">
            <p className="text-[11px] font-medium text-[var(--text-secondary)]">Send a Test Email</p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  value={testEmailTo}
                  onChange={e => setTestEmailTo(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-[var(--card-bg)] text-xs"
                />
              </div>
              <Button size="sm" onClick={sendTestEmail} disabled={sendingTest || !testEmailTo.trim()}
                className="bg-[var(--brand-primary)] text-white hover:bg-primary-hover text-xs">
                {sendingTest ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                Send
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={testConnection} disabled={testing}
              className="text-xs border-[var(--border-default)] text-[var(--text-secondary)]">
              {testing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <TestTube className="mr-1 h-3 w-3" />}
              Test Connection
            </Button>
            <Button size="sm" variant="ghost" onClick={disconnect}
              className="text-xs text-destructive hover:text-destructive">
              <Trash2 className="mr-1 h-3 w-3" /> Disconnect
            </Button>
          </div>

          <div className="border-t border-[var(--border-default)] pt-3">
            <p className="text-[11px] text-[var(--text-muted)]">To update your API key, disconnect and re-enter it.</p>
          </div>
        </div>
      )}

      {/* Not connected */}
      {!isConnected && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Connect your Resend account to send emails to customers automatically (confirmations, reminders, etc.).
          </p>

          <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Resend API Key</p>

            <div className="rounded-md bg-[var(--card-bg)] border border-[var(--border-default)] p-3 space-y-2">
              <p className="text-[11px] font-medium text-[var(--text-secondary)]">How to get your API key:</p>
              <ol className="text-[11px] text-[var(--text-muted)] space-y-1.5 list-decimal list-inside">
                <li>Go to <span className="text-[var(--brand-primary)] font-medium">resend.com</span> and create a free account (3,000 emails/month free)</li>
                <li>In the dashboard, go to <span className="font-medium text-[var(--text-secondary)]">API Keys</span></li>
                <li>Click <span className="font-medium text-[var(--text-secondary)]">Create API Key</span>, give it a name, and select <span className="font-medium text-[var(--text-secondary)]">Full access</span> permission</li>
                <li>Copy the API key (starts with <span className="font-mono text-[var(--text-secondary)]">re_</span>) and paste it below</li>
              </ol>
            </div>

            <div className="space-y-2">
              <div>
                <Label className="text-[11px] text-[var(--text-muted)]">API Key *</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="bg-[var(--card-bg)] text-xs font-mono pr-8"
                  />
                  <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                    {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              <div className="rounded-md bg-[var(--card-bg)] border border-[var(--border-default)] p-2">
                <p className="text-[10px] font-medium text-[var(--text-secondary)] mb-1">Sender Identity (optional)</p>
                <p className="text-[10px] text-[var(--text-muted)] mb-2">
                  If left empty, emails will be sent from <span className="font-mono">onboarding@resend.dev</span> (Resend default). You can set up a custom domain in Resend later.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-[var(--text-muted)]">From Name</Label>
                    <Input
                      type="text"
                      value={fromName}
                      onChange={e => setFromName(e.target.value)}
                      placeholder="Your Business"
                      className="bg-[var(--panel-bg)] text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-[var(--text-muted)]">From Email</Label>
                    <Input
                      type="email"
                      value={fromEmail}
                      onChange={e => setFromEmail(e.target.value)}
                      placeholder="bookings@yourdomain.com"
                      className="bg-[var(--panel-bg)] text-xs"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={saveCredentials}
                disabled={saving || !apiKey}
                className="w-full bg-[var(--brand-primary)] text-white hover:bg-primary-hover text-xs"
              >
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Save & Connect
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
