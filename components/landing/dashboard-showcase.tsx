'use client';

import { useScrollReveal } from '@/hooks/use-scroll-reveal';

export default function OperanDashboardShowcase() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section ref={ref} className="relative overflow-hidden py-24 lg:py-32">
      {/* Background glow */}
      <div className="absolute left-1/2 top-1/2 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2563EB]/5 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Built for operators.{' '}
              <span className="operan-accent-gradient">Not spreadsheets.</span>
            </h2>
            <p className="mt-4 text-lg text-[#94A3B8]">
              Every screen is designed for the way charter companies actually work.
            </p>
          </div>
        </div>

        {/* Dashboard mockup */}
        <div
          className={`mt-16 operan-reveal operan-reveal-delay-1 ${isVisible ? 'is-visible' : ''}`}
        >
          <div className="relative">
            {/* Outer glow */}
            <div className="absolute -inset-8 rounded-3xl bg-gradient-to-br from-[#2563EB]/10 via-transparent to-transparent blur-3xl" />

            {/* Browser frame */}
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111827] shadow-2xl">
              {/* Top bar */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                </div>
                <div className="mx-auto flex items-center gap-2 rounded-md bg-white/[0.03] px-3 py-1">
                  <svg className="h-3 w-3 text-[#94A3B8]/40" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="5" width="6" height="5" rx="1" />
                    <path d="M4.5 5V4a1.5 1.5 0 013 0v1" strokeLinecap="round" />
                  </svg>
                  <span className="text-[10px] text-[#94A3B8]/40">app.operan.io/dashboard</span>
                </div>
              </div>

              {/* Dashboard body */}
              <div className="flex min-h-[500px]">
                {/* Sidebar */}
                <div className="hidden w-48 shrink-0 border-r border-white/[0.06] p-4 lg:block">
                  <div className="mb-6 flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2563EB]">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M3 12l4-4 4 4 4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span className="text-xs font-semibold text-white">OPERAN</span>
                  </div>
                  <div className="space-y-1">
                    {[
                      { label: 'Dashboard', active: true },
                      { label: 'Reservations' },
                      { label: 'Customers' },
                      { label: 'Pipeline' },
                      { label: 'Automations' },
                      { label: 'Communications' },
                      { label: 'Waivers' },
                      { label: 'Settings' },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                          item.active
                            ? 'bg-[#2563EB]/12 text-white'
                            : 'text-[#94A3B8]/60'
                        }`}
                      >
                        <div className={`h-1.5 w-1.5 rounded-full ${item.active ? 'bg-[#2563EB]' : 'bg-white/10'}`} />
                        {item.label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Main content */}
                <div className="flex-1 p-6">
                  {/* Header */}
                  <div className="mb-6 flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold text-white">Good morning, Captain</div>
                      <div className="text-xs text-[#94A3B8]">Here&apos;s what&apos;s happening today</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs text-[#94A3B8]">
                        Aug 4, 2026
                      </div>
                      <div className="rounded-lg bg-[#2563EB] px-3 py-1.5 text-xs font-medium text-white">
                        + New Booking
                      </div>
                    </div>
                  </div>

                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                      { label: 'Today\'s Charters', value: '8', trend: '+2', color: '#2563EB' },
                      { label: 'Revenue (MTD)', value: '$84.2k', trend: '+24%', color: '#22C55E' },
                      { label: 'Pending Waivers', value: '3', trend: '-5', color: '#F59E0B' },
                      { label: 'Occupancy', value: '92%', trend: '+7%', color: '#2563EB' },
                    ].map((kpi, i) => (
                      <div
                        key={kpi.label}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                        style={{ animation: isVisible ? `operan-fade-up 0.4s ease-out ${i * 0.08}s both` : 'none' }}
                      >
                        <div className="text-[10px] font-medium uppercase tracking-wider text-[#94A3B8]">
                          {kpi.label}
                        </div>
                        <div className="mt-1.5 text-2xl font-semibold text-white">{kpi.value}</div>
                        <div className="mt-0.5 text-[10px] font-medium" style={{ color: kpi.color }}>
                          {kpi.trend}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Chart + Side panel */}
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {/* Chart */}
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 lg:col-span-2">
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-white">Revenue Overview</div>
                          <div className="text-[10px] text-[#94A3B8]">Last 30 days</div>
                        </div>
                        <div className="flex gap-1.5">
                          <div className="rounded-md bg-white/[0.04] px-2 py-1 text-[9px] text-[#94A3B8]">30D</div>
                          <div className="rounded-md bg-[#2563EB]/12 px-2 py-1 text-[9px] font-medium text-[#2563EB]">90D</div>
                        </div>
                      </div>
                      <div className="flex h-32 items-end gap-1">
                        {Array.from({ length: 30 }).map((_, i) => {
                          const h = 30 + Math.sin(i * 0.3) * 25 + Math.random() * 30;
                          return (
                            <div
                              key={i}
                              className="flex-1 rounded-t bg-gradient-to-t from-[#2563EB]/20 to-[#2563EB]/60"
                              style={{
                                height: `${Math.min(h, 100)}%`,
                                animation: isVisible ? `operan-bar-grow 0.6s ease-out ${i * 0.02}s both` : 'none',
                                transformOrigin: 'bottom',
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Upcoming */}
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                      <div className="mb-4 text-sm font-medium text-white">Upcoming Charters</div>
                      <div className="space-y-3">
                        {[
                          { name: 'Sunset Cruise', time: '2:00 PM', pax: 12 },
                          { name: 'Island Hopping', time: '4:30 PM', pax: 6 },
                          { name: 'Private Charter', time: '6:00 PM', pax: 4 },
                        ].map((trip) => (
                          <div key={trip.name} className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#2563EB]/10 text-[10px] font-medium text-[#2563EB]">
                              {trip.time.split(':')[0]}
                            </div>
                            <div className="flex-1">
                              <div className="text-xs font-medium text-white">{trip.name}</div>
                              <div className="text-[10px] text-[#94A3B8]">{trip.time} · {trip.pax} pax</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
