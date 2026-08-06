'use client';

import { useScrollReveal } from '@/hooks/use-scroll-reveal';

const testimonials = [
  {
    quote:
      'We replaced six different tools with OPERAN. Our staff went from spending 3 hours a day on admin to maybe 20 minutes. The automations handle everything.',
    author: 'Marcus Chen',
    role: 'Owner',
    company: 'Pacific Yacht Charters',
    location: 'San Diego, CA',
    metric: { value: '85%', label: 'less admin time' },
  },
  {
    quote:
      'The automation engine alone is worth it. A booking comes in and the customer gets a confirmation, the captain gets notified, the waiver goes out, and the calendar updates — all without anyone touching anything.',
    author: 'Sarah Williams',
    role: 'Operations Director',
    company: 'Island Hopper Co.',
    location: 'Miami, FL',
    metric: { value: '3x', label: 'more bookings managed' },
  },
  {
    quote:
      'Before OPERAN we were losing customers because things fell through the cracks. Now nothing gets missed. The platform runs the business for us.',
    author: 'James Okafor',
    role: 'Founder',
    company: 'Bayline Charters',
    location: 'Seattle, WA',
    metric: { value: '0', label: 'missed follow-ups' },
  },
];

export default function OperanTestimonials() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section ref={ref} className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Trusted by operators{' '}
              <span className="operan-accent-gradient">who run real fleets.</span>
            </h2>
          </div>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {testimonials.map((t, i) => (
            <div
              key={t.author}
              className={`relative flex flex-col operan-card rounded-2xl p-8 operan-reveal ${
                isVisible ? 'is-visible' : ''
              }`}
              style={{ transitionDelay: `${i * 100}ms` }}
            >
              {/* Quote mark */}
              <div className="mb-4 text-4xl leading-none text-[#2563EB]/30">&ldquo;</div>

              {/* Quote */}
              <p className="flex-1 text-sm leading-relaxed text-[#94A3B8]">
                {t.quote}
              </p>

              {/* Metric */}
              <div className="mt-6 flex items-baseline gap-2 border-y border-white/[0.06] py-4">
                <span className="text-3xl font-semibold text-white">{t.metric.value}</span>
                <span className="text-xs text-[#94A3B8]">{t.metric.label}</span>
              </div>

              {/* Author */}
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB]/20 to-[#2563EB]/5 text-xs font-medium text-[#2563EB]">
                  {t.author.split(' ').map((n) => n[0]).join('')}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{t.author}</div>
                  <div className="text-xs text-[#94A3B8]">
                    {t.role}, {t.company}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
