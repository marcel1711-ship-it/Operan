'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { OperanLogoIcon } from '@/components/landing/operan-logo';

// ── Configuration ──
// Set this env var or replace the fallback with your actual scheduling URL.
const SCHEDULING_URL = process.env.NEXT_PUBLIC_DEMO_SCHEDULING_URL || '';

const FLEET_OPTIONS = ['1', '2–5', '6–10', '11–30', '30+'] as const;
const BOOKING_OPTIONS = ['WhatsApp', 'Calendar', 'Booking software', 'Spreadsheet', 'Multiple tools', 'Other'] as const;

type FormData = {
  firstName: string;
  companyName: string;
  email: string;
  phone: string;
  fleetSize: string;
  bookingManagement: string;
  biggestChallenge: string;
};

type FormErrors = Partial<Record<keyof FormData, string>>;

export default function DemoPage() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  const [form, setForm] = useState<FormData>({
    firstName: '',
    companyName: '',
    email: '',
    phone: '',
    fleetSize: '',
    bookingManagement: '',
    biggestChallenge: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [serverError, setServerError] = useState('');

  // UTM / attribution params
  const [attribution, setAttribution] = useState({
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
    utmContent: '',
    utmTerm: '',
    source: '',
  });

  useEffect(() => {
    setMounted(true);
    setAttribution({
      utmSource: searchParams.get('utm_source') || '',
      utmMedium: searchParams.get('utm_medium') || '',
      utmCampaign: searchParams.get('utm_campaign') || '',
      utmContent: searchParams.get('utm_content') || '',
      utmTerm: searchParams.get('utm_term') || '',
      source: searchParams.get('source') || '',
    });
  }, [searchParams]);

  const isFoundingOperator = attribution.source === 'founding-operator';

  const validate = useCallback((): FormErrors => {
    const e: FormErrors = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (!form.companyName.trim()) e.companyName = 'Company name is required';
    if (!form.email.trim()) {
      e.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Enter a valid email address';
    }
    if (!form.fleetSize) e.fleetSize = 'Select your fleet size';
    if (!form.bookingManagement) e.bookingManagement = 'Select how you manage bookings';
    return e;
  }, [form]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setStatus('submitting');
    setServerError('');

    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          ...attribution,
          pageUrl: window.location.href,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong');
      }

      setStatus('success');
    } catch (err) {
      setStatus('error');
      setServerError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const setField = (field: keyof FormData, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  return (
    <main className="min-h-screen bg-[#0F172A]">
      {/* Backgrounds */}
      <div className="fixed inset-0 operan-grid-bg opacity-30 pointer-events-none" />
      <div className="fixed inset-0 operan-radial-fade pointer-events-none" />

      {/* Minimal header */}
      <header className="relative z-10 border-b border-white/[0.06] bg-[#0F172A]/80 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <OperanLogoIcon size={32} />
            <span className="text-lg font-bold tracking-tight text-white">OPERAN</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-[#94A3B8] transition-colors hover:text-white"
          >
            Back to OPERAN
          </Link>
        </nav>
      </header>

      {/* Page content */}
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-20">
        <div className={`grid items-start gap-12 lg:grid-cols-2 lg:gap-20 ${mounted ? 'animate-operan-fade-up' : 'opacity-0'}`}>

          {/* ── LEFT: Positioning ── */}
          <div className="flex flex-col lg:sticky lg:top-28">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
              <span className="flex h-2 w-2 rounded-full bg-[#6377FF] animate-operan-pulse-glow" />
              <span className="text-xs font-medium uppercase tracking-wide text-[#94A3B8]">
                {isFoundingOperator ? 'Founding Operator Walkthrough' : 'Personalized OPERAN Walkthrough'}
              </span>
            </div>

            <h1 className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl">
              See OPERAN with
              <br />
              <span className="operan-accent-gradient">your operation.</span>
            </h1>

            <p className="mt-6 max-w-md text-lg leading-relaxed text-[#94A3B8]">
              Tell us a little about your charter business and we&apos;ll show you how OPERAN
              can fit the way you already manage bookings, availability and day-to-day operations.
            </p>

            {/* Checklist */}
            <div className="mt-8 space-y-3">
              {[
                'Your fleet and availability',
                'Your current booking process',
                'Your customer communication',
                'Your operational workflows',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6377FF]/15">
                    <svg className="h-3 w-3 text-[#7C8CFF]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-sm text-[#CBD5E1]">{item}</span>
                </div>
              ))}
            </div>

            {/* Trust line */}
            <div className="mt-10 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-4">
              <p className="text-sm leading-relaxed text-[#94A3B8]">
                No generic sales presentation.
                <br />
                We&apos;ll focus the walkthrough on how your business actually operates.
              </p>
            </div>
          </div>

          {/* ── RIGHT: Form card ── */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-[#6377FF]/8 to-transparent blur-2xl pointer-events-none" />

            <div className="relative rounded-2xl border border-white/[0.08] bg-[#111827] p-6 shadow-2xl sm:p-8">
              {status === 'success' ? (
                <SuccessState firstName={form.firstName} />
              ) : (
                <>
                  <div className="mb-6">
                    <h2 className="text-xl font-bold text-white">Tell us about your operation</h2>
                    <p className="mt-1.5 text-sm text-[#94A3B8]">
                      A few details help us make the walkthrough relevant to your business.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} noValidate className="space-y-5">
                    {/* First name */}
                    <Field label="First name" required error={errors.firstName}>
                      <input
                        type="text"
                        value={form.firstName}
                        onChange={(e) => setField('firstName', e.target.value)}
                        className={inputClass(errors.firstName)}
                        autoComplete="given-name"
                      />
                    </Field>

                    {/* Company name */}
                    <Field label="Company name" required error={errors.companyName}>
                      <input
                        type="text"
                        value={form.companyName}
                        onChange={(e) => setField('companyName', e.target.value)}
                        className={inputClass(errors.companyName)}
                        autoComplete="organization"
                      />
                    </Field>

                    {/* Email */}
                    <Field label="Business email" required error={errors.email}>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setField('email', e.target.value)}
                        className={inputClass(errors.email)}
                        autoComplete="email"
                      />
                    </Field>

                    {/* Phone */}
                    <Field label="Phone / WhatsApp">
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setField('phone', e.target.value)}
                        className={inputClass()}
                        autoComplete="tel"
                      />
                    </Field>

                    {/* Fleet size — pills */}
                    <Field label="How many boats do you manage?" required error={errors.fleetSize}>
                      <div className="flex flex-wrap gap-2">
                        {FLEET_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setField('fleetSize', opt)}
                            className={pillClass(form.fleetSize === opt)}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </Field>

                    {/* Booking management — pills */}
                    <Field label="How do you currently manage bookings?" required error={errors.bookingManagement}>
                      <div className="flex flex-wrap gap-2">
                        {BOOKING_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setField('bookingManagement', opt)}
                            className={pillClass(form.bookingManagement === opt)}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </Field>

                    {/* Biggest challenge */}
                    <Field label="What's the biggest challenge in your operation?">
                      <textarea
                        value={form.biggestChallenge}
                        onChange={(e) => setField('biggestChallenge', e.target.value)}
                        rows={3}
                        placeholder="Availability, follow-ups, payments, coordinating captains..."
                        className={inputClass()}
                      />
                    </Field>

                    {/* Server error */}
                    {status === 'error' && serverError && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                        {serverError}
                      </div>
                    )}

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={status === 'submitting'}
                      className="group relative w-full rounded-xl bg-[#6377FF] px-6 py-3.5 text-sm font-medium text-white transition-all hover:bg-[#5063E8] disabled:opacity-60 disabled:cursor-not-allowed operan-glow-sm"
                    >
                      {status === 'submitting' ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                          Sending…
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-2">
                          Request My OPERAN Walkthrough
                          <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      )}
                    </button>

                    <p className="text-center text-xs text-[#94A3B8]/70">
                      No commitment. We&apos;ll tailor the walkthrough to your operation.
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ── Success state ──

function SuccessState({ firstName }: { firstName: string }) {
  return (
    <div className="flex flex-col items-center py-6 text-center" style={{ animation: 'operan-fade-up 0.5s ease-out both' }}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#22C55E]/15">
        <svg className="h-7 w-7 text-[#22C55E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M4 12l5 5 11-11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h2 className="mt-5 text-2xl font-bold text-white">
        Thanks, {firstName}.
      </h2>
      <p className="mt-1 text-sm font-medium text-[#94A3B8]">
        We received your request.
      </p>

      <p className="mt-5 max-w-sm text-sm leading-relaxed text-[#94A3B8]">
        The next step is to choose a time for your personalized OPERAN walkthrough.
      </p>

      <div className="mt-8 flex w-full flex-col gap-3">
        {SCHEDULING_URL ? (
          <a
            href={SCHEDULING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-[#6377FF] px-6 py-3.5 text-sm font-medium text-white transition-all hover:bg-[#5063E8] operan-glow-sm"
          >
            Schedule My Walkthrough
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        ) : (
          <div className="rounded-xl border border-[#6377FF]/20 bg-[#6377FF]/10 px-5 py-3.5 text-sm text-[#7C8CFF]">
            We&apos;ll reach out shortly to schedule your walkthrough.
          </div>
        )}

        <Link
          href="/"
          className="flex w-full items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-3.5 text-sm font-medium text-white transition-all hover:border-white/[0.15] hover:bg-white/[0.04]"
        >
          Back to OPERAN
        </Link>
      </div>
    </div>
  );
}

// ── Shared UI helpers ──

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-[#CBD5E1]">
        {label}
        {required && <span className="ml-0.5 text-[#6377FF]">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function inputClass(error?: string) {
  return [
    'w-full rounded-xl border bg-[#0F172A] px-4 py-3 text-sm text-white placeholder-[#64748B]',
    'transition-all outline-none',
    'focus:border-[#6377FF] focus:ring-1 focus:ring-[#6377FF]/30',
    error ? 'border-red-500/40' : 'border-white/[0.08]',
  ].join(' ');
}

function pillClass(active: boolean) {
  return [
    'rounded-lg border px-3.5 py-2 text-sm font-medium transition-all',
    active
      ? 'border-[#6377FF]/40 bg-[#6377FF]/15 text-[#7C8CFF]'
      : 'border-white/[0.08] bg-white/[0.02] text-[#94A3B8] hover:border-white/[0.15] hover:text-white',
  ].join(' ');
}
