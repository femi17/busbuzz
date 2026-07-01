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
      setIsScrolled(window.scrollY > 50);
    }

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-colors duration-300 ${
        isScrolled ? 'bg-navy shadow-lg' : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-display font-bold text-xl text-white">
          <Bus size={24} className="text-amber" />
          BusBuzz
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-white/80 hover:text-white text-sm font-medium"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            className="bg-amber text-navy font-semibold px-5 py-2 rounded-lg hover:bg-amber-dark transition-colors"
          >
            School Admin Login
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden text-white"
          onClick={() => setIsMobileMenuOpen((open) => !open)}
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden bg-navy py-4 px-6 flex flex-col gap-4">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-white/80 hover:text-white text-sm font-medium"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            onClick={() => setIsMobileMenuOpen(false)}
            className="bg-amber text-navy font-semibold px-5 py-2 rounded-lg hover:bg-amber-dark transition-colors text-center"
          >
            School Admin Login
          </Link>
        </div>
      )}
    </nav>
  );
}
