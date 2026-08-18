'use client';

import {
  Instagram,
  Globe,
  MessageCircle,
  CalendarCheck,
  CreditCard,
  Users,
  FileText,
  Anchor,
  Bell,
  ArrowDown,
} from 'lucide-react';
import { OperanLogoIcon } from './operan-logo';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

const SOURCES = [
  {
    name: 'Instagram',
    icon: Instagram,
    color: '#E1306C',
    bg: 'bg-[#E1306C]/10',
    border: 'border-[#E1306C]/25',
  },
  {
    name: 'Website',
    icon: Globe,
    color: '#3B82F6',
    bg: 'bg-[#3B82F6]/10',
    border: 'border-[#3B82F6]/25',
  },
  {
    name: 'WhatsApp',
    icon: MessageCircle,
    color: '#25D366',
    bg: 'bg-[#25D366]/10',
    border: 'border-[#25D366]/25',
  },
];

const OPERATIONS = [
  { name: 'Reservations', icon: CalendarCheck },
  { name: 'Payments', icon: CreditCard },
  { name: 'Customers', icon: Users },
  { name: 'Documents', icon: FileText },
  { name: 'Captain', icon: Anchor },
  { name: 'Follow-up', icon: Bell },
];

export default function OperanKeepWhatsapp() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section ref={ref} className="relative overflow-hidden py-16 lg:py-32">
      <div className="absolute inset-0 operan-radial-fade" />

      <div className="relative mx-auto max-w-5xl px-6 lg:px-8">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Keep WhatsApp.
              <br />
              <span className="operan-accent-gradient">Lose the operational chaos.</span>
            </h2>
          </div>
        </div>

        {/* Flow visual */}
        <div
          className={`operan-reveal operan-reveal-delay-1 mt-14 flex flex-col items-center ${
            isVisible ? 'is-visible' : ''
          }`}
        >
          {/* Top row: sources */}
          <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:justify-center sm:gap-4">
            {SOURCES.map((source) => {
              const Icon = source.icon;
              return (
                <div
                  key={source.name}
                  className={`operan-card flex flex-1 items-center gap-3 rounded-xl border ${source.border} bg-white/[0.02] px-4 py-3 sm:flex-col sm:gap-2 sm:py-4 sm:text-center`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${source.bg}`}
                  >
                    <Icon className="h-5 w-5" style={{ color: source.color }} strokeWidth={1.75} />
                  </div>
                  <span className="text-sm font-medium text-white">{source.name}</span>
                </div>
              );
            })}
          </div>

          {/* Arrow down */}
          <div className="my-4 flex flex-col items-center text-[#94A3B8]/50">
            <div className="h-8 w-px bg-gradient-to-b from-white/20 to-white/5" />
            <ArrowDown className="h-4 w-4" strokeWidth={2} />
          </div>

          {/* OPERAN center card */}
          <div className="operan-glow flex flex-col items-center gap-3 rounded-2xl border border-[#6377FF]/30 bg-[#6377FF]/[0.06] px-8 py-6">
            <OperanLogoIcon size={44} />
            <span className="text-base font-bold tracking-tight text-white">OPERAN</span>
          </div>

          {/* Arrow down */}
          <div className="my-4 flex flex-col items-center text-[#94A3B8]/50">
            <div className="h-8 w-px bg-gradient-to-b from-white/20 to-white/5" />
            <ArrowDown className="h-4 w-4" strokeWidth={2} />
          </div>

          {/* Bottom row: operations */}
          <div className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {OPERATIONS.map((op) => {
              const Icon = op.icon;
              return (
                <div
                  key={op.name}
                  className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-center transition-colors hover:border-white/[0.15]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#14B8A6]/10">
                    <Icon className="h-4.5 w-4.5 text-[#14B8A6]" strokeWidth={1.75} />
                  </div>
                  <span className="text-xs font-medium text-[#94A3B8]">{op.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Copy */}
        <div
          className={`operan-reveal operan-reveal-delay-2 mx-auto mt-12 max-w-2xl text-center ${
            isVisible ? 'is-visible' : ''
          }`}
        >
          <p className="text-lg text-[#94A3B8]">
            Your customers can keep contacting you where they already do. OPERAN becomes the
            operational layer behind the conversation — keeping reservations, availability,
            payments, customer information and follow-ups organized.
          </p>
          <p className="mt-4 text-lg font-semibold text-white">
            You keep selling. OPERAN runs what happens next.
          </p>
        </div>
      </div>
    </section>
  );
}
