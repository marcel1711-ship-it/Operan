'use client';

import { useScrollReveal } from '@/hooks/use-scroll-reveal';

const integrations = [
  { name: 'Stripe', desc: 'Payments & payouts', letter: 'S', color: '#635BFF' },
  { name: 'Resend', desc: 'Transactional email', letter: 'R', color: '#2563EB' },
  { name: 'Google Calendar', desc: 'Two-way sync', letter: 'G', color: '#4285F4' },
  { name: 'Twilio', desc: 'SMS messaging', letter: 'T', color: '#F22F46' },
  { name: 'WhatsApp', desc: 'Customer messaging', letter: 'W', color: '#25D366' },
  { name: 'QuickBooks', desc: 'Accounting sync', letter: 'Q', color: '#2CA01C' },
  { name: 'iCal', desc: 'Calendar export', letter: 'i', color: '#94A3B8' },
  { name: 'Zapier', desc: 'Connect 5,000+ apps', letter: 'Z', color: '#FF4A00' },
];

export default function OperanIntegrations() {
  const { ref, isVisible } = useScrollReveal();

  return (
    <section ref={ref} id="integrations" className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Connects to{' '}
              <span className="operan-accent-gradient">everything.</span>
            </h2>
            <p className="mt-4 text-lg text-[#94A3B8]">
              Native integrations with the tools you already use. No Zapier required.
            </p>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {integrations.map((int, i) => (
            <div
              key={int.name}
              className={`group operan-card operan-card-hover flex items-center gap-4 rounded-2xl p-5 operan-reveal ${
                isVisible ? 'is-visible' : ''
              }`}
              style={{ transitionDelay: `${i * 50}ms` }}
            >
              {/* Logo */}
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] text-lg font-bold transition-transform group-hover:scale-105"
                style={{
                  backgroundColor: `${int.color}15`,
                  color: int.color,
                }}
              >
                {int.letter}
              </div>

              {/* Text */}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">{int.name}</div>
                <div className="truncate text-xs text-[#94A3B8]">{int.desc}</div>
              </div>

              {/* Connected indicator */}
              <div className="ml-auto flex h-2 w-2 shrink-0 rounded-full bg-[#22C55E]" />
            </div>
          ))}
        </div>

        <div className={`mt-12 text-center operan-reveal operan-reveal-delay-3 ${isVisible ? 'is-visible' : ''}`}>
          <p className="text-sm text-[#94A3B8]">
            Don&apos;t see your tool? Our API makes custom integrations straightforward.
          </p>
        </div>
      </div>
    </section>
  );
}
