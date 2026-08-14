'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays, Search, Loader2, Filter, Users,
  Phone, Mail, Anchor, DollarSign,
  ChevronLeft, ChevronRight, Check, X, Clock, Globe, Trash2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { fetchReservationsByTenant } from '@/lib/services/reservation-service';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ReservationCalendar } from '@/components/dashboard/reservation-calendar';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { getReservationStartDate, getReservationVessel } from '@/lib/reservation-utils';
import type { BookingStatus } from '@/lib/types';
import type { NormalizedReservation } from '@/lib/reservation-utils';

type ViewMode = 'list' | 'calendar' | 'departures';
type SourceFilter = 'all' | 'public_booking' | 'public_request' | 'manual' | 'imported_ghl' | 'timetree';

const PAGE_SIZE = 50;

const STATUS_COLORS: Record<BookingStatus, string> = {
  inquiry: 'bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)] border-primary/20',
  pending: 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D] border-warning/20',
  awaiting_payment: 'bg-[rgba(251,191,36,0.12)] text-[#FCD34D] border-warning/20',
  confirmed: 'bg-[rgba(99,119,255,0.10)] text-[var(--brand-primary)] border-primary/30',
  in_progress: 'bg-violet-50 text-violet-600 border-violet-200',
  completed: 'bg-[rgba(74,222,128,0.12)] text-[#86EFAC] border-success/20',
  cancelled: 'bg-[rgba(251,113,133,0.12)] text-[#FB7185] border-destructive/20',
  expired: 'bg-secondary/30 text-muted-foreground border-border',
  no_show: 'bg-[rgba(251,113,133,0.12)] text-[#FB7185] border-destructive/20',
};

