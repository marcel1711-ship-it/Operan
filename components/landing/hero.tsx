'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Anchor, CalendarDays, Users, Zap, Plug, CreditCard, Mail,
  FileSignature, Bell, CheckCircle2, Star, Ship,
} from 'lucide-react';
import { OperanLogoIcon } from './operan-logo';

export default function OperanHero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="relative overflow-hidden pt-24 pb-12 lg:pt-40 lg:pb-28">
      <div className="absolute inset-0 operan-grid-bg opacity-40" />
      <div className="absolute inset-0 operan-radial-fade" />

      <div className="absolute bottom-0 left-0 right-0 h-64 overflow-hidden">
        <svg viewBox="0 0 1440 320" className="absolute bottom-0 w-full animate-operan-wave" preserveAspectRatio="none">
          <defs>
            <linearGradient id="oceanGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#14B8A6" stopOpacity="0" />
              <stop offset="100%" stopColor="#14B8A6" stopOpacity="0.08" />
            </linearGradient>
          </defs>
          <path d="M0,160 C320,220 480,100 720,140 C960,180 1120,80 1440,120 L1440,320 L0,320 Z" fill="url(#oceanGrad)" />
        </svg>
        <svg viewBox="0 0 1440 320" className="absolute bottom-0 w-full animate-operan-wave" preserveAspectRatio="none" style={{ animationDelay: '3s', opacity: 0.5 }}>
          <path d="M0,200 C240,140 560,240 840,180 C1120,120 1280,200 1440,160 L1440,320 L0,320 Z" fill="url(#oceanGrad)" />
        </svg>
      </div>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: Copy */}
          <div className={`flex flex-col ${mounted ? 'animate-operan-fade-up' : 'opacity-0'}`}>
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
              <span className="flex h-2 w-2 rounded-full bg-[#14B8A6] animate-operan-pulse-glow" />
              <span className="text-xs font-medium text-[#94A3B8]">THE OPERATING SYSTEM FOR CHARTER BUSINESSES</span>
            </div>

            <h1 className="text-balance text-5xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
              One booking.{' '}
              <span className="operan-accent-gradient">Every operation.</span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#94A3B8]">
              From availability and payments to customer communication, waivers and captain coordination — OPERAN keeps your charter operation connected from booking to completion.
            </p>

            <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#94A3B8]/70">
              Keep selling through your website, Instagram or WhatsApp. OPERAN runs what happens next.
            </p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/demo"
                className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-[#6377FF] px-6 py-3.5 text-sm font-medium text-white transition-all hover:bg-[#5063E8] operan-glow-sm"
              >
                See OPERAN in Action
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-3.5 text-sm font-medium text-white transition-all hover:border-white/[0.15] hover:bg-white/[0.04]"
              >
                See How It Works
              </a>
            </div>


          </div>

          {/* Right: Product demo */}
          <div className={`relative lg:scale-105 ${mounted ? 'animate-operan-scale-in' : 'opacity-0'}`} style={{ animationDelay: '0.2s' }}>
            <HeroProductDemo />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   HeroProductDemo — recreates the real OPERAN interface
   with a live automation timeline that loops forever.
   ============================================================ */

const TIMELINE_EVENTS = [
  { icon: CalendarDays, label: 'New Reservation' },
  { icon: CreditCard, label: 'Deposit Paid' },
  { icon: Users, label: 'Customer Created' },
  { icon: Zap, label: 'Workflow Running' },
  { icon: Mail, label: 'Confirmation Email' },
  { icon: Anchor, label: 'Captain Assigned' },
  { icon: CalendarDays, label: 'Calendar Updated' },
  { icon: FileSignature, label: 'Waiver Requested' },
  { icon: Bell, label: 'Reminder Scheduled' },
  { icon: CheckCircle2, label: 'Trip Completed' },
  { icon: Star, label: 'Review Requested' },
];

const SIDEBAR_ITEMS = [
  { icon: CalendarDays, screen: 0 },
  { icon: Users, screen: 2 },
  { icon: Zap, screen: 1 },
  { icon: Plug, screen: 3 },
];

function HeroProductDemo() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 850);
    return () => clearInterval(timer);
  }, []);

  const phase = tick % 16; // 0: idle, 1-11: events, 12-15: pause
  const cycle = Math.floor(tick / 16);
  const visibleEvents = Math.min(phase, 11);
  const allDone = phase >= 12;

  const screen = allDone
    ? 0
    : phase <= 2
      ? 0
      : phase === 3
        ? 2
        : phase <= 8
          ? 1
          : phase === 9
            ? 3
            : 0;

  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-[#6377FF]/10 to-transparent blur-2xl" />

      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111827] shadow-2xl animate-operan-glow-pulse">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-white/10" />
            <div className="h-3 w-3 rounded-full bg-white/10" />
            <div className="h-3 w-3 rounded-full bg-white/10" />
          </div>
          <div className="ml-3 flex-1">
            <div className="flex h-6 items-center rounded-md bg-white/[0.04] px-3">
              <span className="text-[10px] text-[#94A3B8]/60">app.operan.io</span>
            </div>
          </div>
        </div>

        {/* App body */}
        <div className="flex min-h-[280px] lg:min-h-[400px]">
          {/* Mini sidebar */}
          <div
            className="flex flex-col items-center gap-3 border-r border-white/[0.06] py-4"
            style={{ width: '44px', background: 'linear-gradient(180deg, #1B2430 0%, #111827 100%)' }}
          >
            <OperanLogoIcon size={28} />
            <div className="my-1 h-px w-6 bg-white/[0.06]" />
            {SIDEBAR_ITEMS.map((item, i) => {
  const isActive = item.screen === screen;
  return (
              <div
                key={i}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-500 ${
                  isActive ? 'bg-[#6377FF]/15 text-[#7C8CFF]' : 'text-[#94A3B8]/30'
                }`}
              >
                <item.icon className="h-4 w-4" />
              </div>
  );
})}
          </div>

          {/* Main content + Activity feed */}
          <div className="flex flex-1">
            {/* Cycling product screens */}
            <div className="flex-1 p-3.5">
              <div key={`screen-${cycle}-${screen}`} className="h-full">
                {screen === 0 && <ReservationsScreen phase={phase} />}
                {screen === 1 && <WorkflowScreen phase={phase} />}
                {screen === 2 && <CustomerScreen />}
                {screen === 3 && <CalendarScreen />}
              </div>
            </div>

            {/* Activity timeline */}
            <div
              className="border-l border-white/[0.06] p-3"
              style={{ width: '152px' }}
            >
              <div className="mb-3 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#22C55E] animate-operan-pulse-glow" />
                <span className="text-[10px] font-medium text-white">Live Activity</span>
              </div>
              <div key={`events-${cycle}`} className="space-y-1">
                {TIMELINE_EVENTS.slice(0, visibleEvents).map((event, i) => {
                  const isLast = i === visibleEvents - 1;
                  const isRunning = isLast && !allDone && visibleEvents < 12;
                  const Icon = event.icon;

                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2"
                      style={{ animation: 'operan-fade-up 0.35s ease-out both' }}
                    >
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
                          isRunning
                            ? 'bg-[#6377FF]/15 text-[#7C8CFF]'
                            : 'bg-[#22C55E]/15 text-[#22C55E]'
                        }`}
                      >
                        {isRunning ? (
                          <div className="h-2.5 w-2.5 rounded-full border-2 border-[#7C8CFF] border-t-transparent animate-spin" />
                        ) : (
                          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="text-[10px] leading-tight text-[#94A3B8]">{event.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#6377FF] to-[#7C8CFF] transition-all duration-700"
                  style={{ width: `${(visibleEvents / 11) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating accent card */}
      <div className="absolute -right-4 -bottom-4 hidden rounded-xl border border-white/[0.08] bg-[#111827] p-3 shadow-xl animate-operan-float lg:block">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6377FF]/15">
            <svg className="h-4 w-4 text-[#6377FF]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 8l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="text-[10px] text-[#94A3B8]">All systems</div>
            <div className="text-xs font-medium text-white">Operational</div>
          </div>
        </div>
      </div>

      {/* Floating notification badge */}
      <div
        className="absolute -left-6 top-1/3 hidden rounded-xl border border-white/[0.08] bg-[#111827] p-3 shadow-xl lg:block"
        style={{ animation: 'operan-float 6s ease-in-out infinite', animationDelay: '1s' }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#22C55E]/15">
            <svg className="h-4 w-4 text-[#22C55E]" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 8l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="text-[10px] text-[#94A3B8]">Booking</div>
            <div className="text-xs font-medium text-white">Confirmed</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Screen 1: Reservations (recreated from real product)
   ============================================================ */

function ReservationsScreen({ phase }: { phase: number }) {
  const newReservationActive = phase >= 1;
  const isConfirmed = phase >= 2;
  const isCompleted = phase >= 10;

  const rows = [
    { name: 'Mike Davis', vessel: 'Wave Rider', amount: '$800', status: 'completed' as const, statusColor: 'bg-[#22C55E]/10 text-[#22C55E]' },
    { name: 'John Smith', vessel: 'Sea Breeze', amount: '$1,200', status: 'confirmed' as const, statusColor: 'bg-[#6377FF]/10 text-[#7C8CFF]' },
  ];

  return (
    <div style={{ animation: 'operan-fade-up 0.5s ease-out both' }}>
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-lg"
          style={{ background: 'linear-gradient(135deg, #7C8CFF 0%, #6377FF 100%)' }}
        >
          <CalendarDays className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-white">Reservations</span>
        <span className="ml-auto text-[9px] text-[#94A3B8]">3 total</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-white/[0.04]">
        {/* Table header */}
        <div className="flex items-center gap-2 border-b border-white/[0.04] bg-white/[0.02] px-2 py-1.5">
          <span className="flex-1 text-[8px] font-medium uppercase tracking-wider text-[#94A3B8]/60">Client</span>
          <span className="text-[8px] font-medium uppercase tracking-wider text-[#94A3B8]/60" style={{ width: '50px' }}>Total</span>
          <span className="text-[8px] font-medium uppercase tracking-wider text-[#94A3B8]/60" style={{ width: '52px' }}>Status</span>
        </div>

        {/* Existing rows */}
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-center gap-2 border-b border-white/[0.03] px-2 py-1.5"
            style={{ animation: `operan-fade-up 0.3s ease-out ${i * 0.08}s both` }}
          >
            <div className="flex-1">
              <div className="text-[10px] font-medium text-white">{r.name}</div>
              <div className="flex items-center gap-1 text-[8px] text-[#94A3B8]">
                <Anchor className="h-2 w-2" /> {r.vessel}
              </div>
            </div>
            <div className="text-[10px] text-[#94A3B8]" style={{ width: '50px' }}>{r.amount}</div>
            <div style={{ width: '52px' }}>
              <span className={`inline-flex rounded-full border border-white/[0.06] px-1.5 py-0.5 text-[8px] font-semibold ${r.statusColor}`}>
                {r.status}
              </span>
            </div>
          </div>
        ))}

        {/* New reservation row (slides in when phase >= 1) */}
        {newReservationActive && (
          <div
            className="flex items-center gap-2 bg-[#6377FF]/[0.04] px-2 py-1.5"
            style={{ animation: 'operan-slide-right 0.4s ease-out both' }}
          >
            <div className="flex-1">
              <div className="text-[10px] font-medium text-white">Sarah Johnson</div>
              <div className="flex items-center gap-1 text-[8px] text-[#94A3B8]">
                <Anchor className="h-2 w-2" /> Ocean Dream
              </div>
            </div>
            <div className="text-[10px] text-[#94A3B8]" style={{ width: '50px' }}>$2,400</div>
            <div style={{ width: '52px' }}>
              <span
                className={`inline-flex rounded-full border px-1.5 py-0.5 text-[8px] font-semibold transition-all duration-500 ${
                  isCompleted
                    ? 'border-[#22C55E]/20 bg-[#22C55E]/10 text-[#22C55E]'
                    : isConfirmed
                      ? 'border-[#6377FF]/20 bg-[#6377FF]/10 text-[#7C8CFF]'
                      : 'border-[#F59E0B]/20 bg-[#F59E0B]/10 text-[#F59E0B]'
                }`}
              >
                {isCompleted ? 'completed' : isConfirmed ? 'confirmed' : 'new'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Deposit indicator */}
      {newReservationActive && (
        <div
          className="mt-2 flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-2.5 py-1.5"
          style={{ animation: 'operan-fade-up 0.3s ease-out 0.3s both' }}
        >
          <div className={`flex h-4 w-4 items-center justify-center rounded-full transition-colors duration-500 ${
            isConfirmed ? 'bg-[#22C55E]/15 text-[#22C55E]' : 'bg-[#F59E0B]/15 text-[#F59E0B]'
          }`}>
            {isConfirmed ? (
              <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <div className="h-1.5 w-1.5 rounded-full bg-current animate-operan-pulse-glow" />
            )}
          </div>
          <span className="text-[9px] text-[#94A3B8]">
            {isConfirmed ? 'Deposit received — $600.00' : 'Awaiting deposit...'}
          </span>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Screen 2: Workflow Builder (recreated from real product)
   ============================================================ */

function WorkflowScreen({ phase }: { phase: number }) {
  const nodes = [
    { label: 'Reservation Confirmed', activateAt: 4, isTrigger: true },
    { label: 'Payment Received', activateAt: 4 },
    { label: 'Customer Updated', activateAt: 4 },
    { label: 'Send Email', activateAt: 5 },
    { label: 'Assign Captain', activateAt: 6 },
    { label: 'Calendar Event', activateAt: 7 },
    { label: 'Request Waiver', activateAt: 8 },
  ];

  return (
    <div style={{ animation: 'operan-fade-up 0.5s ease-out both' }}>
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-lg"
          style={{ background: 'linear-gradient(135deg, #7C8CFF 0%, #6377FF 100%)' }}
        >
          <Zap className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-white">Automations</span>
        <span className="ml-auto flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-operan-pulse-glow" />
          <span className="text-[8px] text-[#94A3B8]">Running</span>
        </span>
      </div>

      {/* Workflow nodes */}
      <div>
        {nodes.map((node, i) => {
          const isDone = phase > node.activateAt;
          const isRunning = phase === node.activateAt;
          const isFuture = phase < node.activateAt;

          return (
            <div key={i}>
              <div
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-all duration-500 ${
                  isRunning
                    ? 'border-[#6377FF]/40 bg-[#6377FF]/8'
                    : isDone
                      ? 'border-[#22C55E]/15 bg-[#22C55E]/[0.03]'
                      : 'border-white/[0.04] opacity-25'
                }`}
                style={{ animation: `operan-fade-up 0.3s ease-out ${i * 0.06}s both` }}
              >
                {/* Status icon */}
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors duration-500 ${
                    node.isTrigger
                      ? isFuture
                        ? 'bg-white/[0.04] text-[#94A3B8]/40'
                        : 'bg-[#6377FF]/15 text-[#7C8CFF]'
                      : isRunning
                        ? 'bg-[#6377FF]/15 text-[#7C8CFF]'
                        : isDone
                          ? 'bg-[#22C55E]/15 text-[#22C55E]'
                          : 'bg-white/[0.04] text-[#94A3B8]/40'
                  }`}
                >
                  {isDone && !node.isTrigger ? (
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : isRunning ? (
                    <div className="h-2.5 w-2.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  ) : node.isTrigger ? (
                    <Zap className="h-2.5 w-2.5" />
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-current" />
                  )}
                </div>

                {/* Label */}
                <span className={`text-[10px] transition-colors duration-300 ${
                  isFuture ? 'text-[#94A3B8]/40' : 'text-[#94A3B8]'
                }`}>
                  {node.label}
                </span>

                {/* Running indicator */}
                {isRunning && (
                  <span className="ml-auto text-[8px] font-medium text-[#7C8CFF]">Running</span>
                )}
                {isDone && !node.isTrigger && (
                  <span className="ml-auto text-[8px] font-medium text-[#22C55E]/60">Done</span>
                )}
              </div>

              {/* Connector line */}
              {i < nodes.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <div className={`h-2.5 w-px transition-colors duration-500 ${
                    isDone ? 'bg-[#22C55E]/30' : 'bg-white/[0.06]'
                  }`} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Screen 3: Customer Profile (recreated from real product)
   ============================================================ */

function CustomerScreen() {
  return (
    <div style={{ animation: 'operan-fade-up 0.5s ease-out both' }}>
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-lg"
          style={{ background: 'linear-gradient(135deg, #7C8CFF 0%, #6377FF 100%)' }}
        >
          <Users className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-white">Customers</span>
      </div>

      {/* Customer card */}
      <div
        className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
        style={{ animation: 'operan-fade-up 0.4s ease-out 0.1s both' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#6377FF]/15 text-[10px] font-bold text-[#7C8CFF]">
            SJ
          </div>
          <div>
            <div className="text-[11px] font-medium text-white">Sarah Johnson</div>
            <div className="flex items-center gap-1 text-[8px] text-[#94A3B8]">
              <Mail className="h-2 w-2" /> sarah@email.com
            </div>
          </div>
          <span className="ml-auto rounded-full border border-[#22C55E]/20 bg-[#22C55E]/10 px-1.5 py-0.5 text-[7px] font-semibold text-[#22C55E]">
            NEW
          </span>
        </div>

        <div className="mt-3 space-y-1.5 border-t border-white/[0.04] pt-2.5">
          <div className="flex justify-between text-[9px]">
            <span className="text-[#94A3B8]">Bookings</span>
            <span className="font-medium text-white">1</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span className="text-[#94A3B8]">Total Spent</span>
            <span className="font-medium text-white">$2,400</span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span className="text-[#94A3B8]">Vessel</span>
            <span className="flex items-center gap-1 font-medium text-white">
              <Ship className="h-2 w-2" /> Ocean Dream
            </span>
          </div>
          <div className="flex justify-between text-[9px]">
            <span className="text-[#94A3B8]">Added</span>
            <span className="font-medium text-white">just now</span>
          </div>
        </div>
      </div>

      {/* Auto-created badge */}
      <div
        className="mt-2 flex items-center gap-2 rounded-lg border border-[#22C55E]/15 bg-[#22C55E]/[0.03] px-2.5 py-1.5"
        style={{ animation: 'operan-fade-up 0.3s ease-out 0.4s both' }}
      >
        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#22C55E]/15 text-[#22C55E]">
          <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span className="text-[9px] text-[#94A3B8]">Created automatically from booking</span>
      </div>
    </div>
  );
}

/* ============================================================
   Screen 4: Calendar (recreated from real product)
   ============================================================ */

function CalendarScreen() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const events: Record<number, { label: string; color: string }> = {
    1: { label: 'Fishing', color: 'bg-[#22C55E]/15 text-[#22C55E]' },
    3: { label: 'Yacht Tour', color: 'bg-[#6377FF]/20 text-[#7C8CFF]' },
  };

  return (
    <div style={{ animation: 'operan-fade-up 0.5s ease-out both' }}>
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-lg"
          style={{ background: 'linear-gradient(135deg, #7C8CFF 0%, #6377FF 100%)' }}
        >
          <CalendarDays className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-white">Calendar</span>
        <span className="ml-auto text-[8px] text-[#94A3B8]">Aug 5 — 9</span>
      </div>

      {/* Week grid */}
      <div className="grid grid-cols-5 gap-1">
        {days.map((day, i) => (
          <div key={i} className="flex flex-col">
            <div className="mb-1 text-center text-[8px] font-medium text-[#94A3B8]/60">{day}</div>
            <div className="min-h-[48px] rounded-md border border-white/[0.04] bg-white/[0.02] p-1">
              {events[i] && (
                <div
                  className={`rounded px-1 py-0.5 text-[7px] font-medium ${events[i].color}`}
                  style={
                    i === 3
                      ? { animation: 'operan-fade-up 0.4s ease-out 0.3s both' }
                      : undefined
                  }
                >
                  {events[i].label}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* New event indicator */}
      <div
        className="mt-2.5 flex items-center gap-2 rounded-lg border border-[#6377FF]/15 bg-[#6377FF]/[0.03] px-2.5 py-1.5"
        style={{ animation: 'operan-fade-up 0.3s ease-out 0.5s both' }}
      >
        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#6377FF]/15 text-[#7C8CFF]">
          <CalendarDays className="h-2.5 w-2.5" />
        </div>
        <span className="text-[9px] text-[#94A3B8]">Ocean Dream — Thu 9:00 AM</span>
        <span className="ml-auto text-[8px] font-medium text-[#7C8CFF]">Synced</span>
      </div>
    </div>
  );
}
