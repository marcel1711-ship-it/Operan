'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { OperanLogoIcon } from './operan-logo';

export default function OperanNav() {
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      if (y > lastY && y > 80) {
        setHidden(true);
      } else {
        setHidden(false);
      }
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navLinks = [
    { label: 'Product', href: '#how-it-works' },
    { label: 'Solutions', href: '#solutions' },
    { label: 'Pricing', href: '#pricing' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        hidden ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'
      } ${
        scrolled
          ? 'bg-[#0F172A]/80 backdrop-blur-xl border-b border-white/[0.06]'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <OperanLogoIcon size={32} />
          <span className="text-lg font-bold tracking-tight text-white">OPERAN</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-[#94A3B8] transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm text-[#94A3B8] transition-colors hover:text-white"
          >
            Log in
          </Link>
          <a
            href="mailto:hello@operan.io"
            className="rounded-lg bg-[#6377FF] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#5063E8] operan-glow-sm"
          >
            See OPERAN in Action
          </a>
        </div>

        <div className="flex items-center gap-3 md:hidden">
          <Link
            href="/login"
            className="text-sm text-[#94A3B8] transition-colors hover:text-white"
          >
            Log in
          </Link>
          <button
            className="text-white"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="border-t border-white/[0.06] bg-[#0F172A]/95 px-6 py-4 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm text-[#94A3B8] hover:text-white"
              >
                {link.label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <Link href="/login" className="text-sm text-[#94A3B8] hover:text-white">
                Log in
              </Link>
              <a
                href="mailto:hello@operan.io"
                className="rounded-lg bg-[#6377FF] px-4 py-2 text-center text-sm font-medium text-white"
              >
                See OPERAN in Action
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
