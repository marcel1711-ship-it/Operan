'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays, Mail, CreditCard, Users, MessageSquare,
  FileSignature, FileText, BookOpen, CheckCircle2,
  type LucideIcon,
} from 'lucide-react';
import { OperanLogoIcon } from './operan-logo';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

const TOOLS: { name: string; icon: LucideIcon }[] = [
  { name: 'Booking', icon: BookOpen },
  { name: 'Email', icon: Mail },
  { name: 'Payments', icon: CreditCard },
  { name: 'Calendar', icon: CalendarDays },
  { name: 'CRM', icon: Users },
  { name: 'Messaging', icon: MessageSquare },
  { name: 'Forms', icon: FileText },
  { name: 'Waivers', icon: FileSignature },
];

// Step timeline:
// 0: all disconnected -> 1 at 0.5s
// 1-5: tools 0-4 connect one by one (0.5s each)
// 6: remaining tools 5-7 connect (0.5s)
// 7: hold - OPERAN completed (0.8s)
// 8: hold (1.2s)
// then reset to 0 (0.5s fade)
const STEP_DELAYS: Record<number, number> = {
  0: 500,
  1: 500,
  2: 500,
  3: 500,
  4: 500,
  5: 500,
  6: 800,
  7: 1200,
  8: 600,
};

function getConnectedCount(step: number): number {
  if (step <= 0) return 0;
  if (step <= 5) return step;
  return TOOLS.length;
}

// Desktop: 8 tools evenly spaced vertically in a 100-unit viewBox
const TOOL_Y = TOOLS.map((_, i) => 6.25 + i * 12.5);
// Mobile: 4 columns, lines from top to bottom center
const TOOL_X_MOBILE = [12.5, 37.5, 62.5, 87.5];

