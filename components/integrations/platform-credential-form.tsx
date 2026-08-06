'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertCircle, XCircle, Eye, EyeOff, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type SecretMeta = {
  secret_name: string;
  is_configured: boolean;
  last_four: string | null;
  last_verified_at: string | null;
  verification_status: string | null;
  verification_error: string | null;
  updated_at: string | null;
};

type CredentialField = {
  secretName: string;
  label: string;
  placeholder: string;
  required: boolean;
  type: 'text' | 'password';
};

const PROVIDER_FIELDS: Record<string, CredentialField[]> = {
  stripe: [
    { secretName: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key', placeholder: 'sk_test_... or sk_live_...', required: true, type: 'password' },
    { secretName: 'STRIPE_PUBLISHABLE_KEY', label: 'Stripe Publishable Key', placeholder: 'pk_test_... or pk_live_...', required: true, type: 'text' },
    { secretName: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe Webhook Secret', placeholder: 'whsec_...', required: true, type: 'password' },
  ],
  resend: [
    { secretName: 'RESEND_API_KEY', label: 'Resend API Key', placeholder: 're_...', required: true, type: 'password' },
    { secretName: 'RESEND_WEBHOOK_SECRET', label: 'Resend Webhook Secret', placeholder: 'whsec_...', required: false, type: 'password' },
  ],
  google_calendar: [
    { secretName: 'GOOGLE_CLIENT_ID', label: 'Google Client ID', placeholder: 'xxxxx.apps.googleusercontent.com', required: true, type: 'text' },
    { secretName: 'GOOGLE_CLIENT_SECRET', label: 'Google Client Secret', placeholder: 'GOCSPX-...', required: true, type: 'password' },
  ],
};

export function PlatformCredentialForm({ providerKey }: { providerKey: string }) {
  const fields = PROVIDER_FIELDS[providerKey];
  const [env, setEnv] = useState(providerKey === 'stripe' ? 'test' : 'production');
  const [secrets, setSecrets] = useState<Record<string, SecretMeta>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/platform-secrets?provider=${providerKey}&environment=${env}`);
      const data = await res.json();
      const map: Record<string, SecretMeta> = {};
      for (const s of data.secrets || []) {
        map[s.secret_name] = s;
      }
      setSecrets(map);
    } catch {
      // ignore
    }
    setLoading(false);
  }, [providerKey, env]);

  useEffect(() => { loadSecrets(); }, [loadSecrets]);

  async function saveSecret(secretName: string) {
    setSaving(secretName);
    setMessage(null);
    try {
      const token = (await import('@/lib/supabase')).supabase;
      const session = (await token.auth.getSession()).data.session;
      const res = await fetch('/api/platform-secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ providerKey, secretName, value: values[secretName], environment: env }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `${secretName} saved securely.` });
        setValues({ ...values, [secretName]: '' });
        await loadSecrets();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save credential' });
    }
    setSaving(null);
  }

  async function deleteSecret(secretName: string) {
    if (!confirm(`Delete ${secretName}? This will deactivate the credential immediately.`)) return;
    setSaving(secretName);
    setMessage(null);
    try {
      const { supabase } = await import('@/lib/supabase');
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/platform-secrets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ providerKey, secretName, environment: env }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `${secretName} deleted.` });
        await loadSecrets();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to delete credential' });
    }
    setSaving(null);
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const { supabase } = await import('@/lib/supabase');
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch('/api/platform-secrets/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ providerKey, environment: env }),
      });
      const data = await res.json();
      setTestResult({ ok: data.ok, message: data.message });
      if (data.ok) await loadSecrets();
    } catch {
      setTestResult({ ok: false, message: 'Connection test failed to execute' });
    }
    setTesting(false);
  }

  if (!fields) return null;

  return (
    <div className="space-y-4">
      {message && (
        <div className={cn(
          'flex items-center gap-2 rounded-lg border p-2.5 text-xs',
          message.type === 'success' ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.06)] text-[#86EFAC]'
          : 'border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.06)] text-[#FB7185]'
        )}>
          {message.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {providerKey === 'stripe' && (
        <div className="space-y-1.5">
          <Label className="text-xs text-[var(--text-secondary)]">Environment</Label>
          <Select value={env} onValueChange={setEnv}>
            <SelectTrigger className="bg-[var(--card-bg)]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="test">Test</SelectItem>
              <SelectItem value="live">Live</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" /></div>
      ) : (
        <div className="space-y-4">
          {fields.map(field => {
            const meta = secrets[field.secretName];
            const isConfigured = meta?.is_configured;
            return (
              <div key={field.secretName} className="rounded-lg border border-[var(--border-default)] bg-[var(--panel-bg)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isConfigured ? <CheckCircle2 className="h-3.5 w-3.5 text-[#86EFAC]" /> : <XCircle className="h-3.5 w-3.5 text-[#FB7185]" />}
                    <Label className="text-xs font-medium text-[var(--text-primary)]">{field.label}</Label>
                    {field.required ? (
                      <Badge className="text-[9px] border-[rgba(251,191,36,0.24)] bg-[rgba(251,191,36,0.10)] text-[#FCD34D]">Required</Badge>
                    ) : (
                      <Badge className="text-[9px] border-[rgba(148,163,184,0.20)] bg-[rgba(148,163,184,0.08)] text-[#94A3B8]">Optional</Badge>
                    )}
                  </div>
                  {isConfigured && meta?.last_four && (
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">••••{meta.last_four}</span>
                  )}
                </div>

                {isConfigured && meta?.verification_status && meta.verification_status !== 'unverified' && (
                  <div className={cn(
                    'flex items-center gap-1.5 text-[10px]',
                    meta.verification_status === 'verified' ? 'text-[#86EFAC]' : 'text-[#FB7185]'
                  )}>
                    {meta.verification_status === 'verified' ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {meta.verification_status === 'verified' ? 'Verified' : `Failed: ${meta.verification_error || 'Unknown error'}`}
                    {meta.last_verified_at && <span className="text-[var(--text-muted)]">· {new Date(meta.last_verified_at).toLocaleString()}</span>}
                  </div>
                )}

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={field.type === 'password' && !showValues[field.secretName] ? 'password' : 'text'}
                      placeholder={isConfigured ? 'Enter new value to replace' : field.placeholder}
                      value={values[field.secretName] || ''}
                      onChange={(e) => setValues({ ...values, [field.secretName]: e.target.value })}
                      className="bg-[var(--card-bg)] pr-8 text-xs"
                    />
                    {field.type === 'password' && (
                      <button
                        type="button"
                        onClick={() => setShowValues({ ...showValues, [field.secretName]: !showValues[field.secretName] })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        {showValues[field.secretName] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => saveSecret(field.secretName)}
                    disabled={!values[field.secretName] || saving === field.secretName}
                    className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] text-xs"
                  >
                    {saving === field.secretName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isConfigured ? 'Replace' : 'Save'}
                  </Button>
                  {isConfigured && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deleteSecret(field.secretName)}
                      disabled={saving === field.secretName}
                      className="border-[rgba(251,113,133,0.24)] text-[#FB7185] hover:bg-[rgba(251,113,133,0.08)] text-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={testConnection}
              disabled={testing}
              className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)]"
            >
              {testing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
              Test Connection
            </Button>
          </div>

          {testResult && (
            <div className={cn(
              'flex items-start gap-2 rounded-lg border p-2.5',
              testResult.ok ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.06)]'
              : 'border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.06)]'
            )}>
              {testResult.ok ? <CheckCircle2 className="h-4 w-4 text-[#86EFAC] shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-[#FB7185] shrink-0 mt-0.5" />}
              <span className={cn('text-xs', testResult.ok ? 'text-[#86EFAC]' : 'text-[#FB7185]')}>{testResult.message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
