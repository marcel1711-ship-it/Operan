'use client';

import OperanNav from '@/components/landing/nav';
import OperanHero from '@/components/landing/hero';
import OperanProblemSolution from '@/components/landing/problem-solution';
import OperanAutomationFlow from '@/components/landing/automation-flow';
import OperanPlatform from '@/components/landing/platform-overview';
import OperanTestimonials from '@/components/landing/testimonials';
import OperanPricing from '@/components/landing/pricing';
import OperanFAQ from '@/components/landing/faq';
import OperanFinalCTA from '@/components/landing/final-cta';
import OperanFooter from '@/components/landing/footer';

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0F172A]">
      <OperanNav />
      <OperanHero />
      <OperanProblemSolution />
      <OperanAutomationFlow />
      <OperanPlatform />
      <OperanTestimonials />
      <OperanPricing />
      <OperanFAQ />
      <OperanFinalCTA />
      <OperanFooter />
    </main>
  );
}
