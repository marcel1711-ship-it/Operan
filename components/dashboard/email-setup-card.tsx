'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Mail, Loader2, Plus, Copy, Check, RefreshCw, Trash2,
  Globe, Shield, CheckCircle2, AlertCircle, XCircle, Clock,
  Send, ChevronRight, Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type EmailDomain = {
  id: string;
  domain: string;
  status: string;
  verification_status: string | null;
  dns_records: Array<{ record_type: string; name: string; value: string; priority?: number; status?: string }>;
  is_default: boolean;
  sending_enabled: boolean;
  verified_at: string | null;
  last_checked_at: string | null;
  provider_domain_id: string | null;
};

type EmailSender = {
  id: string;
  sender_name: string;
  from_email: string;
  reply_to_email: string | null;
  is_default: boolean;
  is_active: boolean;
  email_domain_id: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  not_configured: { label: 'Not Configured', color: 'bg-[var(--border-default)] text-[var(--text-secondary)]', icon: AlertCircle },
  domain_pending: { label: 'Pending', color: 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D]', icon: Clock },
  dns_required: { label: 'DNS Required', color: 'bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]', icon: AlertCircle },
  verifying: { label: 'Verifying', color: 'bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]', icon: Clock },
  verified: { label: 'Verified', color: 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC]', icon: CheckCircle2 },
  sender_incomplete: { label: 'Sender Incomplete', color: 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D]', icon: AlertCircle },
  ready: { label: 'Ready', color: 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC]', icon: CheckCircle2 },
  suspended: { label: 'Suspended', color: 'bg-[rgba(251,113,133,0.12)] text-[#FB7185]', icon: XCircle },
  disabled: { label: 'Disabled', color: 'bg-[var(--border-default)] text-[var(--text-muted)]', icon: XCircle },
  error: { label: 'Error', color: 'bg-[rgba(251,113,133,0.12)] text-[#FB7185]', icon: XCircle },
};

