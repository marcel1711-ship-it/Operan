'use client';

import { useEffect, useRef, useState } from 'react';
import {
  MessageCircle, CalendarDays, Link2, Sheet, BellRing, IdCard, Smartphone, FileStack,
  BookOpen, Users, Layers, Workflow, MessageSquare, CreditCard, FileCheck2, UsersRound,
  ArrowRight, type LucideIcon,
} from 'lucide-react';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

const WITHOUT_ITEMS: { label: string; icon: LucideIcon }[] = [
  { label: 'WhatsApp conversations', icon: MessageCircle },
  { label: 'Multiple calendars', icon: CalendarDays },
  { label: 'Payment links', icon: Link2 },
  { label: 'Spreadsheets', icon: Sheet },
  { label: 'Manual reminders', icon: BellRing },
  { label: 'Separate customer info', icon: IdCard },
  { label: 'Captain texts', icon: Smartphone },
  { label: 'Disconnected documents', icon: FileStack },
];

const WITH_ITEMS: { label: string; icon: LucideIcon }[] = [
  { label: 'One reservation', icon: BookOpen },
  { label: 'One customer record', icon: Users },
  { label: 'One availability layer', icon: Layers },
  { label: 'One operational workflow', icon: Workflow },
  { label: 'Automated communication', icon: MessageSquare },
  { label: 'Payments connected', icon: CreditCard },
  { label: 'Documents organized', icon: FileCheck2 },
  { label: 'Team synchronized', icon: UsersRound },
];

export default function OperanProblemSolution() {
  const { ref, isVisible } = useScrollReveal();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <section ref={ref} className="relative overflow-hidden py-16 lg:py-32" style={{ backgroundColor: '#070B14' }}>
      <div className="absolute inset-0 operan-grid-bg opacity-20" />
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        {/* Heading */}
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Your bookings aren&apos;t the problem.
              <br />
              <span className="operan-accent-gradient">Everything around them is.</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-[#94A3B8]">
              Most charter businesses don&apos;t have a demand problem. They have an operations
              problem. A customer wants to book — and suddenly your team is checking calendars,
              confirming availability, collecting deposits, sending agreements, updating customers
              and coordinating captains across multiple tools.
            </p>
          </div>
        </div>

        {/* Comparison */}
        <div className="mt-16 lg:mt-20">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-6">
            {/* WITHOUT OPERAN */}
            <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
              <div className="mb-4 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-[#F59E0B]/80">
                  Without OPERAN
                </span>
              </div>
              <div className="space-y-2.5">
                {WITHOUT_ITEMS.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 rounded-xl border px-4 py-3"
                      style={{
                        borderColor: 'rgba(239,68,68,0.15)',
                        backgroundColor: 'rgba(239,68,68,0.03)',
                        animation: isVisible && !reducedMotion ? `operan-fade-up 0.5s ease-out ${i * 0.06}s both` : 'none',
                      }}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F59E0B]/10">
                        <Icon className="h-4 w-4 text-[#F59E0B]/80" strokeWidth={1.5} />
                      </div>
                      <span className="text-sm text-[#A9B2C5]">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Divider / arrow */}
            <div className="flex items-center justify-center py-2 lg:py-0">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-[#111827] rotate-90 lg:rotate-0"
              >
                <ArrowRight className="h-5 w-5 text-[#6377FF]" />
              </div>
            </div>

            {/* WITH OPERAN */}
            <div className={`operan-reveal operan-reveal-delay-1 ${isVisible ? 'is-visible' : ''}`}>
              <div className="mb-4 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-[#22C55E]/80">
                  With OPERAN
                </span>
              </div>
              <div className="space-y-2.5">
                {WITH_ITEMS.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 rounded-xl border px-4 py-3"
                      style={{
                        borderColor: 'rgba(99,119,255,0.2)',
                        backgroundColor: 'rgba(99,119,255,0.05)',
                        animation: isVisible && !reducedMotion ? `operan-fade-up 0.5s ease-out ${0.3 + i * 0.06}s both` : 'none',
                      }}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#22C55E]/10">
                        <Icon className="h-4 w-4 text-[#22C55E]" strokeWidth={1.5} />
                      </div>
                      <span className="text-sm font-medium text-[#E8ECF4]">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom message */}
        <div className={`mt-16 text-center operan-reveal operan-reveal-delay-2 ${isVisible ? 'is-visible' : ''}`}>
          <p className="mx-auto max-w-2xl text-lg font-medium text-white">
            These tools work when the operation is small. OPERAN becomes valuable when the
            operation grows.
          </p>
        </div>
      </div>
    </section>
  );
}
