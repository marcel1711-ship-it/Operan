'use client';

import { useScrollReveal } from '@/hooks/use-scroll-reveal';

const flow = [
  { title: 'Bookings', desc: 'Accept reservations with live availability.', icon: 'bookings' },
  { title: 'Customers', desc: 'Know every customer in one place.', icon: 'customers' },
  { title: 'Operations', desc: 'Coordinate crew, tasks and schedules.', icon: 'operations' },
  { title: 'Communications', desc: 'Email, SMS and WhatsApp from one platform.', icon: 'comms' },
  { title: 'Payments', desc: 'Collect deposits and balances.', icon: 'payments' },
  { title: 'Reports', desc: 'Make better business decisions.', icon: 'reports' },
];

const icons: Record<string, React.ReactNode> = {
  bookings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
      <circle cx="8" cy="14" r="1" fill="currentColor" />
      <circle cx="12" cy="14" r="1" fill="currentColor" />
      <circle cx="16" cy="14" r="1" fill="currentColor" />
    </svg>
  ),
  customers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  ),
  operations: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
      <path d="M3 18l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 8h4v4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  comms: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
      <path d="M3 5h18v12H7l-4 4V5z" strokeLinejoin="round" />
      <path d="M7 9h10M7 13h6" strokeLinecap="round" />
    </svg>
  ),
  payments: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M2 10h20" strokeLinecap="round" />
      <path d="M6 15h4" strokeLinecap="round" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
      <path d="M3 20h18M6 16V8M11 16V4M16 16v-6M21 16v-10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export default function OperanPlatform() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section ref={ref} id="platform" className="relative overflow-hidden py-16 lg:py-32">
      <div className="absolute inset-0 operan-grid-bg opacity-20" />
      <div className="absolute left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6377FF]/[0.03] blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
              One platform.{' '}
              <span className="operan-accent-gradient">Every operation.</span>
            </h2>
            <p className="mt-4 text-lg text-[#94A3B8]">
              OPERAN runs your entire business — not just reservations. Each capability works standalone. Together, they run the operation.
            </p>
          </div>
        </div>

        {/* Connected flow visualization */}
        <div className="mt-20">
          {/* Desktop: horizontal connected flow */}
          <div className="hidden lg:block">
            <div className="relative flex items-stretch justify-center gap-0">
              {flow.map((item, i) => (
                <div key={item.title} className="flex items-stretch">
                  {/* Node */}
                  <div
                    className={`group relative flex w-44 flex-col items-center operan-reveal ${isVisible ? 'is-visible' : ''}`}
                    style={{ transitionDelay: `${i * 100}ms` }}
                  >
                    {/* Glow */}
                    <div className="absolute -inset-2 rounded-2xl bg-[#6377FF]/0 blur-xl transition-all duration-700 group-hover:bg-[#6377FF]/10" />

                    {/* Icon circle */}
                    <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#111827] text-[#6377FF] transition-all duration-500 group-hover:border-[#6377FF]/30 group-hover:bg-[#6377FF]/8 group-hover:scale-105">
                      {icons[item.icon]}
                      {/* Pulse ring */}
                      <div className="absolute inset-0 rounded-2xl border border-[#6377FF]/0 group-hover:border-[#6377FF]/20 group-hover:animate-operan-pulse-ring" />
                    </div>

                    {/* Title + desc */}
                    <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-center text-xs leading-relaxed text-[#94A3B8]">{item.desc}</p>
                  </div>

                  {/* Connector line */}
                  {i < flow.length - 1 && (
                    <div className="flex items-center pt-8">
                      <div className="relative h-px w-12 bg-white/[0.06]">
                        {/* Animated dot traveling along the line */}
                        <div
                          className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#6377FF]"
                          style={{
                            animation: isVisible ? `operan-flow-dot 3s ease-in-out ${i * 0.3}s infinite` : 'none',
                          }}
                        />
                        {/* Static glow on the line */}
                        <div className="absolute inset-0 bg-gradient-to-r from-[#6377FF]/0 via-[#6377FF]/30 to-[#6377FF]/0" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Mobile: vertical connected flow */}
          <div className="lg:hidden">
            <div className="flex flex-col items-center">
              {flow.map((item, i) => (
                <div key={item.title} className="flex flex-col items-center">
                  <div
                    className={`flex w-64 flex-col items-center operan-reveal ${isVisible ? 'is-visible' : ''}`}
                    style={{ transitionDelay: `${i * 80}ms` }}
                  >
                    <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#111827] text-[#6377FF]">
                      {icons[item.icon]}
                    </div>
                    <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-center text-xs leading-relaxed text-[#94A3B8]">{item.desc}</p>
                  </div>

                  {/* Vertical connector */}
                  {i < flow.length - 1 && (
                    <div className="relative h-8 w-px bg-white/[0.06]">
                      <div
                        className="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[#6377FF]"
                        style={{
                          animation: isVisible ? `operan-flow-dot-v 2.5s ease-in-out ${i * 0.2}s infinite` : 'none',
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom message */}
        <div className={`mt-16 text-center operan-reveal operan-reveal-delay-3 ${isVisible ? 'is-visible' : ''}`}>
          <p className="text-lg font-medium text-white">
            &ldquo;Everything in my business{' '}
            <span className="operan-accent-gradient">is connected.</span>&rdquo;
          </p>
        </div>
      </div>
    </section>
  );
}
