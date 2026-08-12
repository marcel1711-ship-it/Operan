'use client';

import Link from 'next/link';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

const plans = [
  {
    name: 'Starter',
    price: '$149',
    period: '/month',
    desc: 'For operators with 1–3 listings.',
    features: [
      'Up to 3 listings',
      'Unlimited bookings',
      'Unlimited customers',
      'Stripe payments',
      'Email automations',
      'Digital waivers',
      'Public booking page',
    ],
    cta: 'Start Free Trial',
    href: '/register',
    highlighted: false,
  },
  {
    name: 'Growth',
    price: '$299',
    period: '/month',
    desc: 'For growing fleets with up to 10 listings.',
    features: [
      'Up to 10 listings',
      'Everything in Starter',
      'SMS & WhatsApp automations',
      'Pipeline CRM',
      'Captain operations panel',
      'Custom integrations',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    href: '/register',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For large fleets and multi-location operations.',
    features: [
      'Unlimited listings',
      'Everything in Growth',
      'Multiple locations',
      'Custom workflows',
      'API access',
      'SSO & advanced security',
      'Dedicated account manager',
      'SLA & onboarding',
    ],
    cta: 'Talk to Sales',
    href: 'mailto:hello@operan.io',
    highlighted: false,
  },
];

export default function OperanPricing() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section ref={ref} id="pricing" className="relative py-16 lg:py-32">
      {/* Background */}
      <div className="absolute inset-0 operan-grid-bg opacity-20" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Plans that scale{' '}
              <span className="operan-accent-gradient">with your business.</span>
            </h2>
            <p className="mt-4 text-lg text-[#94A3B8]">
              Start free for 14 days. No credit card required.
            </p>
          </div>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {plans.map((plan, i) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl p-8 operan-reveal ${
                isVisible ? 'is-visible' : ''
              } ${
                plan.highlighted
                  ? 'border border-[#6377FF]/30 bg-[#111827] operan-glow'
                  : 'border border-white/[0.08] bg-[#111827]'
              }`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <div className="rounded-full bg-[#6377FF] px-3 py-1 text-[10px] font-medium text-white">
                    Most Popular
                  </div>
                </div>
              )}

              {/* Plan name */}
              <div className="text-sm font-medium text-[#94A3B8]">{plan.name}</div>

              {/* Price */}
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-white">{plan.price}</span>
                {plan.period && <span className="text-sm text-[#94A3B8]">{plan.period}</span>}
              </div>

              {/* Description */}
              <p className="mt-3 text-sm text-[#94A3B8]">{plan.desc}</p>

              {/* CTA */}
              <Link
                href={plan.href}
                className={`mt-6 flex items-center justify-center rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                  plan.highlighted
                    ? 'bg-[#6377FF] text-white hover:bg-[#5063E8]'
                    : 'border border-white/[0.08] bg-white/[0.02] text-white hover:bg-white/[0.04]'
                }`}
              >
                {plan.cta}
              </Link>

              {/* Features */}
              <div className="mt-8 space-y-3 border-t border-white/[0.06] pt-6">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6377FF]/15">
                      <svg className="h-3 w-3 text-[#6377FF]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span className="text-sm text-[#94A3B8]">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={`mt-10 text-center operan-reveal operan-reveal-delay-3 ${isVisible ? 'is-visible' : ''}`}>
          <p className="text-sm text-[#94A3B8]">
            All plans include SSL, daily backups, and 14-day free trial.
          </p>
        </div>
      </div>
    </section>
  );
}