export function EmailSetupCard() {
  const { tenant } = useAuth();
  const [domains, setDomains] = useState<EmailDomain[]>([]);
  const [senders, setSenders] = useState<EmailSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [showAddSender, setShowAddSender] = useState(false);
  const [showTestEmail, setShowTestEmail] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newSender, setNewSender] = useState({ sender_name: '', from_email: '', reply_to_email: '', email_domain_id: '', is_default: true });
  const [testEmail, setTestEmail] = useState({ recipient: '', subject: '', sender_id: '' });
  const [readiness, setReadiness] = useState<{ ready: boolean; reason: string | null; domain_status: string; sender_status: string; integration_status?: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!tenant?.id) { setLoading(false); return; }
    setLoading(true);

    const [domainsRes, sendersRes, readinessRes] = await Promise.all([
      supabase.from('tenant_email_domains').select('*').eq('tenant_id', tenant.id).neq('status', 'disabled').order('created_at', { ascending: false }),
      supabase.from('tenant_email_senders').select('*').eq('tenant_id', tenant.id).is('archived_at', null).order('created_at', { ascending: false }),
      supabase.rpc('check_tenant_email_readiness', { p_tenant_id: tenant.id }),
    ]);

    setDomains((domainsRes.data || []) as EmailDomain[]);
    setSenders((sendersRes.data || []) as EmailSender[]);
    setReadiness(readinessRes.data as typeof readiness);

    const defaultDomain = (domainsRes.data || [])[0];
    if (defaultDomain) {
      setNewSender(prev => ({ ...prev, email_domain_id: defaultDomain.id }));
    }

    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  async function addDomain() {
    if (!tenant?.id || !newDomain) return;
    setActionLoading(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/integrations/email/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ domain: newDomain }),
      });
      const result = await response.json();
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: `Domain ${newDomain} added. Configure DNS records below.` });
        setNewDomain('');
        setShowAddDomain(false);
        await loadData();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to add domain' });
    }
    setActionLoading(false);
  }

  async function verifyDomain(domainId: string) {
    if (!tenant?.id) return;
    setActionLoading(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/integrations/email/domains/${domainId}/verify`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      const result = await response.json();
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else if (result.verified) {
        setMessage({ type: 'success', text: 'Domain verified! You can now configure your sender.' });
      } else {
        setMessage({ type: 'info', text: 'Verification checked but DNS records may not be propagated yet. Try again in a few minutes.' });
      }
      await loadData();
    } catch {
      setMessage({ type: 'error', text: 'Failed to verify domain' });
    }
    setActionLoading(false);
  }

  async function removeDomain(domainId: string) {
    if (!tenant?.id) return;
    if (!confirm('Remove this sending domain? This will disable email delivery using this domain.')) return;
    setActionLoading(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/integrations/email/domains/${domainId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });
      const result = await response.json();
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Domain removed.' });
        await loadData();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to remove domain' });
    }
    setActionLoading(false);
  }

  async function addSender() {
    if (!tenant?.id) return;
    setActionLoading(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/integrations/email/senders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify(newSender),
      });
      const result = await response.json();
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Sender configured! Email is ready to use.' });
        setShowAddSender(false);
        setNewSender({ sender_name: '', from_email: '', reply_to_email: '', email_domain_id: domains[0]?.id || '', is_default: true });
        await loadData();
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to add sender' });
    }
    setActionLoading(false);
  }

  async function sendTestEmail() {
    if (!tenant?.id || !testEmail.recipient) return;
    setActionLoading(true);
    setMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/integrations/email/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify(testEmail),
      });
      const result = await response.json();
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Test email sent! Check the recipient inbox. Delivery status will update via webhook.' });
        setShowTestEmail(false);
        setTestEmail({ recipient: '', subject: '', sender_id: '' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to send test email' });
    }
    setActionLoading(false);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  function recommendSubdomain(baseDomain: string): string {
    if (baseDomain.startsWith('mail.')) return baseDomain;
    return `mail.${baseDomain}`;
  }

  if (loading) {
    return <Loader2 className="h-5 w-5 animate-spin text-[var(--text-secondary)]" />;
  }

  const isReady = readiness?.ready;
  const hasVerifiedDomain = domains.some(d => d.status === 'verified' || d.status === 'ready');
  const hasSender = senders.length > 0;

  return (
    <div className="rounded-[18px] border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[var(--text-muted)]" />
          <div>
            <p className="text-sm font-semibold text-foreground">Email Delivery</p>
            <p className="text-xs text-muted-foreground">Powered by Resend — platform-managed</p>
          </div>
        </div>
        <Badge className={cn('border-0', isReady ? 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC]' : 'bg-[var(--border-default)] text-[var(--text-secondary)]')}>
          {isReady ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <AlertCircle className="mr-1 h-3 w-3" />}
          {isReady ? 'Ready' : 'Setup Required'}
        </Badge>
      </div>

      {message && (
        <div className={cn(
          'mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
          message.type === 'success' ? 'border-success/20 bg-success/10 text-success'
          : message.type === 'error' ? 'border-destructive/20 bg-destructive/10 text-destructive'
          : 'border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]'
        )}>
          {message.type === 'success' && <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          {message.type === 'error' && <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          {message.type === 'info' && <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Readiness checklist */}
      <div className="mt-4 space-y-2">
        <ReadinessItem label="Platform provider connected" done={readiness?.integration_status === 'connected'} />
        <ReadinessItem label="Verified sending domain" done={hasVerifiedDomain} />
        <ReadinessItem label="Active sender configured" done={hasSender} />
      </div>

      {/* Domains */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Sending Domains</h4>
          <Button size="sm" variant="outline" onClick={() => setShowAddDomain(!showAddDomain)} disabled={actionLoading}
            className="border-border text-xs">
            <Plus className="mr-1 h-3 w-3" /> Add Domain
          </Button>
        </div>

        {showAddDomain && (
          <div className="rounded-lg border border-border bg-[var(--card-bg)] p-3 space-y-2">
            <Label className="text-xs">Sending Domain or Subdomain</Label>
            <Input value={newDomain} onChange={(e) => setNewDomain(e.target.value)}
              placeholder="mail.yourbusiness.com" className="bg-[var(--card-bg)] text-sm" />
            <p className="text-[10px] text-muted-foreground">
              We recommend using a subdomain like <strong>mail.yourbusiness.com</strong> to isolate your email reputation.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={addDomain} disabled={actionLoading || !newDomain}
                className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] text-xs">
                {actionLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Globe className="mr-1 h-3 w-3" />}
                Add Domain
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddDomain(false)}
                className="border-border text-xs">Cancel</Button>
            </div>
          </div>
        )}

        {domains.length === 0 && !showAddDomain ? (
          <div className="rounded-lg border border-dashed border-border bg-[var(--card-bg)]/50 p-4 text-center">
            <Mail className="mx-auto h-6 w-6 text-muted-foreground/40" />
            <p className="mt-2 text-xs text-muted-foreground">No sending domains configured yet.</p>
          </div>
        ) : (
          domains.map((domain) => {
            const statusCfg = STATUS_CONFIG[domain.status] || STATUS_CONFIG.not_configured;
            const StatusIcon = statusCfg.icon;
            return (
              <div key={domain.id} className="rounded-lg border border-border bg-[var(--card-bg)] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                    <span className="text-sm font-medium text-foreground">{domain.domain}</span>
                    {domain.is_default && <Badge className="border-0 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] text-[10px]">Default</Badge>}
                  </div>
                  <Badge className={cn('border-0', statusCfg.color)}>
                    <StatusIcon className="mr-1 h-3 w-3" />
                    {statusCfg.label}
                  </Badge>
                </div>

                {/* DNS Records */}
                {domain.dns_records && domain.dns_records.length > 0 && domain.status !== 'verified' && domain.status !== 'ready' && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] font-medium uppercase text-muted-foreground">DNS Records — Add these at your domain provider:</p>
                    {domain.dns_records.map((record, i) => (
                      <div key={i} className="rounded border border-border bg-[var(--card-bg)] p-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Badge className="border-0 bg-[var(--elevated-bg)] text-[var(--text-secondary)] text-[10px] font-mono">{record.record_type}</Badge>
                            {record.priority != null && <span className="text-[10px] text-[var(--text-muted)]">Priority: {record.priority}</span>}
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(record.value)}
                            className="h-6 px-2 text-[10px]">
                            <Copy className="h-3 w-3" /> Copy
                          </Button>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">Name: <code className="text-foreground">{record.name}</code></p>
                        <p className="text-[10px] text-muted-foreground break-all">Value: <code className="text-foreground">{record.value}</code></p>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => verifyDomain(domain.id)} disabled={actionLoading}
                        className="border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5 text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10 text-xs">
                        {actionLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                        Verify Domain
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeDomain(domain.id)} disabled={actionLoading}
                        className="text-destructive hover:bg-destructive/10 text-xs">
                        <Trash2 className="mr-1 h-3 w-3" /> Remove
                      </Button>
                    </div>
                  </div>
                )}

                {domain.verified_at && (
                  <p className="mt-2 text-[10px] text-success">
                    <CheckCircle2 className="inline h-3 w-3 mr-1" />
                    Verified on {new Date(domain.verified_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Senders */}
      {hasVerifiedDomain && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Sender Identity</h4>
            <Button size="sm" variant="outline" onClick={() => setShowAddSender(!showAddSender)} disabled={actionLoading}
              className="border-border text-xs">
              <Plus className="mr-1 h-3 w-3" /> Add Sender
            </Button>
          </div>

          {showAddSender && (
            <div className="rounded-lg border border-border bg-[var(--card-bg)] p-3 space-y-2">
              <div>
                <Label className="text-xs">Sender Name</Label>
                <Input value={newSender.sender_name} onChange={(e) => setNewSender({ ...newSender, sender_name: e.target.value })}
                  placeholder="Big Mike's Charters" className="bg-[var(--card-bg)] text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">From Email</Label>
                <Input value={newSender.from_email} onChange={(e) => setNewSender({ ...newSender, from_email: e.target.value })}
                  placeholder={`bookings@${domains[0]?.domain || 'yourdomain.com'}`} className="bg-[var(--card-bg)] text-sm mt-1" />
                <p className="text-[10px] text-muted-foreground">Must use your verified domain: {domains[0]?.domain}</p>
              </div>
              <div>
                <Label className="text-xs">Reply-To Email (optional)</Label>
                <Input value={newSender.reply_to_email} onChange={(e) => setNewSender({ ...newSender, reply_to_email: e.target.value })}
                  placeholder="captain@yourbusiness.com" className="bg-[var(--card-bg)] text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Domain</Label>
                <select value={newSender.email_domain_id} onChange={(e) => setNewSender({ ...newSender, email_domain_id: e.target.value })}
                  className="w-full rounded-md border border-border bg-[var(--card-bg)] px-3 py-2 text-sm">
                  {domains.filter(d => d.status === 'verified' || d.status === 'ready').map(d => (
                    <option key={d.id} value={d.id}>{d.domain}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addSender} disabled={actionLoading || !newSender.sender_name || !newSender.from_email}
                  className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] text-xs">
                  {actionLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                  Save Sender
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddSender(false)}
                  className="border-border text-xs">Cancel</Button>
              </div>
            </div>
          )}

          {senders.length > 0 && senders.map((sender) => (
            <div key={sender.id} className="rounded-lg border border-border bg-[var(--card-bg)] p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{sender.sender_name}</p>
                  <p className="text-xs text-muted-foreground">{sender.from_email}</p>
                  {sender.reply_to_email && <p className="text-[10px] text-muted-foreground">Reply-To: {sender.reply_to_email}</p>}
                </div>
                {sender.is_default && <Badge className="border-0 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] text-[10px]">Default</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Test Email */}
      {isReady && (
        <div className="mt-4">
          <Button size="sm" variant="outline" onClick={() => setShowTestEmail(!showTestEmail)} disabled={actionLoading}
            className="border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/5 text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10 text-xs w-full">
            <Send className="mr-1.5 h-3.5 w-3.5" /> Send Test Email
          </Button>

          {showTestEmail && (
            <div className="mt-2 rounded-lg border border-border bg-[var(--card-bg)] p-3 space-y-2">
              <div>
                <Label className="text-xs">Recipient</Label>
                <Input value={testEmail.recipient} onChange={(e) => setTestEmail({ ...testEmail, recipient: e.target.value })}
                  placeholder="you@example.com" className="bg-[var(--card-bg)] text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Subject (optional)</Label>
                <Input value={testEmail.subject} onChange={(e) => setTestEmail({ ...testEmail, subject: e.target.value })}
                  placeholder="Test from your platform" className="bg-[var(--card-bg)] text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Sender</Label>
                <select value={testEmail.sender_id} onChange={(e) => setTestEmail({ ...testEmail, sender_id: e.target.value })}
                  className="w-full rounded-md border border-border bg-[var(--card-bg)] px-3 py-2 text-sm">
                  <option value="">Default sender</option>
                  {senders.map(s => <option key={s.id} value={s.id}>{s.from_email}</option>)}
                </select>
              </div>
              <Button size="sm" onClick={sendTestEmail} disabled={actionLoading || !testEmail.recipient}
                className="bg-[var(--brand-primary)] text-white hover:bg-[var(--brand-hover)] text-xs w-full">
                {actionLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                Send Test
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReadinessItem({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
      ) : (
        <div className="h-3.5 w-3.5 rounded-full border-2 border-[var(--text-secondary)]" />
      )}
      <span className={cn('text-xs', done ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
      {!done && <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground/40" />}
    </div>
  );
}
