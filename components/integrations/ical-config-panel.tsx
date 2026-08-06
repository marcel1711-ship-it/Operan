'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Calendar, Globe, Copy, Check, RefreshCw, Plus, Trash2,
  Loader2, AlertCircle, CheckCircle2, XCircle, Link2, Download, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type IcalFeed = {
  id: string;
  feed_type: 'export' | 'import';
  name: string;
  feed_token: string | null;
  include_cancelled: boolean;
  include_customer_info: boolean;
  selected_listing_ids: string[];
  source_url: string | null;
  assigned_listing_ids: string[];
  conflict_handling: string;
  sync_frequency: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
};

export function IcalConfigPanel({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [feeds, setFeeds] = useState<IcalFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAddExport, setShowAddExport] = useState(false);
  const [showAddImport, setShowAddImport] = useState(false);
  const [newFeed, setNewFeed] = useState({ name: '', source_url: '', sync_frequency: 'daily', conflict_handling: 'skip' });
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadFeeds = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tenant_ical_feeds')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    if (!error) setFeeds((data || []) as IcalFeed[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadFeeds(); }, [loadFeeds]);

  async function createExportFeed() {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/integrations/ical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantId, feed_type: 'export', name: newFeed.name || 'Calendar Export' }),
      });
      const result = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: result.error }); setActionLoading(false); return; }
      setShowAddExport(false);
      setNewFeed({ name: '', source_url: '', sync_frequency: 'daily', conflict_handling: 'skip' });
      await loadFeeds();
      setMessage({ type: 'success', text: 'Export feed created successfully.' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to create feed.' });
    }
    setActionLoading(false);
  }

  async function createImportFeed() {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/integrations/ical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({
          tenant_id: tenantId, feed_type: 'import', name: newFeed.name || 'Calendar Import',
          source_url: newFeed.source_url, sync_frequency: newFeed.sync_frequency, conflict_handling: newFeed.conflict_handling,
        }),
      });
      const result = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: result.error }); setActionLoading(false); return; }
      setShowAddImport(false);
      setNewFeed({ name: '', source_url: '', sync_frequency: 'daily', conflict_handling: 'skip' });
      await loadFeeds();
      setMessage({ type: 'success', text: 'Import feed created successfully.' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to create feed.' });
    }
    setActionLoading(false);
  }

  async function deleteFeed(feedId: string) {
    if (!confirm('Remove this calendar feed?')) return;
    setActionLoading(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`/api/integrations/ical/${feedId}?tenant_id=${tenantId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) { await loadFeeds(); setMessage({ type: 'success', text: 'Feed removed.' }); }
    else { setMessage({ type: 'error', text: 'Failed to remove feed.' }); }
    setActionLoading(false);
  }

  async function regenerateToken(feedId: string) {
    if (!confirm('Regenerate the feed token? The old URL will stop working immediately.')) return;
    setActionLoading(true);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`/api/integrations/ical/${feedId}/regenerate-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    if (res.ok) { await loadFeeds(); setMessage({ type: 'success', text: 'Token regenerated. Update your calendar subscription URL.' }); }
    else { setMessage({ type: 'error', text: 'Failed to regenerate token.' }); }
    setActionLoading(false);
  }

  async function toggleFeedSetting(feedId: string, field: 'include_cancelled' | 'include_customer_info', value: boolean) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    await fetch(`/api/integrations/ical/${feedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: tenantId, [field]: value }),
    });
    await loadFeeds();
  }

  function copyToClipboard(text: string, feedId: string) {
    navigator.clipboard.writeText(text);
    setCopiedToken(feedId);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" /></div>;

  const exportFeeds = feeds.filter(f => f.feed_type === 'export');
  const importFeeds = feeds.filter(f => f.feed_type === 'import');

  return (
    <div className="space-y-5">
      {message && (
        <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-xs',
          message.type === 'success' ? 'border-[rgba(74,222,128,0.20)] bg-[rgba(74,222,128,0.12)] text-[#86EFAC]' : 'border-[rgba(251,113,133,0.20)] bg-[rgba(251,113,133,0.12)] text-[#FB7185]')}>
          {message.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Export Feeds */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            <Download className="h-3.5 w-3.5" /> Export Feeds
          </h4>
          <Button size="sm" variant="outline" onClick={() => setShowAddExport(!showAddExport)} className="h-7 text-xs">
            <Plus className="mr-1 h-3 w-3" /> New Export
          </Button>
        </div>

        {showAddExport && (
          <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-3 space-y-2">
            <Input placeholder="Feed name (e.g. Bookings Calendar)" value={newFeed.name}
              onChange={e => setNewFeed({ ...newFeed, name: e.target.value })} className="bg-[var(--card-bg)] text-sm" />
            <Button size="sm" onClick={createExportFeed} disabled={actionLoading} className="w-full bg-primary text-white">
              {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
              Create Export Feed
            </Button>
          </div>
        )}

        {exportFeeds.length === 0 && !showAddExport && (
          <p className="text-xs text-[var(--text-muted)]">No export feeds yet. Create one to share your booking calendar with external systems.</p>
        )}

        {exportFeeds.map(feed => (
          <div key={feed.id} className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{feed.name}</p>
                <Badge className="mt-0.5 border-0 bg-[rgba(74,222,128,0.12)] text-[#86EFAC] text-[10px]">Active</Badge>
              </div>
              <Button size="sm" variant="ghost" onClick={() => deleteFeed(feed.id)} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {feed.feed_token && (
              <div className="rounded-md bg-[var(--panel-bg)] border border-[var(--border-default)] p-2">
                <p className="text-[10px] font-medium uppercase text-[var(--text-muted)] mb-1">Subscription URL</p>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 truncate font-mono text-[11px] text-[var(--text-secondary)]">{baseUrl}/ical/{feed.feed_token}</code>
                  <Button size="sm" variant="ghost" onClick={() => copyToClipboard(`${baseUrl}/ical/${feed.feed_token}`, feed.id)} className="h-6 px-1.5">
                    {copiedToken === feed.id ? <Check className="h-3 w-3 text-[#86EFAC]" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Include cancelled reservations</span>
                <Switch checked={feed.include_cancelled} onCheckedChange={v => toggleFeedSetting(feed.id, 'include_cancelled', v)} />
              </label>
              <label className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-secondary)]">Include customer details</span>
                <Switch checked={feed.include_customer_info} onCheckedChange={v => toggleFeedSetting(feed.id, 'include_customer_info', v)} />
              </label>
            </div>

            <Button size="sm" variant="outline" onClick={() => regenerateToken(feed.id)} disabled={actionLoading}
              className="w-full text-xs border-[var(--border-default)] text-[var(--text-secondary)]">
              <RefreshCw className="mr-1.5 h-3 w-3" /> Regenerate URL
            </Button>
          </div>
        ))}
      </div>

      {/* Import Feeds */}
      <div className="space-y-3 border-t border-[var(--border-default)] pt-4">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            <Upload className="h-3.5 w-3.5" /> Import Feeds
          </h4>
          <Button size="sm" variant="outline" onClick={() => setShowAddImport(!showAddImport)} className="h-7 text-xs">
            <Plus className="mr-1 h-3 w-3" /> New Import
          </Button>
        </div>

        {showAddImport && (
          <div className="rounded-[18px] border border-[var(--border-default)] bg-[var(--panel-bg)] p-3 space-y-2">
            <Input placeholder="Feed name (e.g. Airbnb Calendar)" value={newFeed.name}
              onChange={e => setNewFeed({ ...newFeed, name: e.target.value })} className="bg-[var(--card-bg)] text-sm" />
            <Input placeholder="https://www.airbnb.com/calendar/ical/..." value={newFeed.source_url}
              onChange={e => setNewFeed({ ...newFeed, source_url: e.target.value })} className="bg-[var(--card-bg)] text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-[var(--text-muted)]">Sync Frequency</Label>
                <select className="w-full rounded-md border border-[var(--border-default)] bg-[var(--card-bg)] px-2 py-1.5 text-xs"
                  value={newFeed.sync_frequency} onChange={e => setNewFeed({ ...newFeed, sync_frequency: e.target.value })}>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="manual">Manual</option>
                </select>
              </div>
              <div>
                <Label className="text-[10px] text-[var(--text-muted)]">Conflict Handling</Label>
                <select className="w-full rounded-md border border-[var(--border-default)] bg-[var(--card-bg)] px-2 py-1.5 text-xs"
                  value={newFeed.conflict_handling} onChange={e => setNewFeed({ ...newFeed, conflict_handling: e.target.value })}>
                  <option value="skip">Skip conflicts</option>
                  <option value="overwrite">Overwrite</option>
                  <option value="block">Block availability</option>
                </select>
              </div>
            </div>
            <Button size="sm" onClick={createImportFeed} disabled={actionLoading || !newFeed.source_url} className="w-full bg-primary text-white">
              {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
              Create Import Feed
            </Button>
          </div>
        )}

        {importFeeds.length === 0 && !showAddImport && (
          <p className="text-xs text-[var(--text-muted)]">No import feeds yet. Import external calendars (Airbnb, Booking.com, etc.) to block availability automatically.</p>
        )}

        {importFeeds.map(feed => (
          <div key={feed.id} className="rounded-[18px] border border-[var(--border-default)] bg-[var(--card-bg)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{feed.name}</p>
                <p className="text-[10px] text-[var(--text-muted)] truncate max-w-[200px]">{feed.source_url}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => deleteFeed(feed.id)} className="h-7 text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <Badge className="border-0 bg-[var(--panel-bg)] text-[var(--text-secondary)] capitalize">{feed.sync_frequency}</Badge>
              <Badge className="border-0 bg-[var(--panel-bg)] text-[var(--text-secondary)] capitalize">{feed.conflict_handling}</Badge>
              {feed.last_sync_at && <span className="text-[var(--text-muted)]">Last sync: {new Date(feed.last_sync_at).toLocaleDateString()}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