export default function ReservationsPage() {
  const router = useRouter();
  const { user, role, tenant, loading: authLoading } = useAuth();
  const [reservations, setReservations] = useState<NormalizedReservation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [page, setPage] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (tenantId: string) => {
    setLoading(true);
    try {
      const result = await fetchReservationsByTenant(tenantId, {
        status: statusFilter,
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setReservations(result.data);
      setTotal(result.total);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [statusFilter, debouncedSearch, page]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) { router.push('/login'); return; }
      if (role === 'super_admin') { router.push('/super-admin'); return; }
      if (tenant) load(tenant.id);
    }
  }, [authLoading, user, role, tenant, router, load]);

  async function approveRequest(reservationId: string) {
    setActionLoading(reservationId);
    const { data, error } = await supabase.rpc('approve_booking_request', {
      p_reservation_id: reservationId,
      p_acting_user_id: user?.id || null,
      p_actor_name: 'Tenant Admin',
    });
    if (!error && (data as { success?: boolean })?.success) {
      setReservations(prev => prev.map(r => r.id === reservationId ? { ...r, booking_status: 'awaiting_payment' as BookingStatus } : r));
    }
    setActionLoading(null);
  }

  async function declineRequest(reservationId: string) {
    setActionLoading(reservationId);
    const { data, error } = await supabase.rpc('decline_booking_request', {
      p_reservation_id: reservationId,
      p_acting_user_id: user?.id || null,
      p_actor_name: 'Tenant Admin',
      p_reason: 'Declined by operator',
    });
    if (!error && (data as { success?: boolean })?.success) {
      setReservations(prev => prev.map(r => r.id === reservationId ? { ...r, booking_status: 'cancelled' as BookingStatus } : r));
    }
    setActionLoading(null);
  }

  async function deleteReservation(reservationId: string) {
    if (!tenant) return;
    setActionLoading(reservationId);
    const { data, error } = await supabase.rpc('delete_reservation', {
      p_reservation_id: reservationId,
      p_tenant_id: tenant.id,
    });
    if (!error && (data as { success?: boolean })?.success) {
      setReservations(prev => prev.filter(r => r.id !== reservationId));
      setTotal(prev => prev - 1);
    }
    setActionLoading(null);
    setDeleteConfirm(null);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== 'tenant_admin') return null;

  const filteredReservations = reservations.filter(r => {
    if (sourceFilter === 'all') return true;
    if (sourceFilter === 'public_booking') return r.source === 'public_booking';
    if (sourceFilter === 'public_request') return r.source === 'public_request';
    if (sourceFilter === 'manual') return r.source === 'manual';
    if (sourceFilter === 'imported_ghl') return r.source === 'imported_ghl';
    if (sourceFilter === 'timetree') return r.source === 'timetree';
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-[var(--card-bg)] px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-dark shadow-md shadow-teal/20">
              <CalendarDays className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Reservations</h1>
              <p className="text-xs text-muted-foreground">{total} total bookings</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/30 p-1">
              <button onClick={() => setView('list')} className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', view === 'list' ? 'bg-[var(--card-bg)] text-foreground shadow-sm' : 'text-muted-foreground')}>List</button>
              <button onClick={() => setView('calendar')} className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', view === 'calendar' ? 'bg-[var(--card-bg)] text-foreground shadow-sm' : 'text-muted-foreground')}>Calendar</button>
              <button onClick={() => setView('departures')} className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors', view === 'departures' ? 'bg-[var(--card-bg)] text-foreground shadow-sm' : 'text-muted-foreground')}>Departures</button>
            </div>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8">
        {view === 'list' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="Search by name, email, vessel..." value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-border bg-[var(--card-bg)] py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal/30" />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                  <SelectTrigger className="w-40 bg-[var(--card-bg)]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending Approval</SelectItem>
                    <SelectItem value="awaiting_payment">Awaiting Payment</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
                  <SelectTrigger className="w-36 bg-[var(--card-bg)]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="public_booking">Public Booking</SelectItem>
                    <SelectItem value="public_request">Public Request</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="imported_ghl">Imported</SelectItem>
                    <SelectItem value="timetree">TimeTree</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filteredReservations.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-[var(--card-bg)] py-20 shadow-sm">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary"><CalendarDays className="h-8 w-8 text-muted-foreground" /></div>
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-foreground">{total === 0 ? 'No reservations yet' : 'No matches found'}</h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">{total === 0 ? 'Bookings will appear here once customers reserve or you create them manually.' : 'Try adjusting your search or filter.'}</p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[18px] border border-border shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Client</th>
                      <th className="px-4 py-3 hidden md:table-cell">Listing</th>
                      <th className="px-4 py-3 hidden lg:table-cell">Date</th>
                      <th className="px-4 py-3 hidden sm:table-cell">Guests</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReservations.map((r) => {
                      const d = getReservationStartDate(r);
                      const vessel = getReservationVessel(r);
                      const statusCls = STATUS_COLORS[r.booking_status as BookingStatus] || STATUS_COLORS.confirmed;
                      const isPending = r.booking_status === 'pending';
                      const isAwaitingPayment = r.booking_status === 'awaiting_payment';
                      const isExpired = r.booking_status === 'expired';
                      const isPublicBooking = r.source === 'public_booking' || r.source === 'public_request';
                      const isTimeTree = r.source === 'timetree';
                      const holdExpiringSoon = isAwaitingPayment && r.expires_at && new Date(r.expires_at).getTime() - Date.now() < 10 * 60 * 1000;
                      return (
                        <tr key={r.id} className={cn('border-b border-border transition-colors hover:bg-secondary/30 last:border-0', isExpired && 'opacity-50', isTimeTree && 'border-l-[3px] border-l-purple-500 bg-purple-500/5')}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="font-medium text-foreground">{r.client_name}</p>
                                {r.booking_reference && <p className="text-xs text-muted-foreground">{r.booking_reference}</p>}
                              </div>
                              {isPublicBooking && <Globe className="h-3 w-3 text-[var(--brand-primary)]" />}
                              {isTimeTree && <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold text-purple-700">External</span>}
                            </div>
                            {r.client_email && <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Mail className="h-3 w-3" />{r.client_email}</p>}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="flex items-center gap-1.5 text-muted-foreground"><Anchor className="h-3.5 w-3.5" />{vessel || '—'}</span>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                            {d ? formatDate(d.toISOString()) : '—'}
                            {r.start_at && <p className="text-[10px]">{new Date(r.start_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</p>}
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">{r.guest_count || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            {isTimeTree ? (
                              <span className="text-xs text-purple-600">
                                {r.start_at && r.end_at ? `${Math.round((new Date(r.end_at).getTime() - new Date(r.start_at).getTime()) / 3600000)}h` : '—'}
                              </span>
                            ) : (
                              <>
                                <span className="font-medium text-foreground">{formatCurrency(r.total_amount || 0)}</span>
                                {r.deposit_amount > 0 && r.deposit_amount < r.total_amount && (
                                  <p className="text-[10px] text-muted-foreground">Dep: {formatCurrency(r.deposit_amount)}</p>
                                )}
                              </>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', statusCls)}>
                              {r.booking_status.replace(/_/g, ' ')}
                            </span>
                            {holdExpiringSoon && <p className="text-[10px] text-[#FCD34D] mt-0.5">Expiring soon!</p>}
                            {r.source === 'public_request' && <p className="text-[10px] text-[var(--brand-primary)] mt-0.5">Request</p>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isPending && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => approveRequest(r.id)} disabled={actionLoading === r.id}
                                    className="border-primary/30 bg-primary/5 text-[var(--brand-primary)] hover:bg-primary/10 px-2 py-1 text-xs">
                                    {actionLoading === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Approve
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => declineRequest(r.id)} disabled={actionLoading === r.id}
                                    className="border-destructive/30 bg-destructive/5 text-[#FB7185] hover:bg-destructive/10 px-2 py-1 text-xs">
                                    {actionLoading === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />} Decline
                                  </Button>
                                </>
                              )}
                              {isAwaitingPayment && (
                                <span className="text-[10px] text-[#FCD34D] mr-1">
                                  {r.payment_status === 'processing' ? 'Payment processing' : 'Awaiting payment'}
                                </span>
                              )}
                              {(r.booking_status === 'confirmed' || r.booking_status === 'completed') && r.payment_status && r.payment_status !== 'unpaid' && (
                                <span className="text-[10px] text-[#86EFAC]">{r.payment_status.replace(/_/g, ' ')}</span>
                              )}
                              {deleteConfirm === r.id ? (
                                <div className="flex items-center gap-1">
                                  <Button size="sm" variant="outline" onClick={() => deleteReservation(r.id)} disabled={actionLoading === r.id}
                                    className="border-destructive/30 bg-destructive/10 text-[#FB7185] hover:bg-destructive/20 px-2 py-1 text-xs">
                                    {actionLoading === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}
                                    className="border-border px-2 py-1 text-xs">
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(r.id)}
                                  className="text-muted-foreground hover:text-[#FB7185] px-1.5 py-1">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="border-border bg-[var(--card-bg)]"><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="border-border bg-[var(--card-bg)]"><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        )}

        {view === 'calendar' && <ReservationCalendar reservations={reservations} />}

        {view === 'departures' && <DeparturesView tenantId={tenant?.id} />}
      </main>
    </div>
  );
}

type DepartureSlot = {
  listing_id: string;
  listing_name: string;
  capacity: number;
  start_at: string;
  end_at: string;
  total_guests: number;
  booking_count: number;
  reservations: {
    id: string;
    booking_reference: string;
    client_name: string;
    client_email: string;
    client_phone: string;
    guest_count: number;
    booking_status: string;
    payment_status: string;
    total_amount: number;
    currency: string;
  }[];
};

function DeparturesView({ tenantId }: { tenantId?: string }) {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [departures, setDepartures] = useState<DepartureSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    (async () => {
      const dayStart = `${date}T00:00:00Z`;
      const dayEnd = `${date}T23:59:59Z`;

      const { data: sharedListings } = await supabase
        .from('listings')
        .select('id, name, capacity, booking_mode')
        .eq('tenant_id', tenantId)
        .eq('booking_mode', 'shared')
        .eq('is_active', true);

      if (!sharedListings || sharedListings.length === 0) {
        setDepartures([]);
        setLoading(false);
        return;
      }

      const listingIds = sharedListings.map(l => l.id);

      const { data: reservations } = await supabase
        .from('reservations')
        .select('id, listing_id, booking_reference, client_name, client_email, client_phone, guest_count, booking_status, payment_status, total_amount, currency, start_at, end_at')
        .eq('tenant_id', tenantId)
        .in('listing_id', listingIds)
        .gte('start_at', dayStart)
        .lte('start_at', dayEnd)
        .not('booking_status', 'in', '("cancelled","expired","no_show")')
        .order('start_at');

      const slotMap = new Map<string, DepartureSlot>();

      for (const r of reservations || []) {
        const key = `${r.listing_id}|${r.start_at}|${r.end_at}`;
        const listing = sharedListings.find(l => l.id === r.listing_id);
        if (!slotMap.has(key)) {
          slotMap.set(key, {
            listing_id: r.listing_id,
            listing_name: listing?.name || 'Unknown',
            capacity: listing?.capacity || 0,
            start_at: r.start_at,
            end_at: r.end_at,
            total_guests: 0,
            booking_count: 0,
            reservations: [],
          });
        }
        const slot = slotMap.get(key)!;
        slot.total_guests += r.guest_count || 1;
        slot.booking_count += 1;
        slot.reservations.push({
          id: r.id,
          booking_reference: r.booking_reference,
          client_name: r.client_name,
          client_email: r.client_email,
          client_phone: r.client_phone,
          guest_count: r.guest_count || 1,
          booking_status: r.booking_status,
          payment_status: r.payment_status,
          total_amount: r.total_amount,
          currency: r.currency,
        });
      }

      setDepartures(Array.from(slotMap.values()).sort((a, b) => a.start_at.localeCompare(b.start_at)));
      setLoading(false);
    })();
  }, [tenantId, date]);

  const changeDate = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().split('T')[0]);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => changeDate(-1)} className="border-border bg-[var(--card-bg)]"><ChevronLeft className="h-4 w-4" /></Button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-lg border border-border bg-[var(--card-bg)] px-3 py-1.5 text-sm text-foreground" />
        <Button variant="outline" size="sm" onClick={() => changeDate(1)} className="border-border bg-[var(--card-bg)]"><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={() => setDate(new Date().toISOString().split('T')[0])} className="border-border bg-[var(--card-bg)] text-xs">Today</Button>
      </div>

      {departures.length === 0 ? (
        <div className="rounded-xl border border-border bg-[var(--card-bg)] p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No shared departures scheduled for this date.</p>
          <p className="text-xs text-muted-foreground mt-1">Only listings with Shared Experience booking mode appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {departures.map((slot) => {
            const key = `${slot.listing_id}|${slot.start_at}`;
            const isExpanded = expandedSlot === key;
            const occupancy = slot.capacity > 0 ? Math.round((slot.total_guests / slot.capacity) * 100) : 0;
            const startTime = new Date(slot.start_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const endTime = new Date(slot.end_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

            return (
              <div key={key} className="rounded-xl border border-border bg-[var(--card-bg)] overflow-hidden">
                <button
                  onClick={() => setExpandedSlot(isExpanded ? null : key)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/20 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-sm font-bold text-foreground">{startTime}</div>
                      <div className="text-[10px] text-muted-foreground">{endTime}</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{slot.listing_name}</div>
                      <div className="text-xs text-muted-foreground">{slot.booking_count} booking{slot.booking_count !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-sm font-bold text-foreground">{slot.total_guests}/{slot.capacity}</div>
                      <div className="text-[10px] text-muted-foreground">guests</div>
                    </div>
                    <div className="w-16 h-2 rounded-full bg-secondary/30 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', occupancy >= 90 ? 'bg-red-500' : occupancy >= 60 ? 'bg-amber-500' : 'bg-[var(--brand-primary)]')}
                        style={{ width: `${Math.min(occupancy, 100)}%` }}
                      />
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground">
                          <th className="px-4 py-2 text-left font-medium">Guest</th>
                          <th className="px-4 py-2 text-left font-medium">Contact</th>
                          <th className="px-4 py-2 text-center font-medium">Pax</th>
                          <th className="px-4 py-2 text-center font-medium">Status</th>
                          <th className="px-4 py-2 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slot.reservations.map((r) => (
                          <tr key={r.id} className="border-b border-border/50 last:border-0">
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-foreground">{r.client_name}</div>
                              <div className="text-[10px] text-muted-foreground">{r.booking_reference}</div>
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                                {r.client_email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{r.client_email}</span>}
                                {r.client_phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{r.client_phone}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center font-semibold text-foreground">{r.guest_count}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium border', STATUS_COLORS[r.booking_status as BookingStatus] || 'bg-secondary text-muted-foreground')}>
                                {r.booking_status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-medium text-foreground">
                              {formatCurrency(r.total_amount, r.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-secondary/20">
                          <td className="px-4 py-2 font-semibold text-foreground" colSpan={2}>Total</td>
                          <td className="px-4 py-2 text-center font-bold text-foreground">{slot.total_guests}</td>
                          <td className="px-4 py-2 text-center text-xs text-muted-foreground">{slot.capacity - slot.total_guests} seats left</td>
                          <td className="px-4 py-2 text-right font-bold text-foreground">
                            {formatCurrency(slot.reservations.reduce((s, r) => s + (r.total_amount || 0), 0), slot.reservations[0]?.currency || 'USD')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
