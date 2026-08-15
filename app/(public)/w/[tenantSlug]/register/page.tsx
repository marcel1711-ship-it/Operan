'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  Loader2, Ship, Calendar, Clock, Users, AlertCircle,
  ChevronRight, ShieldCheck, FileSignature,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PoweredByOperan } from '@/components/powered-by-operan';

type RegistrationInfo = {
  tenant: {
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
  };
  listing: { name: string } | null;
  reservation: {
    start_at: string;
    end_at: string;
    charter_date: string | null;
    guest_count: number;
    booking_reference: string;
  };
  waiver: { slug: string; title: string } | null;
  error?: string;
};

export default function GuestRegisterPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <GuestRegisterInner />
    </Suspense>
  );
}

function GuestRegisterInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tenantSlug = params.tenantSlug as string;
  const reservationId = searchParams.get('reservation_id');

  const [info, setInfo] = useState<RegistrationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      if (!reservationId) {
        setError('Missing reservation ID. Please use the link from your booking confirmation.');
        setLoading(false);
        return;
      }

      const { data, error: rpcErr } = await supabase.rpc('get_guest_registration_info', {
        p_reservation_id: reservationId,
      });

      if (rpcErr || !data || data.error) {
        setError(data?.error || 'Could not load reservation details. Please check your link.');
        setLoading(false);
        return;
      }

      setInfo(data as RegistrationInfo);
      setLoading(false);
    }
    load();
  }, [reservationId]);

  function formatDate(iso: string | null) {
    if (!iso) return 'See confirmation';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(iso: string | null) {
    if (!iso) return 'See confirmation';
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!firstName.trim()) { setFormError('First name is required.'); return; }
    if (!lastName.trim()) { setFormError('Last name is required.'); return; }
    if (!email.trim()) { setFormError('Email address is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setFormError('Please enter a valid email.'); return; }
    if (!consent) { setFormError('Please confirm that the information is accurate.'); return; }

    if (!info?.waiver?.slug) {
      setFormError('No waiver template is configured for this vessel. Please contact the operator.');
      return;
    }

    setSubmitting(true);

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const waiverParams = new URLSearchParams({
      reservation_id: reservationId!,
      signer_name: fullName,
      email: email.trim().toLowerCase(),
    });
    if (phone.trim()) {
      waiverParams.set('phone', phone.trim());
    }

    router.push(`/w/${tenantSlug}/${info.waiver.slug}?${waiverParams.toString()}`);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4">
        <AlertCircle className="h-12 w-12 text-slate-300" />
        <div className="text-center">
          <h1 className="text-lg font-bold text-foreground">Cannot load registration</h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const primary = info.tenant.primary_color || '#0d9488';
  const primaryDark = info.tenant.secondary_color || primary;

  return (
    <div className="min-h-screen" style={{ background: `linear-gradient(135deg, ${primaryDark}ee, ${primary}aa)` }}>
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-[920px] overflow-hidden rounded-3xl bg-white shadow-2xl sm:grid sm:grid-cols-[0.85fr_1.15fr]">
          {/* Left brand panel */}
          <div
            className="flex flex-col justify-between gap-8 p-8 text-white sm:min-h-[620px] sm:p-10"
            style={{ background: `linear-gradient(160deg, ${primaryDark}f5, ${primary}e0)` }}
          >
            <div>
              {info.tenant.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={info.tenant.logo_url}
                  alt={info.tenant.name}
                  className="mb-2 h-12 w-auto max-w-[180px] rounded-lg object-contain"
                />
              ) : (
                <div className="mb-1 text-3xl font-black tracking-tight">{info.tenant.name}</div>
              )}
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
                {info.tenant.name}
              </div>
              <div className="mt-2 h-0.5 w-14 rounded-full bg-gradient-to-r from-white to-white/40" />
            </div>

            <div>
              <h1 className="mb-4 text-[clamp(28px,4vw,42px)] font-black uppercase leading-none tracking-tight">
                Guest <span className="text-white/70">Waiver</span>
              </h1>
              <p className="max-w-[340px] text-sm leading-relaxed text-white/75">
                Enter your information to complete the required liability waiver.
                Your reservation details are attached automatically.
              </p>
            </div>

            <div className="hidden items-start gap-2.5 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-xs leading-relaxed text-white/80 sm:flex">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-white/60" />
              <span>Your reservation code is captured securely and is not displayed on this page.</span>
            </div>
          </div>

          {/* Right form panel */}
          <div className="p-8 sm:p-10">
            <div className="mb-1 inline-flex rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest"
              style={{ backgroundColor: `${primary}15`, color: primaryDark }}
            >
              Required before boarding
            </div>

            <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[28px]">
              Guest information
            </h2>
            <p className="mt-2 mb-6 text-sm leading-relaxed text-slate-500">
              Complete this short registration. We will immediately prepare your personalized waiver.
            </p>

            {/* Reservation summary */}
            <div className="mb-6 space-y-2.5 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-500">
                  <Ship className="h-3.5 w-3.5" /> Vessel
                </span>
                <strong className="text-right text-slate-800">{info.listing?.name || 'Charter vessel'}</strong>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-500">
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center text-[10px] font-bold">#</span> Reservation
                </span>
                <strong className="text-right font-mono text-xs text-slate-800">{info.reservation.booking_reference}</strong>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-500">
                  <Calendar className="h-3.5 w-3.5" /> Date
                </span>
                <strong className="text-right text-slate-800">{formatDate(info.reservation.charter_date || info.reservation.start_at)}</strong>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-500">
                  <Clock className="h-3.5 w-3.5" /> Departure
                </span>
                <strong className="text-right text-slate-800">{formatTime(info.reservation.start_at)}</strong>
              </div>
              {info.reservation.guest_count > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-500">
                    <Users className="h-3.5 w-3.5" /> Guests
                  </span>
                  <strong className="text-right text-slate-800">{info.reservation.guest_count}</strong>
                </div>
              )}
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700" htmlFor="firstName">
                    First name *
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    autoComplete="given-name"
                    required
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-transparent focus:ring-2"
                    style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700" htmlFor="lastName">
                    Last name *
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    autoComplete="family-name"
                    required
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-transparent focus:ring-2"
                    style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-bold text-slate-700" htmlFor="email">
                  Email address *
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-transparent focus:ring-2"
                  style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                />
              </div>

              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-bold text-slate-700" htmlFor="phone">
                  Phone number
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-transparent focus:ring-2"
                  style={{ '--tw-ring-color': `${primary}40` } as React.CSSProperties}
                />
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-slate-500">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={e => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded accent-current"
                  style={{ color: primary }}
                />
                <span>
                  I confirm that the information above is accurate and belongs to the person who will sign the waiver.
                </span>
              </label>

              {formError && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-lg transition hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: primary, boxShadow: `0 8px 24px ${primary}40` }}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <FileSignature className="h-4 w-4" />
                    Continue to waiver
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <PoweredByOperan className="mt-5" />
          </div>
        </div>
      </div>
    </div>
  );
}
