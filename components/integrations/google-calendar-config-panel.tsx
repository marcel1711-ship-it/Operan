'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Calendar, Loader2, AlertCircle, CheckCircle2, XCircle, Link2, RefreshCw, Trash2,
  Settings, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type CalendarConnection = {
  id: string;
  provider: string;
  provider_account_id: string | null;
  selected_calendar_id: string | null;
  calendar_name: string | null;
  calendar_timezone: string | null;
  connection_status: string;
  last_sync_at: string | null;
  granted_scopes: string[];
  event_title_template: string | null;
  event_description_template: string | null;
  include_customer_details: boolean;
  include_meeting_point: boolean;
  create_on_confirm: boolean;
  update_on_change: boolean;
  cancel_on_reservation_cancel: boolean;
  block_availability_from_external: boolean;
};

export function GoogleCalendarConfigPanel({ tenantId, platformStatus }: { tenantId: string; platformStatus?: 'ready' | 'configuration_required' | 'degraded' | 'coming_soon' | 'disabled' }) {
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [calendars, setCalendars] = useState<Array<{ id: string; name: string; timeZone: string }>>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    event_title_template: 'Booking: {{customer_name}}',
    event_description_template: '',
    include_customer_details: false,
    include_meeting_point: false,
    create_on_confirm: true,
    update_on_change: true,
    cancel_on_reservation_cancel: true,
    block_availability_from_external: true,
  });

  const loadConnection = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tenant_calendar_connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('provider', 'google_calendar')
      .neq('connection_status', 'disconnected')
      .maybeSingle();
    if (!error) {
      setConnection(data as CalendarConnection | null);
      if (data) {
        setSettings({
          event_title_template: data.event_title_template || 'Booking: {{customer_name}}',
          event_description_template: data.event_description_template || '',
          include_customer_details: data.include_customer_details,
          include_meeting_point: data.include_meeting_point,
          create_on_confirm: data.create_on_confirm,
          update_on_change: data.update_on_change,
          cancel_on_reservation_cancel: data.cancel_on_reservation_cancel,
          block_availability_from_external: data.block_availability_from_external,
        });
      }
    }

    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadConnection(); }, [loadConnection]);

  async function getToken(): Promise<string | null> {
    return (await supabase.auth.getSession()).data.session?.access_token || null;
  }

  async function connect() {
    setActionLoading(true);
    setMessage(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/integrations/google-calendar?tenant_id=${tenantId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) { setMessage({ type: 'error', text: data.error }); setActionLoading(false); return; }
      window.location.href = data.auth_url;
    } catch {
      setMessage({ type: 'error', text: 'Failed to connect to Google Calendar.' });
      setActionLoading(false);
    }
  }

  async function loadCalendars() {
    setActionLoading(true);
    const token = await getToken();
    const res = await fetch(`/api/integrations/google-calendar/calendars?tenant_id=${tenantId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (data.calendars) setCalendars(data.calendars);
    else if (data.error) setMessage({ type: 'error', text: data.error });
    setActionLoading(false);
  }

  async function selectCalendar(calendarId: string, name: string, timezone: string) {
    setActionLoading(true);
    const token = await getToken();
    const res = await fetch('/api/integrations/google-calendar/calendars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: tenantId, calendar_id: calendarId, calendar_name: name, calendar_timezone: timezone }),
    });
    if (res.ok) { await loadConnection(); setMessage({ type: 'success', text: `Calendar "${name}" selected.` }); }
    else { setMessage({ type: 'error', text: 'Failed to select calendar.' }); }
    setActionLoading(false);
  }

  async function disconnect() {
    if (!confirm('Disconnect Google Calendar? Existing calendar events will remain, but future synchronization will stop. External busy-event blocks will be removed.')) return;
    setActionLoading(true);
    const token = await getToken();
    const res = await fetch('/api/integrations/google-calendar/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    if (res.ok) { await loadConnection(); setMessage({ type: 'success', text: 'Google Calendar disconnected.' }); }
    else { setMessage({ type: 'error', text: 'Failed to disconnect.' }); }
    setActionLoading(false);
  }

  async function testConnection() {
    setActionLoading(true);
    setMessage(null);
    const token = await getToken();
    const res = await fetch('/api/integrations/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: tenantId, category: 'calendar', provider: 'google_calendar' }),
    });
    const result = await res.json();
    if (result.success) setMessage({ type: 'success', text: 'Google Calendar connection is active.' });
    else setMessage({ type: 'error', text: result.details?.message || 'Connection test failed.' });
    setActionLoading(false);
  }

  async function syncBusyBlocks() {
    setActionLoading(true);
    setMessage(null);
    const token = await getToken();
    const res = await fetch('/api/integrations/google-calendar/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: tenantId, action: 'sync_busy_blocks' }),
    });
    const result = await res.json();
    if (result.success) setMessage({ type: 'success', text: `Synced ${result.blocksCreated} external busy blocks.` });
    else setMessage({ type: 'error', text: result.error || 'Sync failed.' });
    setActionLoading(false);
  }

  async function saveSettings() {
    setActionLoading(true);
    const { error } = await supabase
      .from('tenant_calendar_connections')
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('provider', 'google_calendar');
    if (!error) setMessage({ type: 'success', text: 'Settings saved.' });
    else setMessage({ type: 'error', text: 'Failed to save settings.' });
    setActionLoading(false);
  }

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" /></div>;

  const isConnected = connection?.connection_status === 'connected';
  const needsCalendarSelection = isConnected && !connection?.selected_calendar_id;
  const needsReconnect = connection?.connection_status === 'requires_action';

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

      {/* Platform not ready */}
      {platformStatus === 'configuration_required' && !isConnected && !needsReconnect && (
        <div className="rounded-lg border border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.12)] p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-[#FCD34D]" />
            <p className="text-xs font-semibold text-amber-800">Google Calendar is not available yet</p>
          </div>
          <p className="text-[11px] text-amber-700">
            Google Calendar OAuth has not been configured for this environment. Once the platform configuration is completed,
            you will be able to connect your Google account and sync bookings to your calendar.
          </p>
        </div>
      )}

      {/* Needs reconnect */}
      {needsReconnect && (
        <div className="rounded-lg border border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.12)] p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 text-[#FCD34D]" />
            <p className="text-xs font-semibold text-amber-800">Reconnect Required</p>
          </div>
          <p className="text-[11px] text-amber-700">Your Google authorization has expired or been revoked. Please reconnect to continue syncing.</p>
          <Button onClick={connect} disabled={actionLoading} size="sm" className="bg-primary text-white">
            {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
            Reconnect Google Calendar
          </Button>
        </div>
      )}

      {/* Connected state */}
      {isConnected && !needsReconnect && connection && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Google Calendar Connected</p>
              <Badge className="mt-0.5 border-0 bg-[rgba(74,222,128,0.12)] text-[#86EFAC]">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
              </Badge>
            </div>
          </div>

          {/* Calendar selection */}
          {needsCalendarSelection ? (
            <div className="rounded-lg border border-[rgba(99,119,255,0.20)] bg-primary/5 p-3 space-y-2">
              <p className="text-xs font-medium text-[var(--brand-primary)]">Select a Calendar</p>
              <p className="text-[11px] text-[var(--text-secondary)]">Choose which Google Calendar to sync your bookings to.</p>
              <Button onClick={loadCalendars} disabled={actionLoading} variant="outline" size="sm" className="w-full">
                {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Calendar className="mr-1.5 h-3.5 w-3.5" />}
                Load Available Calendars
              </Button>
              {calendars.length > 0 && (
                <div className="space-y-1 mt-2">
                  {calendars.map(cal => (
                    <button key={cal.id} onClick={() => selectCalendar(cal.id, cal.name, cal.timeZone)}
                      className="w-full rounded-md border border-[var(--border-default)] bg-[var(--card-bg)] p-2 text-left hover:border-[rgba(99,119,255,0.34)] transition-colors">
                      <p className="text-xs font-medium text-[var(--text-primary)]">{cal.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)]">{cal.timeZone}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {connection.calendar_name && (
                <div className="rounded-md bg-[var(--panel-bg)] border border-[var(--border-default)] p-2">
                  <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">Selected Calendar</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{connection.calendar_name}</p>
                </div>
              )}

              {connection.last_sync_at && (
                <div className="text-[10px] text-[var(--text-muted)]">
                  Last synced: {new Date(connection.last_sync_at).toLocaleString()}
                </div>
              )}

              {connection.granted_scopes.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium uppercase text-[var(--text-muted)] mb-1">Granted Permissions</p>
                  <div className="flex flex-wrap gap-1">
                    {connection.granted_scopes.map(s => (
                      <Badge key={s} className="border-0 bg-[var(--panel-bg)] text-[var(--text-secondary)] text-[10px]">
                        {s.replace('https://www.googleapis.com/auth/', '')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Settings toggle */}
              <Button onClick={() => setShowSettings(!showSettings)} variant="outline" size="sm" className="w-full text-xs">
                <Settings className="mr-1.5 h-3 w-3" />
                {showSettings ? 'Hide' : 'Show'} Sync Settings
              </Button>

              {showSettings && (
                <div className="rounded-lg border border-[var(--border-default)] bg-[var(--panel-bg)] p-3 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-[var(--text-secondary)]">Event Title Template</Label>
                    <Input value={settings.event_title_template}
                      onChange={e => setSettings({ ...settings, event_title_template: e.target.value })}
                      className="bg-[var(--card-bg)] text-sm" placeholder="Booking: {{customer_name}}" />
                    <p className="text-[10px] text-[var(--text-muted)]">Variables: {'{{customer_name}}, {{listing_name}}, {{booking_reference}}'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-[var(--text-secondary)]">Event Description Template</Label>
                    <Input value={settings.event_description_template}
                      onChange={e => setSettings({ ...settings, event_description_template: e.target.value })}
                      className="bg-[var(--card-bg)] text-sm" placeholder="Leave blank for auto-generated" />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-secondary)]">Include customer details in description</span>
                      <Switch checked={settings.include_customer_details} onCheckedChange={v => setSettings({ ...settings, include_customer_details: v })} />
                    </label>
                    <label className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-secondary)]">Include meeting point</span>
                      <Switch checked={settings.include_meeting_point} onCheckedChange={v => setSettings({ ...settings, include_meeting_point: v })} />
                    </label>
                    <label className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-secondary)]">Create event when booking is confirmed</span>
                      <Switch checked={settings.create_on_confirm} onCheckedChange={v => setSettings({ ...settings, create_on_confirm: v })} />
                    </label>
                    <label className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-secondary)]">Update event when booking changes</span>
                      <Switch checked={settings.update_on_change} onCheckedChange={v => setSettings({ ...settings, update_on_change: v })} />
                    </label>
                    <label className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-secondary)]">Cancel event when booking is cancelled</span>
                      <Switch checked={settings.cancel_on_reservation_cancel} onCheckedChange={v => setSettings({ ...settings, cancel_on_reservation_cancel: v })} />
                    </label>
                    <label className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-secondary)]">Block availability from external busy events</span>
                      <Switch checked={settings.block_availability_from_external} onCheckedChange={v => setSettings({ ...settings, block_availability_from_external: v })} />
                    </label>
                  </div>
                  <Button onClick={saveSettings} disabled={actionLoading} size="sm" className="w-full bg-primary text-white">
                    {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                    Save Settings
                  </Button>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={testConnection} disabled={actionLoading}
                  className="text-xs border-[var(--border-default)] text-[var(--text-secondary)]">
                  {actionLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                  Test Connection
                </Button>
                {connection.block_availability_from_external && (
                  <Button size="sm" variant="outline" onClick={syncBusyBlocks} disabled={actionLoading}
                    className="text-xs border-[var(--border-default)] text-[var(--text-secondary)]">
                    <RefreshCw className="mr-1 h-3 w-3" /> Sync Busy Blocks
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={disconnect} disabled={actionLoading}
                  className="text-xs text-destructive hover:text-destructive">
                  <Trash2 className="mr-1 h-3 w-3" /> Disconnect
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Not connected, platform ready */}
      {!isConnected && !needsReconnect && platformStatus !== 'configuration_required' && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Connect your Google account to automatically create calendar events for new bookings and sync availability.
          </p>
          <div className="rounded-md bg-[var(--panel-bg)] border border-[var(--border-default)] p-2.5 space-y-1">
            <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">What you get</p>
            <ul className="text-[11px] text-[var(--text-secondary)] space-y-0.5">
              <li>- Automatic calendar events for confirmed bookings</li>
              <li>- Event updates when reservations change</li>
              <li>- Event cancellation when bookings are cancelled</li>
              <li>- Block availability from external busy events</li>
            </ul>
          </div>
          <Button onClick={connect} disabled={actionLoading} className="w-full bg-primary text-white">
            {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
            Connect Google Calendar
          </Button>
        </div>
      )}
    </div>
  );
}
