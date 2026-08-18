'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useScrollReveal } from '@/hooks/use-scroll-reveal';
import { Plus, Minus } from 'lucide-react';

const FAQ_ITEMS = [
  {
    q: 'Can I integrate OPERAN with my existing website?',
    a: 'Yes. OPERAN can be connected to your existing website using direct booking links, booking buttons, embedded booking widgets or API integrations. You do not need to rebuild your website to start accepting bookings through OPERAN.',
  },
  {
    q: 'Do I need to create a new website?',
    a: 'No. You can keep your current website and connect each booking button directly to the relevant public listing page in OPERAN. Customers continue discovering your business through your website while OPERAN manages availability, reservations, payments and operations behind the scenes.',
  },
  {
    q: 'Is OPERAN only for boat charter companies?',
    a: 'No. OPERAN is initially designed for marine experience businesses, including yacht charters, fishing charters, boat rentals, sailing schools, diving centers, catamaran tours, boat clubs and jet ski operators. Its flexible listings, workflows and booking rules can also support other reservation-based and experience businesses.',
  },
  {
    q: 'Can I automate my entire booking process?',
    a: 'Yes. A booking can automatically trigger payment collection, customer creation, confirmation messages, waiver requests, calendar updates, reminders, internal notifications, pipeline updates and follow-up communication.',
  },
  {
    q: 'Does OPERAN replace my current software?',
    a: 'In many cases, yes. OPERAN brings bookings, customers, CRM, payments, forms, waivers, communications, automations and daily operations into one connected platform. Businesses may still keep selected external tools and connect them through integrations when needed.',
  },
  {
    q: 'Can I connect Stripe, email, calendars and other tools?',
    a: 'Yes. OPERAN is built around a modular integrations framework. Each business can connect its own payment, email, calendar, communication and accounting providers from the Integrations area. Provider availability depends on which integrations have been activated and verified.',
  },
  {
    q: 'Do I need technical knowledge to use OPERAN?',
    a: 'No. OPERAN is designed for business owners and operations teams. Listings, booking rules, communications and workflows are configured through the Admin Portal without requiring code.',
  },
  {
    q: 'Can OPERAN support multiple vessels, experiences or locations?',
    a: 'Yes. Each business can manage multiple listings, vessels, tours, rentals or experiences. The platform is designed to organize reservations, availability, customers and workflows across a growing operation.',
  },
  {
    q: 'How does OPERAN connect to my website?',
    a: 'Each published listing receives a public booking URL and an embeddable booking widget. You can embed the full booking experience directly into your website, or share the link through social media, advertisements, email campaigns or messaging channels. Customers book and pay without leaving your site.',
  },
  {
    q: 'What happens when a customer makes a booking?',
    a: 'OPERAN checks availability, calculates the configured price and deposit, creates the customer and reservation, starts the appropriate workflow and coordinates the next operational steps based on the rules configured by the business.',
  },
  {
    q: 'Can customers pay a deposit instead of the full amount?',
    a: 'Yes. Deposit and payment rules are configured separately for each listing. A business can collect a percentage deposit, a fixed deposit, the full balance, no online payment or a booking request only.',
  },
  {
    q: 'What makes OPERAN different from traditional booking software?',
    a: 'Traditional booking platforms often focus primarily on availability and checkout. OPERAN continues after the booking by coordinating customers, payments, workflows, communications, waivers, calendars, pipelines and operational follow-up from one system. One booking can trigger the entire operation.',
  },
  {
    q: 'Can I try OPERAN before subscribing?',
    a: 'Yes. Every plan includes a 14-day free trial with access to all features included in your selected plan. No credit card is required to start. The fastest way to get going is to see OPERAN in action — we will walk you through your operation and help you configure listings, workflows and the booking process before you commit.',
  },
];

export default function OperanFAQ() {
  const { ref, isVisible } = useScrollReveal();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section ref={ref} id="faq" className="relative overflow-hidden py-16 lg:py-32">
      <div className="absolute inset-0 operan-grid-bg opacity-20" />
      <div className="absolute left-1/2 top-1/2 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#6377FF]/[0.03] blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          {/* Left column: heading + CTA */}
          <div className={`operan-reveal ${isVisible ? 'is-visible' : ''}`}>
            <div className="lg:sticky lg:top-32">
              <h2 className="text-balance text-4xl font-bold tracking-tight text-white sm:text-5xl">
                Frequently Asked{' '}
                <span className="operan-accent-gradient">Questions</span>
              </h2>
              <p className="mt-4 text-lg text-[#94A3B8]">
                Everything you need to know before running your business on OPERAN.
              </p>

              <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#111827] p-6">
                <p className="text-sm font-medium text-white">Still have questions?</p>
                <p className="mt-2 text-sm text-[#94A3B8]">
                  Book a demo and we&apos;ll walk you through the platform.
                </p>
                <Link
                  href="mailto:hello@operan.io"
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-[#6377FF] px-5 py-3 text-sm font-medium text-white transition-all hover:bg-[#5063E8] operan-glow-sm"
                >
                  Book a Demo
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <p className="mt-3 text-xs text-[#94A3B8]">
                  or contact us at hello@operan.io
                </p>
              </div>
            </div>
          </div>

          {/* Right column: accordion */}
          <div className={`operan-reveal operan-reveal-delay-1 ${isVisible ? 'is-visible' : ''}`}>
            <div className="space-y-3">
              {FAQ_ITEMS.map((item, i) => {
                const isOpen = openIndex === i;
                return (
                  <div
                    key={i}
                    className={`overflow-hidden rounded-2xl border transition-colors duration-300 ${
                      isOpen
                        ? 'border-[#6377FF]/30 bg-[#111827]'
                        : 'border-white/[0.08] bg-[#111827] hover:border-white/[0.15]'
                    }`}
                  >
                    <h3>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`faq-panel-${i}`}
                        id={`faq-trigger-${i}`}
                        onClick={() => setOpenIndex(isOpen ? null : i)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6377FF]/40 rounded-2xl"
                      >
                        <span className={`text-sm font-medium transition-colors duration-200 ${
                          isOpen ? 'text-white' : 'text-[#94A3B8]'
                        }`}>
                          {item.q}
                        </span>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                          isOpen
                            ? 'bg-[#6377FF]/15 text-[#7C8CFF] rotate-180'
                            : 'bg-white/[0.04] text-[#94A3B8]'
                        }`}>
                          {isOpen ? (
                            <Minus className="h-3.5 w-3.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                        </span>
                      </button>
                    </h3>
                    <div
                      id={`faq-panel-${i}`}
                      role="region"
                      aria-labelledby={`faq-trigger-${i}`}
                      className="grid transition-all duration-300 ease-in-out"
                      style={{
                        gridTemplateRows: isOpen ? '1fr' : '0fr',
                        opacity: isOpen ? 1 : 0,
                      }}
                    >
                      <div className="overflow-hidden">
                        <p className="px-5 pb-5 text-sm leading-relaxed text-[#94A3B8]">
                          {item.a}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
