'use client';

import { LayoutGrid, ShieldAlert, Link2, RefreshCw } from 'lucide-react';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

type VesselStatus = 'available' | 'booked' | 'blocked' | 'conflict';

interface Vessel {
  name: string;
  status: VesselStatus;
  week: VesselStatus[];
}

const VESSELS: Vessel[] = [
  {
    name: 'Sea Breeze 42',
    status: 'available',
    week: ['available', 'available', 'booked', 'booked', 'available', 'available', 'blocked'],
  },
  {
    name: 'Blue Horizon',
    status: 'booked',
    week: ['booked', 'booked', 'booked', 'available', 'available', 'booked', 'booked'],
  },
  {
    name: 'Coral Runner',
    status: 'conflict',
    week: ['available', 'booked', 'booked', 'blocked', 'booked', 'available', 'available'],
  },
  {
    name: 'Island Drifter',
    status: 'blocked',
    week: ['blocked', 'blocked', 'available', 'available', 'available', 'booked', 'available'],
  },
];

const STATUS_STYLES: Record<VesselStatus, { dot: string; label: string; text: string }> = {
  available: { dot: 'bg-[#22C55E]', label: 'Available', text: 'text-[#22C55E]' },
  booked: { dot: 'bg-[#6377FF]', label: 'Booked', text: 'text-[#6377FF]' },
  blocked: { dot: 'bg-[#94A3B8]', label: 'Blocked', text: 'text-[#94A3B8]' },
  conflict: { dot: 'bg-[#F87171]', label: 'Overlap detected', text: 'text-[#F87171]' },
};

const DAY_BLOCK_COLOR: Record<VesselStatus, string> = {
  available: 'bg-[#22C55E]/25 border-[#22C55E]/40',
  booked: 'bg-[#6377FF]/40 border-[#6377FF]/60',
  blocked: 'bg-white/[0.08] border-white/[0.15]',
  conflict: 'bg-[#F87171]/40 border-[#F87171]/60',
};

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const CAPABILITIES = [
  {
    icon: LayoutGrid,
    title: 'Fleet Overview',
    desc: 'See all vessels at a glance',
  },
  {
    icon: ShieldAlert,
    title: 'Conflict Prevention',
    desc: 'Catch double bookings before they happen',
  },
  {
    icon: Link2,
    title: 'External Sources',
    desc: 'Connect supported availability sources',
  },
  {
    icon: RefreshCw,
    title: 'Sync Status',
    desc: 'Know when availability was last updated',
  },
];

export default function OperanAvailabilitySection() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section id="availability" ref={ref} className="relative overflow-hidden py-16 lg:py-32">
      <div className="absolute inset-0 operan-grid-bg opacity-20" />
      <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-[#14B8A6]/5 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-6 lg:px-8">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Know what&apos;s available.
              <br />
              <span className="operan-accent-gradient">Before you say yes.</span>
            </h2>
            <p className="mt-4 text-lg text-[#94A3B8]">
              Manage availability across your fleet from one place. OPERAN helps operators keep
              bookings, blocks and external availability organized so your team knows what can
              actually be sold.
            </p>
          </div>
        </div>

        {/* Product mockup */}
        <div
          className={`operan-card operan-reveal operan-reveal-delay-1 mt-14 rounded-2xl border border-white/[0.06] p-4 sm:p-6 lg:p-8 ${
            isVisible ? 'is-visible' : ''
          }`}
        >
          {/* Header bar */}
          <div className="mb-6 flex flex-col gap-3 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Fleet Availability</h3>
              <p className="text-xs text-[#94A3B8]">4 vessels · this week</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
              <span className="flex h-2 w-2 rounded-full bg-[#22C55E] animate-operan-pulse-glow" />
              <span className="text-xs font-medium text-[#94A3B8]">Last synced 2m ago</span>
            </div>
          </div>

          {/* Vessel grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {VESSELS.map((vessel) => {
              const statusInfo = STATUS_STYLES[vessel.status];
              const isConflict = vessel.status === 'conflict';
              return (
                <div
                  key={vessel.name}
                  className={`rounded-xl border p-4 transition-colors ${
                    isConflict
                      ? 'border-[#F87171]/30 bg-[#F87171]/[0.04]'
                      : 'border-white/[0.06] bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">{vessel.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
                      <span className={`text-[11px] font-medium ${statusInfo.text}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  </div>

                  {/* Mini week view */}
                  <div className="mt-3 grid grid-cols-7 gap-1">
                    {vessel.week.map((day, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <span className="text-[9px] text-[#94A3B8]/60">{DAYS[i]}</span>
                        <div
                          className={`h-5 w-full rounded-sm border ${DAY_BLOCK_COLOR[day]}`}
                        />
                      </div>
                    ))}
                  </div>

                  {isConflict && (
                    <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#F87171]/30 bg-[#F87171]/[0.06] px-2.5 py-1.5">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-[#F87171]" strokeWidth={1.75} />
                      <span className="text-[11px] font-medium text-[#F87171]">Overlap detected</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.06] pt-4">
            {(['available', 'booked', 'blocked'] as VesselStatus[]).map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${STATUS_STYLES[s].dot}`} />
                <span className="text-[11px] text-[#94A3B8]">{STATUS_STYLES[s].label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Capability pills */}
        <div
          className={`operan-reveal operan-reveal-delay-2 mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 ${
            isVisible ? 'is-visible' : ''
          }`}
        >
          {CAPABILITIES.map((cap) => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.title}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.15]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#6377FF]/10">
                  <Icon className="h-4.5 w-4.5 text-[#6377FF]" strokeWidth={1.75} />
                </div>
                <div className="mt-3 text-sm font-medium text-white">{cap.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{cap.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
