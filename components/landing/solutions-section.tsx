'use client';

import { Ship, Building2, Network, Check, type LucideIcon } from 'lucide-react';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

interface Solution {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
  bullets: string[];
  prominent: boolean;
  accent: string;
  borderClass: string;
  glow: boolean;
}

const SOLUTIONS: Solution[] = [
  {
    icon: Ship,
    title: 'Independent Operator',
    subtitle: '1-3 boats · Owner-operated',
    description:
      'For smaller fleets currently using WhatsApp, calendars and payment links to manage bookings.',
    bullets: [
      'Booking page for each vessel',
      'Automatic payment collection',
      'Digital waivers and agreements',
      'Customer communication',
      'Captain coordination',
    ],
    prominent: false,
    accent: '#94A3B8',
    borderClass: 'border-white/[0.06]',
    glow: false,
  },
  {
    icon: Building2,
    title: 'Charter Company',
    subtitle: '4-15 boats · Operations team',
    description:
      'For teams managing multiple boats, daily operations, crew coordination and growing customer demand.',
    bullets: [
      'Fleet-wide availability management',
      'Pipeline and opportunity tracking',
      'Automated operational workflows',
      'Multi-channel communication',
      'Analytics and reporting',
    ],
    prominent: true,
    accent: '#6377FF',
    borderClass: 'border-[#6377FF]/30',
    glow: true,
  },
  {
    icon: Network,
    title: 'Broker / Multi-owner Fleet',
    subtitle: '10-30+ boats · Multiple owners',
    description:
      'For operators coordinating availability and reservations across boats belonging to different owners.',
    bullets: [
      'Multi-owner fleet coordination',
      'Centralized availability across owners',
      'Booking and payment management per vessel',
      'Real-time booking visibility',
      'Scalable operational workflows',
    ],
    prominent: true,
    accent: '#14B8A6',
    borderClass: 'border-[#14B8A6]/30',
    glow: false,
  },
];

export default function OperanSolutionsSection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section id="solutions" ref={ref} className="relative overflow-hidden py-16 lg:py-32">
      <div className="absolute inset-0 operan-grid-bg opacity-15" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Built for <span className="operan-accent-gradient">real charter operations.</span>
            </h2>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          {SOLUTIONS.map((solution, idx) => {
            const Icon = solution.icon;
            return (
              <div
                key={solution.title}
                className={`operan-reveal operan-card flex h-full flex-col rounded-2xl border ${solution.borderClass} bg-white/[0.02] p-6 sm:p-7 transition-colors hover:border-white/[0.2] ${
                  solution.glow ? 'operan-glow' : ''
                } ${solution.prominent ? 'lg:py-9' : ''} ${
                  idx === 1 ? 'operan-reveal-delay-1' : idx === 2 ? 'operan-reveal-delay-2' : ''
                } ${isVisible ? 'is-visible' : ''}`}
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${solution.accent}1A` }}
                >
                  <Icon className="h-6 w-6" style={{ color: solution.accent }} strokeWidth={1.75} />
                </div>

                <h3 className="mt-5 text-xl font-bold text-white">{solution.title}</h3>
                <p className="mt-1 text-sm font-medium" style={{ color: solution.accent }}>
                  {solution.subtitle}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[#94A3B8]">
                  {solution.description}
                </p>

                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {solution.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2.5">
                      <span
                        className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${solution.accent}1A` }}
                      >
                        <Check className="h-3 w-3" style={{ color: solution.accent }} strokeWidth={2.5} />
                      </span>
                      <span className="text-sm text-[#94A3B8]">{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
