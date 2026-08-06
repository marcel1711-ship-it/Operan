'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Webhook, Plus, Trash2, Send, RefreshCw, Loader2,
  AlertCircle, CheckCircle2, XCircle, Copy, Check, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type WebhookEndpoint = {
  id: string;
  name: string;
  url: string;
  events: string[];
  signing_secret: string;
  is_active: boolean;
  last_delivery_at: string | null;
  last_delivery_status: string | null;
  created_at: string;
};

type WebhookDelivery = {
  id: string;
  event_type: string;
  status: string;
  attempt_count: number;
  response_code: number | null;
  error_message: string | null;
  created_at: string;
};

const AVAILABLE_EVENTS = [
  'reservation.created',
  'reservation.confirmed',
  'reservation.updated',
  'reservation.cancelled',
  'payment.succeeded',
  'payment.failed',
  'customer.created',
  'waiver.completed',
  'workflow.completed',
];

export function WebhooksConfigPanel({ tenantId }: { tenantId: string }) {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState({ name: '', url: '', events: [] as string[] });
  const [deliveries, setDeliveries] = useState<Record<string, WebhookDelivery[]>>({});
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);

  const loadEndpoints = useCallback(async () => {
    setLoading(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`/api/integrations/webhooks?tenant_id=${tenantId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setEndpoints(data.endpoints || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadEndpoints(); }, [loadEndpoints]);

  async function createEndpoint() {
    setActionLoading(true);
    setMessage(null);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch('/api/integrations/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: tenantId, name: newEndpoint.name, url: newEndpoint.url, events: newEndpoint.events }),
    });
    const result = await res.json();
    if (!res.ok) { setMessage({ type: 'error', text: result.error }); setActionLoading(false); return; }
    setShowAdd(false);
    setNewEndpoint({ name: '', url: '', events: [] });
    await loadEndpoints();
    setMessage({ type: 'success', text: 'Webhook endpoint created.' });
    setActionLoading(false);
  }

  async function deleteEndpoint(id: string) {
    if (!confirm('Delete this webhook endpoint? This action cannot be undone.')) return;
    setActionLoading(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch(`/api/integrations/webhooks/${id}?tenant_id=${tenantId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    await loadEndpoints();
    setActionLoading(false);
  }

  async function testEndpoint(id: string) {
    setActionLoading(true);
    setMessage(null);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`/api/integrations/webhooks/${id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    const result = await res.json();
    if (result.success) { setMessage({ type: 'success', text: `Test delivered successfully (HTTP ${result.response_code}).` }); }
    else { setMessage({ type: 'error', text: `Test delivery failed: ${result.error}` }); }
    await loadEndpoints();
    setActionLoading(false);
  }

  async function rotateSecret(id: string) {
    if (!confirm('Rotate the signing secret? You must update your receiving endpoint to use the new secret.')) return;
    setActionLoading(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`/api/integrations/webhooks/${id}/rotate-secret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    if (res.ok) { await loadEndpoints(); setMessage({ type: 'success', text: 'Signing secret rotated.' }); }
    else { setMessage({ type: 'error', text: 'Failed to rotate secret.' }); }
    setActionLoading(false);
  }

  async function toggleEndpoint(id: string, active: boolean) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch(`/api/integrations/webhooks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: tenantId, is_active: active }),
    });
    await loadEndpoints();
  }

  async function loadDeliveries(endpointId: string) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`/api/integrations/webhooks/${endpointId}/deliveries?tenant_id=${tenantId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setDeliveries(prev => ({ ...prev, [endpointId]: data.deliveries || [] }));
  }

  function toggleEvent(eventName: string) {
    setNewEndpoint(prev => ({
      ...prev,
      events: prev.events.includes(eventName)
        ? prev.events.filter(e => e !== eventName)
        : [...prev.events, eventName],
    }));
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedSecret(id);
    setTimeout(() => setCopiedSecret(null), 2000);
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

      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">Send real-time notifications to external systems when events occur.</p>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)} className="h-7 text-xs shrink-0">
          <Plus className="mr-1 h-3 w-3" /> Add Endpoint
        </Button>
      </div>

      {showAdd && (
        <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-3 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-[var(--text-secondary)]">Endpoint Name</Label>
            <Input placeholder="e.g. Zapier Webhook" value={newEndpoint.name}
              onChange={e => setNewEndpoint({ ...newEndpoint, name: e.target.value })} className="bg-[var(--card-bg)] text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[var(--text-secondary)]">Destination URL</Label>
            <Input placeholder="https://hooks.zapier.com/..." value={newEndpoint.url}
              onChange={e => setNewEndpoint({ ...newEndpoint, url: e.target.value })} className="bg-[var(--card-bg)] text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-[var(--text-secondary)]">Events to Send</Label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_EVENTS.map(event => (
                <button key={event} onClick={() => toggleEvent(event)}
                  className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors',
                    newEndpoint.events.includes(event)
                      ? 'border-[var(--brand-primary)] bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)]'
                      : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:border-[rgba(99,119,255,0.34)]')}>
                  {event}
                </button>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={createEndpoint} disabled={actionLoading || !newEndpoint.name || !newEndpoint.url}
            className="w-full bg-primary text-white">
            {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
            Create Endpoint
          </Button>
        </div>
      )}

      {endpoints.length === 0 && !showAdd && (
        <p className="text-xs text-[var(--text-muted)] text-center py-4">No webhook endpoints configured yet.</p>
      )}

      {endpoints.map(ep => (
        <div key={ep.id} className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{ep.name}</p>
              <p className="text-[10px] text-[var(--text-muted)] truncate">{ep.url}</p>
            </div>
            <Switch checked={ep.is_active} onCheckedChange={v => toggleEndpoint(ep.id, v)} />
          </div>

          <div className="flex flex-wrap gap-1">
            {ep.events.map(e => <Badge key={e} className="border-0 bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)] text-[10px]">{e}</Badge>)}
          </div>

          <div className="rounded-md bg-[var(--panel-bg)] border border-[var(--border-default)] p-2">
            <p className="text-[10px] font-medium uppercase text-[var(--text-muted)] mb-1">Signing Secret</p>
            <div className="flex items-center gap-1.5">
              <code className="flex-1 truncate font-mono text-[11px] text-[var(--text-secondary)]">{ep.signing_secret.substring(0, 20)}...</code>
              <Button size="sm" variant="ghost" onClick={() => copyToClipboard(ep.signing_secret, ep.id)} className="h-6 px-1.5">
                {copiedSecret === ep.id ? <Check className="h-3 w-3 text-[#86EFAC]" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {ep.last_delivery_at && (
            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
              <Clock className="h-3 w-3" />
              Last delivery: {new Date(ep.last_delivery_at).toLocaleString()}
              {ep.last_delivery_status === 'delivered' ? (
                <CheckCircle2 className="h-3 w-3 text-[#86EFAC]" />
              ) : ep.last_delivery_status === 'failed' ? (
                <XCircle className="h-3 w-3 text-[#FB7185]" />
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => testEndpoint(ep.id)} disabled={actionLoading}
              className="h-7 text-xs border-[var(--border-default)] text-[var(--text-secondary)]">
              <Send className="mr-1 h-3 w-3" /> Test
            </Button>
            <Button size="sm" variant="outline" onClick={() => rotateSecret(ep.id)} disabled={actionLoading}
              className="h-7 text-xs border-[var(--border-default)] text-[var(--text-secondary)]">
              <RefreshCw className="mr-1 h-3 w-3" /> Rotate Secret
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              if (expandedEndpoint === ep.id) { setExpandedEndpoint(null); }
              else { setExpandedEndpoint(ep.id); loadDeliveries(ep.id); }
            }} className="h-7 text-xs border-[var(--border-default)] text-[var(--text-secondary)]">
              <Clock className="mr-1 h-3 w-3" /> History
            </Button>
            <Button size="sm" variant="ghost" onClick={() => deleteEndpoint(ep.id)} disabled={actionLoading}
              className="h-7 text-xs text-destructive hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {expandedEndpoint === ep.id && (
            <div className="border-t border-[var(--border-default)] pt-2 space-y-1 max-h-40 overflow-y-auto">
              {(deliveries[ep.id] || []).length === 0 ? (
                <p className="text-[10px] text-[var(--text-muted)] text-center py-2">No deliveries yet.</p>
              ) : (
                (deliveries[ep.id] || []).map(d => (
                  <div key={d.id} className="flex items-center justify-between text-[10px] py-1">
                    <span className="text-[var(--text-secondary)] font-mono">{d.event_type}</span>
                    <div className="flex items-center gap-2">
                      <span className={d.status === 'delivered' ? 'text-[#86EFAC]' : d.status === 'failed' ? 'text-[#FB7185]' : 'text-[var(--text-muted)]'}>
                        {d.status}
                      </span>
                      {d.response_code && <span className="text-[var(--text-muted)]">HTTP {d.response_code}</span>}
                      <span className="text-[var(--text-muted)]">{new Date(d.created_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