export default function OperanProblemSolution() {
  const { ref, isVisible } = useScrollReveal();
  const [step, setStep] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    if (reducedMotion) {
      setStep(7);
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const scheduleNext = (currentStep: number) => {
      if (cancelled) return;
      const delay = STEP_DELAYS[currentStep] ?? 500;
      const nextStep = currentStep >= 8 ? 0 : currentStep + 1;
      const t = setTimeout(() => {
        if (cancelled) return;
        setStep(nextStep);
        scheduleNext(nextStep);
      }, delay);
      timers.push(t);
    };

    scheduleNext(0);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [isVisible, reducedMotion]);

  const connectedCount = reducedMotion ? TOOLS.length : getConnectedCount(step);
  const allConnected = connectedCount >= TOOLS.length;
  const isConnecting = step >= 1 && step <= 6 && !reducedMotion;

  const toolCardStyle = (connected: boolean): React.CSSProperties => ({
    backgroundColor: connected ? '#151E2E' : '#0B1220',
    borderColor: connected ? 'rgba(79,107,255,0.25)' : 'rgba(255,255,255,0.06)',
    transition: 'background-color 0.5s ease, border-color 0.5s ease, opacity 0.5s ease',
  });

  const toolIconStyle = (connected: boolean): React.CSSProperties => ({
    backgroundColor: connected ? 'rgba(79,107,255,0.12)' : 'rgba(255,255,255,0.04)',
    transition: 'background-color 0.5s ease',
  });

  const toolLabelStyle = (connected: boolean): React.CSSProperties => ({
    color: connected ? '#E8ECF4' : '#A9B2C5',
    transition: 'color 0.5s ease',
  });

  const iconColor = (connected: boolean): string => (connected ? '#4F6BFF' : '#A9B2C5');

  return (
    <section ref={ref} className="relative overflow-hidden py-24 lg:py-32" style={{ backgroundColor: '#070B14' }}>
      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        {/* Heading */}
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Replace the chaos.{' '}
              <span className="operan-accent-gradient">With one platform.</span>
            </h2>
            <p className="mt-4 text-lg text-[#A9B2C5]">
              You shouldn&apos;t need eight tools to run one business. OPERAN connects everything — so your data, your team, and your operations stay in sync.
            </p>
          </div>
        </div>

        {/* Animation */}
        <div className="relative mt-16 lg:mt-20" style={{ minHeight: '480px' }}>
          {/* ========== Desktop: tools left → OPERAN right ========== */}
          <div className="hidden lg:flex" style={{ minHeight: '480px' }}>
            {/* Tools column */}
            <div className="flex flex-col justify-around" style={{ width: '170px' }}>
              {TOOLS.map((tool, i) => {
                const connected = i < connectedCount;
                const Icon = tool.icon;
                return (
                  <div
                    key={tool.name}
                    className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5"
                    style={toolCardStyle(connected)}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={toolIconStyle(connected)}>
                      <Icon className="h-4 w-4" style={{ color: iconColor(connected) }} strokeWidth={1.5} />
                    </div>
                    <span className="text-xs font-medium" style={toolLabelStyle(connected)}>
                      {tool.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Flow area */}
            <div className="relative flex-1">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {TOOLS.map((_, i) => {
                  const connected = i < connectedCount;
                  const y = TOOL_Y[i];
                  return (
                    <g key={i}>
                      <line
                        x1="0"
                        y1={y}
                        x2="100"
                        y2="50"
                        stroke={connected ? '#4F6BFF' : 'rgba(255,255,255,0.05)'}
                        strokeWidth="0.3"
                        strokeLinecap="round"
                        style={{
                          transition: 'stroke 0.5s ease',
                          strokeDasharray: connected ? '2 3' : undefined,
                          animation: connected ? 'operan-flow 1.5s linear infinite' : undefined,
                        }}
                      />
                      {connected && !reducedMotion && (
                        <circle r="0.5" fill="#4F6BFF" opacity="0.85">
                          <animateMotion
                            dur="2.5s"
                            repeatCount="indefinite"
                            path={`M 0 ${y} L 100 50`}
                            begin={`${i * 0.3}s`}
                          />
                        </circle>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* OPERAN card */}
            <div className="flex items-center justify-center" style={{ width: '180px' }}>
              <div className="relative">
                {isConnecting && (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        className="h-24 w-24 rounded-full border animate-operan-pulse-ring"
                        style={{ borderColor: 'rgba(79,107,255,0.3)' }}
                      />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        className="h-24 w-24 rounded-full border animate-operan-pulse-ring"
                        style={{ borderColor: 'rgba(79,107,255,0.2)', animationDelay: '1s' }}
                      />
                    </div>
                  </>
                )}

                <div
                  className="relative flex h-28 w-28 flex-col items-center justify-center rounded-2xl border transition-all duration-700"
                  style={{
                    backgroundColor: allConnected ? 'rgba(79,107,255,0.08)' : '#151E2E',
                    borderColor: allConnected ? 'rgba(79,107,255,0.4)' : 'rgba(255,255,255,0.06)',
                    boxShadow: allConnected ? '0 0 40px -10px rgba(79,107,255,0.3)' : 'none',
                  }}
                >
                  <OperanLogoIcon size={32} />
                  <span
                    className="mt-1.5 text-xs font-bold tracking-wide transition-colors duration-500"
                    style={{ color: allConnected ? '#E8ECF4' : '#A9B2C5' }}
                  >
                    OPERAN
                  </span>
                  {allConnected && (
                    <CheckCircle2
                      className="absolute -right-2 -top-2 h-6 w-6 transition-opacity duration-500"
                      style={{ color: '#2EC27E', filter: 'drop-shadow(0 0 4px rgba(46,194,126,0.4))' }}
                    />
                  )}
                </div>

                <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                  <span
                    className="text-xs font-medium transition-colors duration-500"
                    style={{ color: allConnected ? '#2EC27E' : '#A9B2C5' }}
                  >
                    {allConnected ? 'Everything connected' : connectedCount > 0 ? 'Connecting...' : 'Disconnected tools'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ========== Mobile: tools top → OPERAN bottom ========== */}
          <div className="lg:hidden">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {TOOLS.map((tool, i) => {
                const connected = i < connectedCount;
                const Icon = tool.icon;
                return (
                  <div
                    key={tool.name}
                    className="flex flex-col items-center gap-2 rounded-xl border px-2 py-3"
                    style={toolCardStyle(connected)}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={toolIconStyle(connected)}>
                      <Icon className="h-4 w-4" style={{ color: iconColor(connected) }} strokeWidth={1.5} />
                    </div>
                    <span className="text-[11px] font-medium" style={toolLabelStyle(connected)}>
                      {tool.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Vertical flow lines */}
            <div className="relative my-4" style={{ height: '56px' }}>
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {TOOLS.map((_, i) => {
                  const connected = i < connectedCount;
                  const x = TOOL_X_MOBILE[i % 4];
                  return (
                    <g key={i}>
                      <line
                        x1={x}
                        y1="0"
                        x2="50"
                        y2="100"
                        stroke={connected ? '#4F6BFF' : 'rgba(255,255,255,0.05)'}
                        strokeWidth="0.4"
                        strokeLinecap="round"
                        style={{
                          transition: 'stroke 0.5s ease',
                          strokeDasharray: connected ? '2 3' : undefined,
                          animation: connected ? 'operan-flow 1.5s linear infinite' : undefined,
                        }}
                      />
                      {connected && !reducedMotion && (
                        <circle r="0.5" fill="#4F6BFF" opacity="0.85">
                          <animateMotion
                            dur="2s"
                            repeatCount="indefinite"
                            path={`M ${x} 0 L 50 100`}
                            begin={`${i * 0.25}s`}
                          />
                        </circle>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* OPERAN card */}
            <div className="flex justify-center pb-8">
              <div className="relative">
                {isConnecting && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      className="h-20 w-20 rounded-full border animate-operan-pulse-ring"
                      style={{ borderColor: 'rgba(79,107,255,0.3)' }}
                    />
                  </div>
                )}

                <div
                  className="relative flex h-24 w-24 flex-col items-center justify-center rounded-2xl border transition-all duration-700"
                  style={{
                    backgroundColor: allConnected ? 'rgba(79,107,255,0.08)' : '#151E2E',
                    borderColor: allConnected ? 'rgba(79,107,255,0.4)' : 'rgba(255,255,255,0.06)',
                    boxShadow: allConnected ? '0 0 40px -10px rgba(79,107,255,0.3)' : 'none',
                  }}
                >
                  <OperanLogoIcon size={28} />
                  <span
                    className="mt-1 text-[11px] font-bold tracking-wide transition-colors duration-500"
                    style={{ color: allConnected ? '#E8ECF4' : '#A9B2C5' }}
                  >
                    OPERAN
                  </span>
                  {allConnected && (
                    <CheckCircle2
                      className="absolute -right-1.5 -top-1.5 h-5 w-5"
                      style={{ color: '#2EC27E', filter: 'drop-shadow(0 0 4px rgba(46,194,126,0.4))' }}
                    />
                  )}
                </div>

                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-center">
                  <span
                    className="text-[11px] font-medium transition-colors duration-500"
                    style={{ color: allConnected ? '#2EC27E' : '#A9B2C5' }}
                  >
                    {allConnected ? 'Everything connected' : connectedCount > 0 ? 'Connecting...' : 'Disconnected tools'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom message */}
        <div className={`mt-16 text-center operan-reveal operan-reveal-delay-2 ${isVisible ? 'is-visible' : ''}`}>
          <p className="text-lg font-medium text-white">
            &ldquo;I replaced eight tools{' '}
            <span className="operan-accent-gradient">with one platform.</span>&rdquo;
          </p>
        </div>
      </div>
    </section>
  );
}
