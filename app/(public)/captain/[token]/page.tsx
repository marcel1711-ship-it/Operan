'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, Anchor, Ship, Users, MapPin, Clock, Calendar, Hash,
  CheckCircle2, AlertCircle, XCircle, RefreshCw, Copy, ExternalLink,
  Shield, Play, Square, Ban, ChevronDown, ChevronUp, User,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { generateQR } from '@/lib/qr-code';

type SessionData = {
  session: {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    checklist: ChecklistItem[];
    captain_name: string | null;
    started_at: string | null;
    ended_at: string | null;
    expires_at: string;
  };
  reservation: {
    id: string;
    booking_reference: string;
    client_name: string;
    client_email: string;
    client_phone: string;
    guest_count: number;
    start_at: string;
    end_at: string;
    charter_date: string;
    booking_status: string;
    payment_status: string;
    balance_due: number;
    total_amount: number;
    notes: string;
  };
  listing: {
    id: string;
    name: string;
    boat_type: string;
    capacity: number;
    location: string;
    photos: string[];
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
  };
  waivers: { id: string; signer_name: string; signer_email: string; signed_at: string }[];
  waiver_url: string | null;
};

type ChecklistItem = {
  key: string;
  label: string;
  description: string;
  checked: boolean;
};

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { key: 'passenger_count_verified', label: 'Passenger count verified', description: 'People present match the expected guest count.', checked: false },
  { key: 'all_waivers_verified', label: 'All waivers verified', description: 'Every person boarding appears in the signed waivers list.', checked: false },
  { key: 'ids_checked', label: 'IDs checked', description: 'Required identification has been reviewed.', checked: false },
  { key: 'safety_briefing_completed', label: 'Safety briefing completed', description: 'Passengers received the required safety instructions.', checked: false },
  { key: 'balance_confirmed', label: 'Balance confirmed', description: 'The remaining balance has been confirmed or settled.', checked: false },
];

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CaptainOperationsPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showWaivers, setShowWaivers] = useState(true);

  const loadSession = useCallback(async () => {
    const { data: result, error: err } = await supabase.rpc('get_captain_session', { p_token: token });
    if (err || result?.error) {
      setError(result?.error || err?.message || 'Failed to load session');
      setLoading(false);
      return;
    }
    setData(result as SessionData);
    const saved = (result as SessionData).session.checklist;
    setChecklist(Array.isArray(saved) && saved.length > 0 ? saved : DEFAULT_CHECKLIST);
    setLoading(false);
  }, [token]);

  useEffect(() => { loadSession(); }, [loadSession]);

  useEffect(() => {
    if (data?.tenant?.name) {
      document.title = `Captain Operations — ${data.tenant.name}`;
    }
  }, [data?.tenant?.name]);

  const allChecked = useMemo(() => checklist.every(c => c.checked), [checklist]);
  const sessionStatus = data?.session.status || 'pending';
  const isLocked = sessionStatus === 'completed' || sessionStatus === 'cancelled';

  function toggleCheck(key: string) {
    if (isLocked || sessionStatus === 'in_progress') return;
    setChecklist(prev => prev.map(c => c.key === key ? { ...c, checked: !c.checked } : c));
  }

  async function performAction(action: string) {
    if (actionLoading) return;

    if (action === 'END_CHARTER' && !confirm('Confirm that this charter has ended?')) return;
    if (action === 'CANCEL_CHARTER' && !confirm('Cancel this charter? This action cannot be undone.')) return;

    setActionLoading(action);
    setMessage(null);

    const { data: result, error: err } = await supabase.rpc('captain_charter_action', {
      p_token: token,
      p_action: action,
      p_checklist: checklist,
    });

    if (err || !result?.success) {
      setMessage({ type: 'error', text: result?.error || err?.message || 'Action failed' });
      setActionLoading(null);
      return;
    }

    const labels: Record<string, string> = {
      START_CHARTER: 'Charter started successfully.',
      END_CHARTER: 'Charter completed successfully.',
      CANCEL_CHARTER: 'Charter cancelled.',
    };
    setMessage({ type: 'success', text: labels[action] || 'Done.' });
    setActionLoading(null);
    await loadSession();
  }

  const waiverPageUrl = useMemo(() => {
    if (!data?.waiver_url || typeof window === 'undefined') return null;
    const base = window.location.origin;
    const url = new URL(data.waiver_url, base);
    url.searchParams.set('reservation_id', data.reservation.id);
    return url.toString();
  }, [data]);

  async function copyWaiverLink() {
    if (!waiverPageUrl) return;
    await navigator.clipboard.writeText(waiverPageUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  const primary = data?.tenant?.primary_color || '#0d9488';

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: primary }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4">
        <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm" style={{ maxWidth: 420 }}>
          <XCircle className="mx-auto h-12 w-12 text-red-400" />
          <h1 className="mt-4 text-lg font-bold text-slate-900">Session Unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{error || 'This captain session link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  const { session, reservation, listing, tenant, waivers } = data;

  const statusConfig: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'Review Pending', bg: '#FFF7E8', color: '#B76E00', icon: <AlertCircle className="h-3.5 w-3.5" /> },
    in_progress: { label: 'Charter Active', bg: '#EAF8F2', color: '#178F69', icon: <Play className="h-3.5 w-3.5" /> },
    completed: { label: 'Completed', bg: '#EAF8F2', color: '#178F69', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    cancelled: { label: 'Cancelled', bg: '#FEF3F2', color: '#B42318', icon: <XCircle className="h-3.5 w-3.5" /> },
  };

  const sc = statusConfig[sessionStatus] || statusConfig.pending;

  const statusBannerText: Record<string, { title: string; desc: string }> = {
    pending: { title: 'Captain review required', desc: 'Review signed waivers and complete every boarding check before starting.' },
    in_progress: { title: 'Charter in progress', desc: 'The charter is currently active. End when the trip is complete.' },
    completed: { title: 'Charter completed', desc: 'This charter has been completed successfully.' },
    cancelled: { title: 'Charter cancelled', desc: 'This charter has been cancelled.' },
  };

  const banner = statusBannerText[sessionStatus] || statusBannerText.pending;

  const readyToStart = allChecked && sessionStatus === 'pending';

  return (
    <div className="min-h-screen bg-slate-50" style={{ '--captain-primary': primary, '--captain-primary-pale': `${primary}18` } as React.CSSProperties}>
      {/* Header */}
      <header className="text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${primary}dd)` }}>
        <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt={tenant.name} className="h-10 w-10 rounded-xl object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                  <Anchor className="h-5 w-5 text-white" />
                </div>
              )}
              <div>
                <div className="text-lg font-extrabold tracking-tight">{tenant.name}</div>
                <div className="text-xs uppercase tracking-widest opacity-80">Captain Operations</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-extrabold uppercase tracking-tight sm:text-2xl">Captain Operations</div>
              <div className="mt-1 text-xs opacity-80">Pre-departure review and charter controls</div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Status Banner */}
        <div className="mb-5 flex flex-col items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-extrabold text-slate-900">{banner.title}</p>
            <p className="mt-1 text-xs text-slate-500">{banner.desc}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs font-extrabold uppercase tracking-wide" style={{ background: sc.bg, color: sc.color }}>
            {sc.icon} {sc.label}
          </span>
        </div>

        {/* Summary Cards */}
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard icon={<Ship className="h-4 w-4" style={{ color: primary }} />} label="Vessel" value={listing.name} />
          <SummaryCard icon={<Calendar className="h-4 w-4" style={{ color: primary }} />} label="Date" value={formatDate(reservation.charter_date || reservation.start_at)} />
          <SummaryCard icon={<Clock className="h-4 w-4" style={{ color: primary }} />} label="Departure" value={formatTime(reservation.start_at)} />
          <SummaryCard icon={<Clock className="h-4 w-4" style={{ color: primary }} />} label="Return" value={formatTime(reservation.end_at)} />
          <SummaryCard icon={<User className="h-4 w-4" style={{ color: primary }} />} label="Primary Guest" value={reservation.client_name || '—'} />
          <SummaryCard icon={<Hash className="h-4 w-4" style={{ color: primary }} />} label="Reservation" value={reservation.booking_reference || '—'} />
        </div>

        {/* Main Layout */}
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Left Column */}
          <div className="space-y-5">
            {/* Signed Waivers Panel */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">Signed Guest Waivers</h2>
                  <p className="mt-1 text-xs text-slate-500">Guests who submitted the digital waiver for this reservation.</p>
                </div>
                <span className="inline-flex items-center rounded-full px-3 py-1.5 text-xs font-extrabold" style={{ background: `${primary}18`, color: primary }}>
                  {waivers.length}
                </span>
              </div>

              <button onClick={() => setShowWaivers(!showWaivers)} className="mt-3 flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 hover:bg-slate-100">
                <span>{showWaivers ? 'Hide waivers' : 'Show waivers'}</span>
                {showWaivers ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {showWaivers && (
                <div className="mt-3 space-y-2">
                  {waivers.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400">
                      No signed waivers found for this reservation.
                    </div>
                  ) : (
                    waivers.map(w => (
                      <div key={w.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 font-bold text-xs">
                            <CheckCircle2 className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{w.signer_name}</p>
                            <p className="text-[11px] text-slate-400">
                              {w.signer_email}{w.signed_at ? ` · ${formatDateTime(w.signed_at)}` : ''}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-600">Signed</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={loadSession} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50">
                  <RefreshCw className="h-3 w-3" /> Refresh waivers
                </button>
              </div>

              {reservation.guest_count > 0 && waivers.length < reservation.guest_count && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {reservation.guest_count - waivers.length} of {reservation.guest_count} guests still missing waivers.
                </div>
              )}
            </div>

            {/* QR Code / Waiver Access */}
            {data.waiver_url && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-extrabold text-slate-900">Guest Waiver Access</h2>
                <p className="mt-1 text-xs text-slate-500">Use the QR code at the marina or copy the link to send it directly.</p>

                <div className="mt-4 grid items-center gap-4 sm:grid-cols-[160px_1fr]">
                  <div className="flex justify-center">
                    <QRCodeCanvas value={waiverPageUrl || ''} size={140} primary={primary} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Guest registration and waiver</h3>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">Each passenger enters their own details before signing the waiver.</p>
                    {waiverPageUrl && (
                      <div className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-600 break-all font-mono">
                        {waiverPageUrl}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={copyWaiverLink} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50">
                        <Copy className="h-3 w-3" /> {linkCopied ? 'Copied!' : 'Copy link'}
                      </button>
                      {waiverPageUrl && (
                        <a href={waiverPageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: `${primary}cc` }}>
                          <ExternalLink className="h-3 w-3" /> Open waiver page
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            {/* Boarding Checklist */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-extrabold text-slate-900">Boarding Checklist</h2>
              <p className="mt-1 text-xs text-slate-500">Every item must be confirmed before starting the charter.</p>

              <div className="mt-4 space-y-2.5">
                {checklist.map(item => (
                  <label
                    key={item.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                      item.checked
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/60'
                    } ${isLocked || sessionStatus === 'in_progress' ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleCheck(item.key)}
                      disabled={isLocked || sessionStatus === 'in_progress'}
                      className="mt-0.5 h-[18px] w-[18px] rounded accent-emerald-500"
                      style={{ accentColor: primary }}
                    />
                    <span>
                      <strong className="text-sm text-slate-900">{item.label}</strong>
                      <span className="mt-0.5 block text-[11px] text-slate-400">{item.description}</span>
                    </span>
                  </label>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="mt-5 space-y-2.5">
                {sessionStatus === 'pending' && (
                  <button
                    onClick={() => performAction('START_CHARTER')}
                    disabled={!readyToStart || actionLoading === 'START_CHARTER'}
                    className="flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: readyToStart ? primary : '#94a3b8' }}
                  >
                    {actionLoading === 'START_CHARTER' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Start Charter
                  </button>
                )}

                {sessionStatus === 'in_progress' && (
                  <button
                    onClick={() => performAction('END_CHARTER')}
                    disabled={actionLoading === 'END_CHARTER'}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-slate-800 px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition-opacity disabled:opacity-50"
                  >
                    {actionLoading === 'END_CHARTER' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                    End Charter
                  </button>
                )}

                {(sessionStatus === 'pending' || sessionStatus === 'in_progress') && (
                  <button
                    onClick={() => performAction('CANCEL_CHARTER')}
                    disabled={actionLoading === 'CANCEL_CHARTER'}
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-red-600 transition-opacity disabled:opacity-50"
                  >
                    {actionLoading === 'CANCEL_CHARTER' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                    Cancel Charter
                  </button>
                )}
              </div>

              {/* Action Message */}
              {message && (
                <div className={`mt-3 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium ${
                  message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}>
                  {message.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                  {message.text}
                </div>
              )}

              {/* Timestamps */}
              {(session.started_at || session.ended_at) && (
                <div className="mt-4 space-y-1 border-t border-slate-100 pt-3">
                  {session.started_at && (
                    <p className="text-[11px] text-slate-400">Started: {formatDateTime(session.started_at)}</p>
                  )}
                  {session.ended_at && (
                    <p className="text-[11px] text-slate-400">Ended: {formatDateTime(session.ended_at)}</p>
                  )}
                </div>
              )}
            </div>

            {/* Payment Info */}
            {reservation.balance_due > 0 && sessionStatus === 'pending' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-bold text-amber-800">Balance Due</p>
                </div>
                <p className="mt-1 text-xs text-amber-700">
                  ${reservation.balance_due.toLocaleString()} of ${reservation.total_amount.toLocaleString()} remains unpaid.
                  Confirm payment before starting the charter.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-8 border-t border-slate-200 bg-white py-4">
        <div className="mx-auto max-w-[1180px] px-4 text-center text-xs text-slate-400 sm:px-6">
          Powered by OPERAN · Captain Operations Dashboard
        </div>
      </footer>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      {icon}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-900 leading-tight">{value}</p>
      </div>
    </div>
  );
}

function QRCodeCanvas({ value, size, primary }: { value: string; size: number; primary: string }) {
  const [ref, setRef] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!ref || !value) return;

    const matrix = generateQR(value);
    const ctx = ref.getContext('2d');
    if (!ctx) return;

    const moduleCount = matrix.length;
    const quietZone = 4;
    const totalModules = moduleCount + quietZone * 2;
    const cellSize = size / totalModules;

    ref.width = size;
    ref.height = size;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = primary;
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (matrix[row][col]) {
          const x = (quietZone + col) * cellSize;
          const y = (quietZone + row) * cellSize;
          ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cellSize), Math.ceil(cellSize));
        }
      }
    }
  }, [ref, value, size, primary]);

  return (
    <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-2.5">
      <canvas ref={setRef} width={size} height={size} className="rounded-lg" />
    </div>
  );
}
