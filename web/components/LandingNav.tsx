'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bus, Menu, X } from 'lucide-react';

const navLinks = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

export function LandingNav() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 24);
    }
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-night/85 backdrop-blur-xl border-b border-white/10 py-3'
          : 'bg-transparent border-b border-transparent py-5'
      }`}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-amber text-night shadow-[0_0_0_1px_rgba(255,201,0,0.4),0_6px_16px_-6px_rgba(255,201,0,0.6)]">
            <Bus size={17} strokeWidth={2.4} />
          </span>
          <span className="font-mono font-semibold tracking-tight text-[18px] text-white">
            Bus<span className="text-amber">Buzz</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-3.5 py-2 text-[14px] font-medium text-white/60 hover:text-white transition-colors duration-150"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            className="ml-2 rounded-[var(--radius-btn)] px-4 py-2 text-sm font-medium text-white/80 hover:text-white hover:bg-white/[0.06] transition-colors duration-150"
          >
            Log in
          </Link>
          <a
            href="mailto:hello@busbuzz.com.ng?subject=School Demo Request"
            className="rounded-[var(--radius-btn)] bg-amber text-night px-4 py-2 text-sm font-bold hover:brightness-105 active:scale-[0.97] transition-all duration-150 shadow-[0_8px_20px_-8px_rgba(255,201,0,0.7)]"
          >
            Book a demo
          </a>
        </div>

        <button
          type="button"
          className="md:hidden text-white p-1"
          onClick={() => setIsMobileMenuOpen((open) => !open)}
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden bg-night/95 backdrop-blur-xl border-t border-white/10 py-4 px-6 flex flex-col gap-1 mt-3">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className="py-2.5 text-[15px] font-medium text-white/70 hover:text-white transition-colors duration-150"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            onClick={() => setIsMobileMenuOpen(false)}
            className="mt-2 rounded-[var(--radius-btn)] border border-white/15 text-white px-4 py-2.5 text-sm font-medium text-center hover:bg-white/[0.06] transition-colors duration-150"
          >
            Log in
          </Link>
          <a
            href="mailto:hello@busbuzz.com.ng?subject=School Demo Request"
            onClick={() => setIsMobileMenuOpen(false)}
            className="rounded-[var(--radius-btn)] bg-amber text-night px-4 py-2.5 text-sm font-bold text-center hover:brightness-105 transition-all duration-150"
          >
            Book a demo
          </a>
        </div>
      )}
    </nav>
  );
}
