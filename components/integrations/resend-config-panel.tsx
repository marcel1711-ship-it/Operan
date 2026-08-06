'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Loader2, AlertCircle, CheckCircle2, XCircle, RefreshCw, Copy, Check,
  Plus, Trash2, Send, Mail, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

type Domain = {
  id: string;
  domain: string;
  status: string;
  verification_status: string | null;
  dkim_status: string | null;
  spf_status: string | null;
  dns_records: Array<{ record: string; name: string; value: string; status?: string }> | null;
  created_at: string;
};

type Sender = {
  id: string;
  name: string;
  email: string;
  domain: string;
  verified: boolean;
  created_at: string;
};

export function ResendConfigPanel({ tenantId }: { tenantId: string }) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [newSender, setNewSender] = useState({ name: '', email: '' });
  const [copiedRecord, setCopiedRecord] = useState<string | null>(null);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const [domRes, sendRes] = await Promise.all([
      fetch(`/api/integrations/email/domains?tenant_id=${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).catch(() => ({ domains: [] })),
      fetch(`/api/integrations/email/senders?tenant_id=${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()).catch(() => ({ senders: [] })),
    ]);
    setDomains(domRes.domains || []);
    setSenders(sendRes.senders || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function getToken() {
    return (await supabase.auth.getSession()).data.session?.access_token;
  }

  async function addDomain() {
    if (!newDomain.trim()) return;
    setActionLoading(true);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/integrations/email/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, domain: newDomain.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: data.error || 'Failed to add domain' }); setActionLoading(false); return; }
      setNewDomain('');
      setMessage({ type: 'success', text: 'Domain added. DNS records are ready for configuration.' });
      await loadData();
    } catch {
      setMessage({ type: 'error', text: 'Failed to add domain.' });
    }
    setActionLoading(false);
  }

  async function verifyDomain(id: string) {
    setActionLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/integrations/email/domains/${id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: data.error || 'Verification failed' }); setActionLoading(false); return; }
      setMessage({ type: data.verified ? 'success' : 'info', text: data.verified ? 'Domain verified successfully' : 'DNS records not yet propagated. Please try again in a few minutes.' });
      await loadData();
    } catch {
      setMessage({ type: 'error', text: 'Verification request failed.' });
    }
    setActionLoading(false);
  }

  async function deleteDomain(id: string) {
    if (!confirm('Remove this sending domain?')) return;
    setActionLoading(true);
    try {
      const token = await getToken();
      await fetch(`/api/integrations/email/domains/${id}?tenant_id=${tenantId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage({ type: 'success', text: 'Domain removed.' });
      await loadData();
    } catch {
      setMessage({ type: 'error', text: 'Failed to remove domain.' });
    }
    setActionLoading(false);
  }

  async function addSender() {
    if (!newSender.name.trim() || !newSender.email.trim()) return;
    setActionLoading(true);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/integrations/email/senders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, name: newSender.name.trim(), email: newSender.email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: data.error || 'Failed to add sender' }); setActionLoading(false); return; }
      setNewSender({ name: '', email: '' });
      setMessage({ type: 'success', text: 'Sender identity created.' });
      await loadData();
    } catch {
      setMessage({ type: 'error', text: 'Failed to add sender.' });
    }
    setActionLoading(false);
  }

  async function sendTestEmail() {
    if (!testEmailTo.trim()) return;
    setSendingTest(true);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/integrations/email/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantId, to: testEmailTo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: data.error || 'Test email failed' }); setSendingTest(false); return; }
      setMessage({ type: 'success', text: 'Test email sent successfully. Check your inbox.' });
      setTestEmailTo('');
    } catch {
      setMessage({ type: 'error', text: 'Failed to send test email.' });
    }
    setSendingTest(false);
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedRecord(key);
      setTimeout(() => setCopiedRecord(null), 2000);
    }).catch(() => {});
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--panel-bg)] p-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[var(--brand-primary)]" />
          <p className="text-xs font-semibold text-[var(--text-secondary)]">Email Delivery Setup</p>
        </div>
        <p className="mt-1 text-[11px] text-[var(--text-muted)]">
          Email is delivered through the OPERAN platform. Configure your sending domains and sender identities below.
          The platform API key is managed securely and is never exposed.
        </p>
      </div>

      {message && (
        <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
          message.type === 'success' ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.12)] text-[#86EFAC]'
          : message.type === 'error' ? 'border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.12)] text-[#FB7185]'
          : 'border-[rgba(99,119,255,0.20)] bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)]')}>
          {message.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          : message.type === 'error' ? <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          : <RefreshCw className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Domains section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-[var(--brand-primary)]" />
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Sending Domains</h4>
        </div>

        {/* Add domain form */}
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-[10px] text-muted-foreground">Add sending domain</Label>
            <Input value={newDomain} onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com" className="bg-[var(--card-bg)] text-sm h-9" />
          </div>
          <Button size="sm" onClick={addDomain} disabled={actionLoading || !newDomain.trim()}>
            {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add Domain
          </Button>
        </div>

        {/* Domain list */}
        {domains.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No sending domains configured yet.</p>
        ) : (
          <div className="space-y-3">
            {domains.map(dom => (
              <div key={dom.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--card-bg)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{dom.domain}</p>
                    <p className="text-[10px] text-muted-foreground">Added {new Date(dom.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <DomainStatusBadge status={dom.status} verification={dom.verification_status} />
                    <Button size="sm" variant="ghost" onClick={() => deleteDomain(dom.id)} disabled={actionLoading}
                      className="h-7 text-xs text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* DNS records */}
                {dom.dns_records && dom.dns_records.length > 0 && dom.status !== 'verified' && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-medium uppercase text-muted-foreground">DNS Records to Add</p>
                    {dom.dns_records.map((rec, i) => (
                      <div key={i} className="rounded-md bg-[var(--panel-bg)] border border-[var(--border-default)] p-2 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px] font-mono">{rec.record}</Badge>
                            {rec.status && (
                              <Badge className={cn('text-[9px] border-0',
                                rec.status === 'verified' || rec.status === 'valid' ? 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC]'
                                : 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D]')}>
                                {rec.status}
                              </Badge>
                            )}
                          </div>
                          <button onClick={() => copyText(`${rec.name} ${rec.record} ${rec.value}`, `dns-${i}`)}
                            className="text-muted-foreground hover:text-foreground">
                            {copiedRecord === `dns-${i}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground break-all">{rec.name}</p>
                        <p className="text-[10px] font-mono text-[var(--text-secondary)] break-all">{rec.value}</p>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => verifyDomain(dom.id)} disabled={actionLoading}
                      className="text-xs">
                      {actionLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Recheck Verification
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Senders section */}
      <div className="space-y-3 border-t border-[var(--border-default)] pt-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[var(--brand-primary)]" />
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Sender Identities</h4>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Sender Name</Label>
            <Input value={newSender.name} onChange={(e) => setNewSender({ ...newSender, name: e.target.value })}
              placeholder="Charter Bookings" className="bg-[var(--card-bg)] text-sm h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Sender Email</Label>
            <Input value={newSender.email} onChange={(e) => setNewSender({ ...newSender, email: e.target.value })}
              placeholder="bookings@example.com" className="bg-[var(--card-bg)] text-sm h-9" />
          </div>
        </div>
        <Button size="sm" onClick={addSender} disabled={actionLoading || !newSender.name.trim() || !newSender.email.trim()}>
          {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add Sender
        </Button>

        {senders.length > 0 && (
          <div className="space-y-1.5">
            {senders.map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-[var(--border-default)] bg-[var(--card-bg)] px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-[var(--text-primary)]">{s.name} &lt;{s.email}&gt;</p>
                  <p className="text-[10px] text-muted-foreground">{s.domain}</p>
                </div>
                {s.verified
                  ? <Badge className="bg-[rgba(74,222,128,0.12)] text-[#86EFAC] border-0 text-[9px]">Verified</Badge>
                  : <Badge className="bg-[rgba(251,191,36,0.12)] text-[#FCD34D] border-0 text-[9px]">Pending</Badge>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Test email section */}
      <div className="space-y-3 border-t border-[var(--border-default)] pt-4">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-[var(--brand-primary)]" />
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Send Test Email</h4>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Send a test email to verify your sending domain and sender identity are working correctly.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-[10px] text-muted-foreground">Recipient email</Label>
            <Input value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)}
              placeholder="you@example.com" className="bg-[var(--card-bg)] text-sm h-9" />
          </div>
          <Button size="sm" onClick={sendTestEmail} disabled={sendingTest || !testEmailTo.trim()}>
            {sendingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send Test
          </Button>
        </div>
      </div>
    </div>
  );
}

function DomainStatusBadge({ status, verification }: { status: string; verification: string | null }) {
  if (status === 'verified' || verification === 'verified') {
    return <Badge className="bg-[rgba(74,222,128,0.12)] text-[#86EFAC] border-0 text-[9px]">Verified</Badge>;
  }
  if (status === 'pending' || verification === 'pending' || !verification) {
    return <Badge className="bg-[rgba(251,191,36,0.12)] text-[#FCD34D] border-0 text-[9px]">Pending</Badge>;
  }
  if (status === 'failed') {
    return <Badge className="bg-[rgba(251,113,133,0.12)] text-[#FB7185] border-0 text-[9px]">Failed</Badge>;
  }
  return <Badge className="bg-[var(--panel-bg)] text-muted-foreground border-0 text-[9px]">{status}</Badge>;
}
