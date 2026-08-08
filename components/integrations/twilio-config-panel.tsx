'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Loader2, AlertCircle, CheckCircle2, Save, Eye, EyeOff, Trash2, TestTube, Smartphone, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type TwilioConfigPanelProps = {
  tenantId: string;
  channel: 'sms' | 'whatsapp';
};

export function TwilioConfigPanel({ tenantId, channel }: TwilioConfigPanelProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [hasCreds, setHasCreds] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');

  const provider = channel === 'sms' ? 'twilio' : 'meta_whatsapp';
  const category = 'messaging';

  const loadState = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tenant_integrations')
      .select('credentials, connection_status, enabled')
      .eq('tenant_id', tenantId)
      .eq('category', category)
      .eq('provider', provider)
      .maybeSingle();

    if (data) {
      const creds = data.credentials as Record<string, string> | null;
      setHasCreds(!!(creds?.twilio_account_sid && creds?.twilio_auth_token));
      setIsConnected(data.connection_status === 'connected');
    }
    setLoading(false);
  }, [tenantId, provider]);

  useEffect(() => { loadState(); }, [loadState]);

  async function saveCredentials() {
    if (!accountSid || !authToken || !phoneNumber) return;
    setSaving(true);
    setMessage(null);

    const credentials: Record<string, string> = {
      twilio_account_sid: accountSid,
      twilio_auth_token: authToken,
      twilio_phone_number: phoneNumber,
    };
    if (channel === 'whatsapp' && whatsappNumber) {
      credentials.twilio_whatsapp_number = whatsappNumber;
    }

    const { data: existing } = await supabase
      .from('tenant_integrations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('category', category)
      .eq('provider', provider)
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
        category,
        provider,
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
    setAccountSid('');
    setAuthToken('');
    setPhoneNumber('');
    setWhatsappNumber('');
    setMessage({ type: 'success', text: `${channel === 'sms' ? 'Twilio SMS' : 'WhatsApp'} credentials saved and connected.` });
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
        body: JSON.stringify({ tenant_id: tenantId, category, provider }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage({ type: 'success', text: 'Connection test successful.' });
      } else {
        setMessage({ type: 'error', text: result.error || 'Connection test failed.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Connection test failed.' });
    }
    setTesting(false);
  }

  async function disconnect() {
    if (!confirm(`Disconnect ${channel === 'sms' ? 'Twilio SMS' : 'WhatsApp'}? Message sending will stop.`)) return;
    await supabase.from('tenant_integrations').update({
      connection_status: 'disconnected',
      enabled: false,
      credentials: null,
      updated_at: new Date().toISOString(),
    }).eq('tenant_id', tenantId).eq('category', category).eq('provider', provider);
    setHasCreds(false);
    setIsConnected(false);
    setMessage({ type: 'success', text: 'Disconnected.' });
  }

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" /></div>;

  const Icon = channel === 'sms' ? Smartphone : MessageSquare;
  const label = channel === 'sms' ? 'Twilio SMS' : 'WhatsApp via Twilio';

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
              <Icon className="h-4 w-4 text-[var(--text-primary)]" />
              <p className="text-sm font-medium text-[var(--text-primary)]">{label} Connected</p>
            </div>
            <Badge className="border-0 bg-[rgba(74,222,128,0.12)] text-[#86EFAC]">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
            </Badge>
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
            <p className="text-[11px] text-[var(--text-muted)]">To update your credentials, disconnect and re-enter them.</p>
          </div>
        </div>
      )}

      {/* Not connected */}
      {!isConnected && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--text-secondary)]">
            {channel === 'sms'
              ? 'Connect Twilio to send SMS notifications to your customers automatically.'
              : 'Connect Twilio to send WhatsApp messages to your customers through your workflows.'}
          </p>

          <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Twilio Credentials</p>

            <div className="rounded-md bg-[var(--card-bg)] border border-[var(--border-default)] p-3 space-y-2">
              <p className="text-[11px] font-medium text-[var(--text-secondary)]">How to get your credentials:</p>
              <ol className="text-[11px] text-[var(--text-muted)] space-y-1.5 list-decimal list-inside">
                <li>Go to <span className="text-[var(--brand-primary)] font-medium">twilio.com</span> and sign in or create an account</li>
                <li>From the <span className="font-medium text-[var(--text-secondary)]">Console Dashboard</span>, copy your <span className="font-medium text-[var(--text-secondary)]">Account SID</span> and <span className="font-medium text-[var(--text-secondary)]">Auth Token</span></li>
                {channel === 'sms' ? (
                  <li>Go to <span className="font-medium text-[var(--text-secondary)]">Phone Numbers &rarr; Manage &rarr; Active Numbers</span> and copy your Twilio phone number (or buy one)</li>
                ) : (
                  <>
                    <li>Go to <span className="font-medium text-[var(--text-secondary)]">Messaging &rarr; Try it out &rarr; Send a WhatsApp message</span> to set up your WhatsApp Sandbox</li>
                    <li>For production, apply for a <span className="font-medium text-[var(--text-secondary)]">WhatsApp Business Profile</span> in the Twilio console</li>
                  </>
                )}
              </ol>
            </div>

            <div className="space-y-2">
              <div>
                <Label className="text-[11px] text-[var(--text-muted)]">Account SID *</Label>
                <Input
                  type="text"
                  value={accountSid}
                  onChange={e => setAccountSid(e.target.value)}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="bg-[var(--card-bg)] text-xs font-mono"
                />
              </div>
              <div>
                <Label className="text-[11px] text-[var(--text-muted)]">Auth Token *</Label>
                <div className="relative">
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    value={authToken}
                    onChange={e => setAuthToken(e.target.value)}
                    placeholder="Your Twilio Auth Token"
                    className="bg-[var(--card-bg)] text-xs font-mono pr-8"
                  />
                  <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                    {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-[11px] text-[var(--text-muted)]">
                  {channel === 'sms' ? 'Twilio Phone Number *' : 'SMS Phone Number *'}
                </Label>
                <Input
                  type="text"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="bg-[var(--card-bg)] text-xs font-mono"
                />
              </div>
              {channel === 'whatsapp' && (
                <div>
                  <Label className="text-[11px] text-[var(--text-muted)]">WhatsApp Number (if different from SMS)</Label>
                  <Input
                    type="text"
                    value={whatsappNumber}
                    onChange={e => setWhatsappNumber(e.target.value)}
                    placeholder="+1234567890 (optional, defaults to SMS number)"
                    className="bg-[var(--card-bg)] text-xs font-mono"
                  />
                </div>
              )}
              <Button
                onClick={saveCredentials}
                disabled={saving || !accountSid || !authToken || !phoneNumber}
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
