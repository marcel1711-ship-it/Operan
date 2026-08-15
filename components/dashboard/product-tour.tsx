'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, HelpCircle } from 'lucide-react';

const TOUR_STEPS = [
  {
    target: 'admin',
    title: 'Dashboard',
    description: 'Your business at a glance — revenue, upcoming charters, reservation calendar, and real-time activity. Everything you need to start your day.',
  },
  {
    target: 'reservations',
    title: 'Reservations',
    description: 'All your bookings in one place. View, filter, and manage every reservation. See payment status, guest details, and trip information.',
  },
  {
    target: 'listings-manage',
    title: 'Listings',
    description: 'Your boats and experiences. Set up pricing, availability, photos, and booking rules. Each listing gets its own public booking page.',
  },
  {
    target: 'customers',
    title: 'Customers',
    description: 'Your customer database, built automatically. Every person who books gets a profile with their history, contact info, and preferences.',
  },
  {
    target: 'pipelines',
    title: 'Pipelines',
    description: 'Track every opportunity from first contact to completed trip. Drag and drop between stages to manage your sales flow.',
  },
  {
    target: 'automations',
    title: 'Automations',
    description: 'Workflows that run themselves. Confirmation emails, waivers, captain assignments, follow-ups — all triggered automatically when a booking comes in.',
  },
  {
    target: 'communications',
    title: 'Email Templates',
    description: 'Create and manage your email templates. Customize confirmation emails, reminders, and follow-ups with dynamic variables like customer name and trip details.',
  },
  {
    target: 'forms',
    title: 'Documents',
    description: 'Upload waivers, contracts, and other documents your customers need to sign. Attach them to your booking flow automatically.',
  },
  {
    target: 'waivers',
    title: 'Signed Documents',
    description: 'Track every waiver and document signed by your guests. See who signed, when, and for which reservation.',
  },
  {
    target: 'integrations',
    title: 'Integrations',
    description: 'Connect Stripe for payments, Resend for emails, and more. One-click setup to get your business fully operational.',
  },
  {
    target: 'settings',
    title: 'Settings',
    description: 'Configure your company profile, branding, notifications, and billing. Customize OPERAN to match your business identity.',
  },
];

const STORAGE_KEY = 'operan_tour_completed';

export function ProductTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [showButton, setShowButton] = useState(true);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (!completed) {
      const timer = setTimeout(() => setActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const highlightTarget = useCallback((stepIndex: number) => {
    const tourStep = TOUR_STEPS[stepIndex];
    const el = document.querySelector(`[data-tour="${tourStep.target}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, []);

  useEffect(() => {
    if (active) {
      highlightTarget(step);
    }
  }, [active, step, highlightTarget]);

  useEffect(() => {
    if (!active) return;
    const handleResize = () => highlightTarget(step);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [active, step, highlightTarget]);

  const close = () => {
    setActive(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  const next = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      close();
    }
  };

  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  const startTour = () => {
    setStep(0);
    setActive(true);
  };

  if (!active) {
    return showButton ? (
      <button
        onClick={startTour}
        className="fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-full border border-white/10 bg-[var(--sidebar-bg,#111827)] px-4 py-2.5 text-sm font-medium text-white/70 shadow-xl transition-all hover:bg-white/10 hover:text-white lg:bottom-6 lg:right-6"
        title="Take a Tour"
      >
        <HelpCircle className="h-4 w-4" />
        <span className="hidden sm:inline">Take a Tour</span>
      </button>
    ) : null;
  }

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  const tooltipTop = targetRect
    ? targetRect.top + targetRect.height / 2 - 60
    : 200;
  const tooltipLeft = targetRect
    ? targetRect.right + 16
    : 300;

  const maxTop = typeof window !== 'undefined' ? window.innerHeight - 220 : 600;
  const clampedTop = Math.max(16, Math.min(tooltipTop, maxTop));

  return (
    <>
      <div className="fixed inset-0 z-[998] bg-black/50 transition-opacity duration-300" onClick={close} />

      {targetRect && (
        <div
          className="fixed z-[999] rounded-2xl transition-all duration-300"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: '0 0 0 4000px rgba(0,0,0,0.5), 0 0 20px 4px rgba(99,119,255,0.4)',
            pointerEvents: 'none',
          }}
        />
      )}

      <div
        className="fixed z-[1000] w-80 rounded-2xl border border-white/10 bg-[#1a2236] p-5 shadow-2xl transition-all duration-300"
        style={{
          top: clampedTop,
          left: Math.min(tooltipLeft, typeof window !== 'undefined' ? window.innerWidth - 340 : 500),
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#6377FF]/20 text-xs font-bold text-[#6377FF]">
              {step + 1}
            </span>
            <h3 className="text-sm font-bold text-white">{current.title}</h3>
          </div>
          <button onClick={close} className="rounded-lg p-1 text-white/40 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-[13px] leading-relaxed text-white/60">
          {current.description}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[11px] text-white/30">
            {step + 1} of {TOUR_STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={prev}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
            <button
              onClick={next}
              className="flex items-center gap-1 rounded-lg bg-[#6377FF] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#5063E8]"
            >
              {isLast ? 'Finish' : 'Next'}
              {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="mt-3 flex justify-center gap-1">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === step ? 'w-4 bg-[#6377FF]' : i < step ? 'w-1.5 bg-[#6377FF]/40' : 'w-1.5 bg-white/10'
              }`}
            />
          ))}
        </div>
      </div>
    </>
  );
}
