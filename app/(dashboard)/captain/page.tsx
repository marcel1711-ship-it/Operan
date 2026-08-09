'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import {
  Anchor, Loader2, Ship, Calendar, Clock, User, Hash,
  ExternalLink, Copy, CheckCircle2, AlertCircle, Plus,
  ChevronDown, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type Reservation = {
  id: string;
  booking_reference: string;
  client_name: string;
  start_at: string;
  end_at: string;
  charter_date: string;
  guest_count: number;
  booking_status: string;
  listing_name: string;
};

type CaptainSession = {
  id: string;
  token: string;
  status: string;
  created_at: string;
  expires_at: string;
  captain_name: string | null;
  reservation_id: string;
};

export default function CaptainPage() {
  const { tenant } = useAuth();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [sessions, setSessions] = useState<CaptainSession[]>([]);
  const [creating, setCreating] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming');

  const loadData = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);

    const now = new Date().toISOString();
    let query = supabase
      .from('reservations')
      .select('id, booking_reference, client_name, start_at, end_at, charter_date, guest_count, booking_status, listing_id')
      .eq('tenant_id', tenant.id)
      .in('booking_status', ['confirmed', 'in_progress', 'awaiting_payment'])
      .order('start_at', { ascending: true });

    if (filter === 'upcoming') {
      query = query.gte('start_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    }

    const { data: resData } = await query.limit(50);

    if (resData && resData.length > 0) {
      const listingIds = [...new Set(resData.map(r => r.listing_id).filter(Boolean))];
      const { data: listings } = await supabase
        .from('listings')
        .select('id, name')
        .in('id', listingIds);
      const listingMap = new Map((listings || []).map(l => [l.id, l.name]));

      setReservations(resData.map(r => ({
        ...r,
        listing_name: listingMap.get(r.listing_id) || 'Unknown vessel',
      })));
    } else {
      setReservations([]);
    }

    const { data: sessData } = await supabase
      .from('captain_sessions')
      .select('id, token, status, created_at, expires_at, captain_name, reservation_id')
      .eq('tenant_id', tenant.id)
      .gt('expires_at', now)
      .order('created_at', { ascending: false });

    setSessions(sessData || []);
    setLoading(false);
  }, [tenant?.id, filter]);

  useEffect(() => { loadData(); }, [loadData]);

  async function createSession(reservationId: string) {
    if (!tenant?.id) return;
    setCreating(reservationId);
    setMessage(null);

    const { data: result, error } = await supabase.rpc('create_captain_session', {
      p_tenant_id: tenant.id,
      p_reservation_id: reservationId,
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
      setCreating(null);
      return;
    }

    setMessage({ type: 'success', text: result.reused ? 'Existing session link copied.' : 'Captain session created.' });
    setCreating(null);

    const url = `${window.location.origin}/captain/${result.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(result.token);
    setTimeout(() => setCopiedToken(null), 3000);

    await loadData();
  }

  async function copySessionLink(token: string) {
    const url = `${window.location.origin}/captain/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  function formatTime(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    in_progress: 'bg-emerald-100 text-emerald-800',
    completed: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-red-100 text-red-700',
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-[var(--card-bg)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-teal/20">
              <Anchor className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Captain Operations</h1>
              <p className="text-xs text-muted-foreground">Generate captain links for pre-departure review and charter control</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={loadData} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        {message && (
          <div className={cn('mb-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm', message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200')}>
            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {message.text}
          </div>
        )}

        {/* Filter */}
        <div className="mb-4 flex gap-2">
          <button onClick={() => setFilter('upcoming')} className={cn('rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', filter === 'upcoming' ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/80')}>
            Upcoming
          </button>
          <button onClick={() => setFilter('all')} className={cn('rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', filter === 'all' ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground hover:bg-secondary/80')}>
            All Active
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : reservations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-[var(--card-bg)] py-20 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary">
              <Ship className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-foreground">No upcoming reservations</h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Confirmed reservations will appear here. Generate a captain link to share the pre-departure checklist.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {reservations.map(res => {
              const existingSession = sessions.find(s => s.reservation_id === res.id && s.status !== 'cancelled');
              return (
                <div key={res.id} className="rounded-2xl border border-border bg-[var(--card-bg)] p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                        <Ship className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-foreground">{res.listing_name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(res.charter_date || res.start_at)}</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatTime(res.start_at)} — {formatTime(res.end_at)}</span>
                          <span className="flex items-center gap-1"><User className="h-3 w-3" />{res.client_name}</span>
                          <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{res.booking_reference}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {existingSession ? (
                        <>
                          <Badge className={cn('border-0 text-[10px] font-bold uppercase', statusColor[existingSession.status] || statusColor.pending)}>
                            {existingSession.status}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copySessionLink(existingSession.token)}
                            className="gap-1.5 text-xs"
                          >
                            {copiedToken === existingSession.token ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                            {copiedToken === existingSession.token ? 'Copied!' : 'Copy Link'}
                          </Button>
                          <a
                            href={`/captain/${existingSession.token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-[var(--card-bg)] px-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary"
                          >
                            <ExternalLink className="h-3 w-3" /> Open
                          </a>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => createSession(res.id)}
                          disabled={creating === res.id}
                          className="gap-1.5 text-xs"
                        >
                          {creating === res.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                          Generate Captain Link
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
