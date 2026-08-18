'use client';

import { Shield, Users, Lightbulb, ArrowRight } from 'lucide-react';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

const benefits = [
  {
    icon: Shield,
    title: 'Direct Access',
    desc: 'Work directly with the engineering team building OPERAN.',
  },
  {
    icon: Users,
    title: 'Personalized Onboarding',
    desc: 'We set up your operation together, step by step.',
  },
  {
    icon: Lightbulb,
    title: 'Shape the Product',
    desc: 'Your feedback directly influences what we build next.',
  },
];

export default function OperanFoundingOperators() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section
      ref={ref}
      id="founding-operators"
      className="relative overflow-hidden py-16 lg:py-32"
    >
      {/* Background */}
      <div className="absolute inset-0 operan-grid-bg opacity-10" />
      <div className="absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#14B8A6]/8 blur-3xl" />

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          {/* Headline */}
          <h2 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Built with charter operators.
            <br />
            <span className="operan-accent-gradient">Not just for them.</span>
          </h2>

          {/* Copy */}
          <p className="mx-auto mt-6 max-w-2xl text-lg text-[#94A3B8]">
            We&apos;re working closely with a select group of charter businesses to build
            OPERAN around how the industry actually operates.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[#94A3B8]">
            Founding Operators receive personalized onboarding and direct access to the
            team building the platform.
          </p>
        </div>

        {/* Benefits */}
        <div
          className={`mt-14 grid gap-6 sm:grid-cols-3 operan-reveal operan-reveal-delay-1 ${
            isVisible ? 'is-visible' : ''
          }`}
        >
          {benefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div
                key={benefit.title}
                className="operan-card flex flex-col items-center rounded-2xl border border-white/[0.06] bg-[#111827] p-6 text-center"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#14B8A6]/15">
                  <Icon className="h-6 w-6 text-[#14B8A6]" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">{benefit.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">{benefit.desc}</p>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className={`mt-12 operan-reveal operan-reveal-delay-2 ${isVisible ? 'is-visible' : ''}`}>
          <a
            href="mailto:hello@operan.io?subject=Founding%20Operator"
            className="group inline-flex items-center justify-center gap-2 rounded-xl bg-[#14B8A6] px-7 py-4 text-sm font-medium text-white transition-all hover:bg-[#0D9488]"
          >
            Become a Founding Operator
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
