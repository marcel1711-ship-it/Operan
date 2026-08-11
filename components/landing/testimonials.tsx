'use client';

import { useScrollReveal } from '@/hooks/use-scroll-reveal';

const testimonials = [
  {
    quote:
      'We replaced six different tools with one platform. Our team went from spending hours on admin to minutes. The automations handle everything from confirmation to follow-up.',
    author: 'Charter Operator',
    role: 'Fleet Owner',
    company: '3-vessel operation',
    metric: { value: '85%', label: 'less admin time' },
  },
  {
    quote:
      'The automation engine alone is worth it. A booking comes in and the customer gets a confirmation, the captain gets notified, the waiver goes out, and the calendar updates — all without anyone touching anything.',
    author: 'Operations Manager',
    role: 'Day Charter Company',
    company: '7 vessels',
    metric: { value: '3x', label: 'more bookings managed' },
  },
  {
    quote:
      'Before this we were losing customers because things fell through the cracks. Now nothing gets missed. One booking triggers the entire operation automatically.',
    author: 'Business Owner',
    role: 'Yacht Charter',
    company: '5-vessel fleet',
    metric: { value: '0', label: 'missed follow-ups' },
  },
];

export default function OperanTestimonials() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section ref={ref} className="relative py-16 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Built for operators{' '}
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
              <div className="mb-4 text-4xl leading-none text-[#6377FF]/30">&ldquo;</div>

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
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#6377FF]/20 to-[#6377FF]/5 text-xs font-medium text-[#6377FF]">
                  {t.author.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{t.author}</div>
                  <div className="text-xs text-[#94A3B8]">
                    {t.role} · {t.company}
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
