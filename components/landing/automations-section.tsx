'use client';

import { Zap, CheckCircle2, ArrowRight } from 'lucide-react';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

const WORKFLOWS = [
  { trigger: 'Booking confirmed', action: 'Send confirmation email' },
  { trigger: 'Deposit received', action: 'Update reservation status' },
  { trigger: 'Waiver missing', action: 'Send reminder to customer' },
  { trigger: '1 hour before charter', action: 'Notify captain with details' },
  { trigger: 'Charter completed', action: 'Send customer follow-up' },
];

export default function OperanAutomationsSection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section id="workflows" ref={ref} className="relative overflow-hidden py-16 lg:py-32" style={{ backgroundColor: '#070B14' }}>
      <div className="absolute inset-0 operan-grid-bg opacity-15" />
      <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-[#6377FF]/5 blur-3xl" />

      <div className="relative mx-auto max-w-4xl px-6 lg:px-8">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Your operation keeps moving.
              <br />
              <span className="operan-accent-gradient">Even when you&apos;re not chasing it.</span>
            </h2>
          </div>
        </div>

        {/* Workflow rows */}
        <div className="mt-14 flex flex-col gap-3">
          {WORKFLOWS.map((workflow, i) => (
            <div
              key={workflow.trigger}
              className="operan-card flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.15] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5"
              style={{
                opacity: isVisible ? 1 : 0,
                animation: isVisible ? `operan-fade-up 0.6s ease-out ${i * 0.15}s both` : 'none',
              }}
            >
              {/* Trigger */}
              <div className="flex flex-1 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#6377FF]/10">
                  <Zap className="h-4.5 w-4.5 text-[#6377FF]" strokeWidth={1.75} />
                </div>
                <span className="text-sm font-medium text-white">{workflow.trigger}</span>
              </div>

              {/* Connector */}
              <div className="flex items-center justify-center pl-12 sm:pl-0">
                <ArrowRight className="h-4 w-4 shrink-0 rotate-90 text-[#94A3B8]/40 sm:rotate-0" strokeWidth={2} />
              </div>

              {/* Action */}
              <div className="flex flex-1 items-center gap-3 sm:justify-end">
                <span className="text-sm text-[#94A3B8] sm:order-1">{workflow.action}</span>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#22C55E]/10 sm:order-2">
                  <CheckCircle2 className="h-4.5 w-4.5 text-[#22C55E]" strokeWidth={1.75} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Supporting copy */}
        <div
          className={`operan-reveal operan-reveal-delay-3 mx-auto mt-12 max-w-2xl text-center ${
            isVisible ? 'is-visible' : ''
          }`}
        >
          <p className="text-lg text-[#94A3B8]">
            Build workflows around your own process. OPERAN triggers the right action at the right
            time — so your team stays focused on the water, not the inbox.
          </p>
        </div>
      </div>
    </section>
  );
}
