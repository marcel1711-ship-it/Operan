'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Key, Plus, Trash2, Copy, Check, Loader2, AlertCircle, CheckCircle2, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

const AVAILABLE_SCOPES = [
  { value: 'listings:read', label: 'Listings (Read)' },
  { value: 'reservations:read', label: 'Reservations (Read)' },
  { value: 'customers:read', label: 'Customers (Read)' },
  { value: 'webhooks:manage', label: 'Webhooks (Manage)' },
];

export function ApiKeysConfigPanel({ tenantId }: { tenantId: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState({ name: '', scopes: ['listings:read'] });
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`/api/integrations/api-keys?tenant_id=${tenantId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setKeys(data.keys || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  async function createKey() {
    setActionLoading(true);
    setMessage(null);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch('/api/integrations/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: tenantId, name: newKey.name, scopes: newKey.scopes }),
    });
    const result = await res.json();
    if (!res.ok) { setMessage({ type: 'error', text: result.error }); setActionLoading(false); return; }
    setShowAdd(false);
    setRawKey(result.raw_key);
    setNewKey({ name: '', scopes: ['read'] });
    await loadKeys();
    setMessage({ type: 'success', text: 'API key created. Copy it now — it will not be shown again.' });
    setActionLoading(false);
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this API key? Any applications using this key will immediately lose access.')) return;
    setActionLoading(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch(`/api/integrations/api-keys/${id}?tenant_id=${tenantId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    await loadKeys();
    setActionLoading(false);
  }

  function toggleScope(scope: string) {
    setNewKey(prev => ({
      ...prev,
      scopes: prev.scopes.includes(scope) ? prev.scopes.filter(s => s !== scope) : [...prev.scopes, scope],
    }));
  }

  function copyKey() {
    if (rawKey) {
      navigator.clipboard.writeText(rawKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" /></div>;

  return (
    <div className="space-y-4">
      {message && (
        <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
          message.type === 'success' ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.12)] text-[#86EFAC]' : 'border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.12)] text-[#FB7185]')}>
          {message.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {rawKey && (
        <div className="rounded-lg border border-[rgba(251,191,36,0.30)] bg-[rgba(251,191,36,0.12)] p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-[#FCD34D]" />
            <p className="text-xs font-semibold text-amber-800">Copy Your API Key Now</p>
          </div>
          <p className="text-[11px] text-amber-700">This key will not be shown again. Store it securely.</p>
          <div className="flex items-center gap-1.5">
            <code className="flex-1 truncate rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 font-mono text-[11px] text-amber-900">{rawKey}</code>
            <Button size="sm" variant="outline" onClick={copyKey} className="shrink-0 border-amber-300 bg-amber-50 text-amber-800">
              {copiedKey ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => setRawKey(null)} className="w-full text-xs">
            I&apos;ve copied the key
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">Generate API keys for programmatic access to your data.</p>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)} className="h-7 text-xs shrink-0">
          <Plus className="mr-1 h-3 w-3" /> New Key
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-3 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-[var(--text-secondary)]">Key Name</Label>
            <Input placeholder="e.g. Production API" value={newKey.name}
              onChange={e => setNewKey({ ...newKey, name: e.target.value })} className="bg-[var(--card-bg)] text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[var(--text-secondary)]">Permissions</Label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_SCOPES.map(scope => (
                <button key={scope.value} onClick={() => toggleScope(scope.value)}
                  className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors',
                    newKey.scopes.includes(scope.value)
                      ? 'border-[var(--brand-primary)] bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)]'
                      : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:border-[rgba(99,119,255,0.34)]')}>
                  {scope.label}
                </button>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={createKey} disabled={actionLoading || !newKey.name}
            className="w-full bg-primary text-white">
            {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Key className="mr-1.5 h-3.5 w-3.5" />}
            Generate API Key
          </Button>
        </div>
      )}

      {keys.length === 0 && !showAdd && (
        <p className="text-xs text-[var(--text-muted)] text-center py-4">No API keys generated yet.</p>
      )}

      {keys.map(key => (
        <div key={key.id} className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{key.name}</p>
              <p className="text-[10px] text-[var(--text-muted)] font-mono">{key.key_prefix}...</p>
            </div>
            {key.revoked_at ? (
              <Badge className="border-0 bg-[rgba(251,113,133,0.12)] text-[#FB7185]">Revoked</Badge>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => revokeKey(key.id)} disabled={actionLoading}
                className="h-7 text-xs text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {key.scopes.map(s => <Badge key={s} className="border-0 bg-[var(--panel-bg)] text-[var(--text-secondary)] text-[10px]">{s}</Badge>)}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
            <span>Created: {new Date(key.created_at).toLocaleDateString()}</span>
            {key.last_used_at && <span>Last used: {new Date(key.last_used_at).toLocaleDateString()}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
