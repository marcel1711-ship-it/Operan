'use client';

import Link from 'next/link';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';

export default function OperanFinalCTA() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section ref={ref} className="relative overflow-hidden py-16 lg:py-40">
      {/* Background */}
      <div className="absolute inset-0 operan-grid-bg opacity-30" />
      <div className="absolute left-1/2 top-1/2 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6377FF]/8 blur-3xl" />

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5">
            <span className="flex h-2 w-2 rounded-full bg-[#6377FF] animate-operan-pulse-glow" />
            <span className="text-xs font-medium text-[#94A3B8]">Start Free Trial · Book a Demo</span>
          </div>

          {/* Headline */}
          <h2 className="text-balance text-5xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Ready to run{' '}
            <span className="operan-accent-gradient">your business from one platform?</span>
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-lg text-[#94A3B8]">
            Join the next generation of marine businesses running on OPERAN.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-[#6377FF] px-7 py-4 text-sm font-medium text-white transition-all hover:bg-[#5063E8] operan-glow-sm"
            >
              Start Free Trial
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-7 py-4 text-sm font-medium text-white transition-all hover:border-white/[0.15] hover:bg-white/[0.04]"
            >
              Book a Demo
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
