'use client';

import { useEffect, useState } from 'react';
import { UserPlus, Ship, Globe, ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

const STEPS = [
  {
    number: '01',
    icon: UserPlus,
    title: 'Create your account',
    description: 'Sign up in under a minute. No credit card required. Your 14-day free trial starts immediately.',
    accent: '#14B8A6',
  },
  {
    number: '02',
    icon: Ship,
    title: 'Set up your listings',
    description: 'Add your boats, set pricing, availability, and customize your booking flow. Everything in one place.',
    accent: '#6377FF',
  },
  {
    number: '03',
    icon: Globe,
    title: 'Connect to your website',
    description: 'Embed the booking widget on your existing site or let us create a professional booking page for you.',
    accent: '#A855F7',
  },
];

export default function OperanGettingStarted() {
  const { ref, isVisible } = useScrollReveal();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!isVisible) return;
    const interval = setInterval(() => {
      setActiveStep((s) => (s + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, [isVisible]);

  return (
    <section ref={ref} className="relative py-24 lg:py-32">
      <div className="absolute inset-0 operan-grid-bg opacity-20" />
      <div className="absolute inset-0 operan-radial-fade" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className={`text-center ${isVisible ? 'animate-operan-fade-up' : 'opacity-0'}`}>
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
            <span className="flex h-2 w-2 rounded-full bg-[#14B8A6] animate-operan-pulse-glow" />
            <span className="text-xs font-medium text-[#94A3B8]">Get Started in Minutes</span>
          </div>

          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Up and running in{' '}
            <span className="operan-accent-gradient">three steps.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[#94A3B8] sm:text-lg">
            No technical knowledge needed. Configure your business, connect your website, and start receiving bookings today.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3 lg:gap-8">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = activeStep === i;
            return (
              <div
                key={step.number}
                className={`group relative rounded-2xl border bg-[#111827] p-8 transition-all duration-500 ${
                  isVisible ? 'animate-operan-fade-up' : 'opacity-0'
                } ${
                  isActive
                    ? 'border-white/[0.15] shadow-[0_0_40px_-8px_var(--step-color)]'
                    : 'border-white/[0.06] hover:border-white/[0.12]'
                }`}
                style={{
                  animationDelay: `${i * 150}ms`,
                  '--step-color': `${step.accent}40`,
                } as React.CSSProperties}
                onMouseEnter={() => setActiveStep(i)}
              >
                <div className="flex items-start justify-between">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-500 ${
                      isActive ? 'scale-110' : ''
                    }`}
                    style={{ backgroundColor: `${step.accent}15` }}
                  >
                    <Icon className="h-6 w-6" style={{ color: step.accent }} />
                  </div>
                  <span
                    className={`text-3xl font-extrabold transition-colors duration-500 ${
                      isActive ? 'text-white/20' : 'text-white/[0.06]'
                    }`}
                  >
                    {step.number}
                  </span>
                </div>

                <h3 className="mt-6 text-lg font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#94A3B8]">{step.description}</p>

                <div
                  className={`mt-6 h-1 rounded-full transition-all duration-1000 ${
                    isActive ? 'w-full' : 'w-0'
                  }`}
                  style={{ backgroundColor: step.accent }}
                />
              </div>
            );
          })}
        </div>

        <div className={`mt-12 flex flex-col items-center gap-6 ${isVisible ? 'animate-operan-fade-up' : 'opacity-0'}`} style={{ animationDelay: '500ms' }}>
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-[#111827]/60 px-8 py-5 backdrop-blur-sm sm:flex-row sm:gap-4">
            <Sparkles className="h-5 w-5 text-[#F59E0B]" />
            <p className="text-center text-sm text-[#94A3B8] sm:text-left">
              <span className="font-semibold text-white">Don&apos;t have a website?</span>{' '}
              We create a professional booking page for your business — or we can set up everything for you.
            </p>
          </div>

          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-full bg-[#6377FF] px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-[#5063E8] hover:shadow-[0_0_24px_-4px_#6377FF80]"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
