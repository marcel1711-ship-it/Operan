'use client';

import { useEffect, useState } from 'react';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

const flowSteps = [
  { label: 'Reservation Created', desc: 'Customer books online' },
  { label: 'Payment Collected', desc: 'Deposit processed instantly' },
  { label: 'Customer Created', desc: 'CRM record added automatically' },
  { label: 'Email Delivered', desc: 'Confirmation sent to customer' },
  { label: 'Captain Assigned', desc: 'Crew notified with trip details' },
  { label: 'Calendar Updated', desc: 'Availability synced across all channels' },
  { label: 'Review Requested', desc: 'Post-trip feedback automated' },
];

export default function OperanAutomationFlow() {
  const { ref, isVisible } = useScrollReveal();
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isVisible) return;

    setCompletedSteps(new Set());
    setActiveStep(0);

    const stepInterval = 1200;
    const totalSteps = flowSteps.length;

    const interval = setInterval(() => {
      setActiveStep((prev) => {
        const next = (prev + 1) % totalSteps;
        if (next === 0) {
          setCompletedSteps(new Set());
        } else {
          setCompletedSteps((cs) => new Set(cs).add(prev));
        }
        return next;
      });
    }, stepInterval);

    return () => clearInterval(interval);
  }, [isVisible]);

  return (
    <section ref={ref} id="automations" className="relative overflow-hidden py-16 lg:py-32">
      <div className="absolute inset-0 operan-grid-bg opacity-20" />
      <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-[#6377FF]/5 blur-3xl" />

      <div className="relative mx-auto max-w-5xl px-6 lg:px-8">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
              <span className="flex h-2 w-2 rounded-full bg-[#6377FF] animate-operan-pulse-glow" />
              <span className="text-xs font-medium text-[#94A3B8]">Live Workflow</span>
            </div>
            <h2 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
              One booking.{' '}
              <span className="operan-accent-gradient">Every operation.</span>
            </h2>
            <p className="mt-4 text-lg text-[#94A3B8]">
              From payment collection to customer communication, OPERAN coordinates every step automatically.
            </p>
          </div>
        </div>

        {/* Flow diagram */}
        <div className="mt-16">
          <div className="mx-auto max-w-md">
            {flowSteps.map((step, i) => {
              const isActive = i === activeStep;
              const isPast = completedSteps.has(i);
              const isFuture = !isActive && !isPast;

              return (
                <div key={step.label}>
                  {/* Step */}
                  <div
                    className={`relative flex items-center gap-4 rounded-xl border p-4 transition-all duration-500 ${
                      isActive
                        ? 'border-[#6377FF]/40 bg-[#6377FF]/8 operan-glow-sm'
                        : isPast
                        ? 'border-[#22C55E]/15 bg-[#22C55E]/[0.03]'
                        : 'border-white/[0.04] bg-transparent opacity-30'
                    }`}
                    style={{
                      animation: isVisible ? `operan-fade-up 0.5s ease-out ${i * 0.05}s both` : 'none',
                    }}
                  >
                    {/* Icon / Check */}
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-500 ${
                        isActive
                          ? 'bg-[#6377FF] text-white'
                          : isPast
                          ? 'bg-[#22C55E]/15 text-[#22C55E]'
                          : 'bg-white/[0.04] text-[#94A3B8]'
                      }`}
                    >
                      {isPast ? (
                        <svg className="h-5 w-5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M2 8l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : isActive ? (
                        <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-current" />
                      )}
                    </div>

                    {/* Text */}
                    <div className="flex-1">
                      <div className={`text-sm font-medium transition-colors duration-300 ${
                        isActive ? 'text-white' : isPast ? 'text-[#94A3B8]' : 'text-[#94A3B8]/60'
                      }`}>
                        {step.label}
                      </div>
                      <div className="text-xs text-[#94A3B8]/60">{step.desc}</div>
                    </div>

                    {/* Status indicator */}
                    {isActive && (
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-2 w-2 rounded-full bg-[#6377FF] animate-operan-pulse-glow" />
                        <span className="text-[10px] font-medium text-[#6377FF]">Running</span>
                      </div>
                    )}
                    {isPast && (
                      <span className="text-[10px] font-medium text-[#22C55E]/60">Done</span>
                    )}
                  </div>

                  {/* Connector */}
                  {i < flowSteps.length - 1 && (
                    <div className="flex justify-center py-1">
                      <div className="relative h-8 w-px bg-white/[0.06]">
                        {isPast && (
                          <div
                            className="absolute inset-0 bg-[#22C55E]/40"
                            style={{ animation: 'operan-fade-up 0.3s ease-out' }}
                          />
                        )}
                        {isActive && (
                          <div className="absolute inset-0 overflow-hidden">
                            <div
                              className="absolute inset-0 bg-gradient-to-b from-[#6377FF] to-transparent"
                              style={{ animation: 'operan-fade-up 0.6s ease-out' }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className={`mt-12 text-center operan-reveal operan-reveal-delay-2 ${isVisible ? 'is-visible' : ''}`}>
          <p className="text-lg font-medium text-white">
            &ldquo;I don&apos;t have to do any manual work anymore.&rdquo;
          </p>
          <p className="mt-2 text-sm text-[#94A3B8]">
            Every step runs automatically. You just watch it happen.
          </p>
        </div>
      </div>
    </section>
  );
}
