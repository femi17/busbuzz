import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Bell,
  Bus,
  Check,
  ClipboardCheck,
  LayoutDashboard,
  MapPin,
  Play,
  QrCode,
  Smartphone,
} from 'lucide-react';
import { LandingNav } from '@/components/LandingNav';
import { PhoneMockup } from '@/components/landing/PhoneMockup';
import { FaqAccordion } from '@/components/FaqAccordion';

export const metadata: Metadata = {
  title: 'BusBuzz — Live School Bus Tracking for Lagos Private Schools',
  description:
    'Real-time GPS tracking for school buses in Lagos. Parents see their child\'s bus live. Schools get a full admin dashboard. No hardware to buy — we handle everything.',
};

const features = [
  {
    icon: MapPin,
    title: 'Live GPS Tracking',
    description:
      "Parents see their child's bus moving on a live map — every turn, every stop, every second of the school run.",
  },
  {
    icon: Bell,
    title: 'Instant Notifications',
    description:
      'Push alerts when the bus is approaching, when your child boards, and when they arrive safely at school.',
  },
  {
    icon: ClipboardCheck,
    title: 'Driver Attendance',
    description:
      'Every pickup and dropoff recorded with a tap. No paperwork, no phone calls, no guesswork.',
  },
  {
    icon: LayoutDashboard,
    title: 'Admin Dashboard',
    description:
      'Schools see every bus, every route, and every active trip from one screen. Complete visibility.',
  },
];

const steps = [
  {
    number: '1',
    title: 'Download the app',
    description: 'Free on iOS and Android. Takes 30 seconds.',
  },
  {
    number: '2',
    title: 'Your school links you',
    description: "The school connects your account to your child's bus route.",
  },
  {
    number: '3',
    title: 'Track live',
    description:
      'See your child\'s bus every morning and afternoon, with alerts at every stop.',
  },
];

const pricingFeatures = [
  'Pre-configured tracking device',
  'SIM card with data plan',
  'Parent app (iOS & Android)',
  'School admin dashboard',
  'WhatsApp & email support',
];

const faqItems = [
  {
    question: 'Do we need to buy any hardware?',
    answer:
      'No. BusBuzz provides a pre-configured Android phone for each bus, included in your subscription. We handle setup, SIM data, and replacements.',
  },
  {
    question: 'What does the driver need to do?',
    answer:
      "The driver taps 'Start Trip' when leaving, marks each student as they board, and taps 'End Trip' on arrival. The phone is mounted on the dashboard — GPS tracking is automatic.",
  },
  {
    question: 'How do parents get the app?',
    answer:
      'Parents download the free BusBuzz app from the App Store or Google Play. The school links each parent to their child\'s bus route — no setup needed from the parent.',
  },
  {
    question: 'Can the school see all buses at once?',
    answer:
      'Yes. The admin dashboard shows every active bus on a live map, plus trip history, attendance records, and route management — all in one place.',
  },
  {
    question: 'What is the contract length?',
    answer:
      'There is no lock-in. You can subscribe monthly, per term, or annually. Cancel anytime — we just collect the device back.',
  },
];

export default function Home() {
  return (
    <main>
      <LandingNav />

      {/* Hero */}
      <section
        id="hero"
        className="relative bg-navy min-h-[80vh] md:min-h-[90vh] flex items-center bg-[radial-gradient(ellipse_at_top_right,_rgba(255,201,0,0.15)_0%,_transparent_60%)]"
      >
        <div className="max-w-5xl mx-auto px-6 py-32 text-center">
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
            Know exactly where your child is. Every stop. Every day.
          </h1>
          <p className="text-lg md:text-xl text-white/70 mt-6 max-w-2xl mx-auto">
            BusBuzz is a managed school bus tracking platform for Lagos private
            schools. Live GPS on every bus. Instant parent notifications. Zero
            hardware hassle for your school.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <a
              href="mailto:hello@busbuzz.com?subject=School Demo Request"
              className="bg-amber text-navy font-semibold px-8 py-3.5 rounded-lg text-lg hover:bg-amber-dark transition-colors inline-flex items-center gap-2"
            >
              Book a School Demo
              <ArrowRight size={18} />
            </a>
            <Link
              href="/login"
              className="border-2 border-white/30 text-white font-semibold px-8 py-3.5 rounded-lg text-lg hover:border-white/60 transition-colors"
            >
              School Admin Login
            </Link>
          </div>

          <div className="flex gap-4 justify-center mt-8">
            {/* TODO: Replace # with real App Store and Google Play URLs once apps are published */}
            <a
              href="#"
              className="w-36 h-12 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center gap-2 text-white/80 text-sm"
            >
              <Smartphone size={18} />
              App Store
            </a>
            {/* TODO: Replace # with real App Store and Google Play URLs once apps are published */}
            <a
              href="#"
              className="w-36 h-12 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center gap-2 text-white/80 text-sm"
            >
              <Play size={18} />
              Google Play
            </a>
          </div>

          <PhoneMockup />
        </div>
      </section>

      {/* Problem */}
      <section className="bg-navy-light py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-16 h-1 bg-amber mx-auto mb-8 rounded-full" />
          <p className="font-display text-2xl md:text-3xl text-white/90 italic leading-relaxed">
            Every school morning, thousands of Lagos parents watch the clock
            and wonder: has the bus picked up my child? Is it stuck in
            traffic? When will they arrive? The anxiety is real — and until
            now, there was no good answer.
          </p>
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" className="bg-paper py-24 px-6">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-navy text-center">
          Everything your school needs. Everything parents want.
        </h2>
        <p className="text-navy/60 text-lg text-center mt-4 max-w-xl mx-auto">
          One platform. Four problems solved.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mt-16">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-xl border border-navy/10 bg-white p-8 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200"
              >
                <div className="w-12 h-12 rounded-lg bg-amber/15 flex items-center justify-center mb-5">
                  <Icon size={24} strokeWidth={1.75} className="text-amber-dark" />
                </div>
                <h3 className="font-display text-xl font-semibold text-navy mb-2">
                  {feature.title}
                </h3>
                <p className="text-navy/60 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-navy py-24 px-6">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-white text-center">
          How it works for parents
        </h2>

        <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-0 max-w-4xl mx-auto mt-16 relative">
          <div className="hidden md:block absolute top-8 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-0.5 bg-amber/30" />

          {steps.map((step) => (
            <div key={step.number} className="flex flex-col items-center text-center md:flex-1">
              <div className="w-16 h-16 rounded-full bg-amber text-navy font-display font-bold text-2xl flex items-center justify-center relative z-10">
                {step.number}
              </div>
              <h3 className="font-display text-lg font-semibold text-white mt-6">
                {step.title}
              </h3>
              <p className="text-white/60 text-sm mt-2 max-w-[200px]">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* App download */}
      <section className="bg-paper py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-navy">
            Get the BusBuzz Parent App
          </h2>
          <p className="text-navy/60 text-lg mt-4">
            Available for iOS and Android. Free for parents whose school uses
            BusBuzz.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center mt-10">
            {/* TODO: Replace # with real App Store / Google Play URLs once apps are published */}
            <a
              href="#"
              className="w-48 h-14 rounded-xl bg-navy text-white flex items-center justify-center gap-3 text-base font-medium hover:bg-navy-light transition-colors"
            >
              <Smartphone size={22} />
              App Store
            </a>
            {/* TODO: Replace # with real App Store / Google Play URLs once apps are published */}
            <a
              href="#"
              className="w-48 h-14 rounded-xl bg-navy text-white flex items-center justify-center gap-3 text-base font-medium hover:bg-navy-light transition-colors"
            >
              <Play size={22} />
              Google Play
            </a>
          </div>

          {/* TODO: Generate real QR codes linking to App Store and Google Play URLs once apps are live */}
          <div className="mt-10">
            <div className="w-40 h-40 mx-auto rounded-2xl border-2 border-dashed border-navy/20 bg-white flex flex-col items-center justify-center gap-2">
              <QrCode size={48} className="text-navy/30" />
              <span className="text-xs text-navy/40">QR code</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-navy py-24 px-6">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-white text-center">
          Simple, transparent pricing for schools
        </h2>
        <p className="text-white/60 text-lg text-center mt-4">
          Everything included. No hidden fees. No setup costs.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto mt-16">
          {/* Monthly */}
          <div className="rounded-2xl p-8 text-center bg-white/5 border border-white/10">
            <p className="text-white/50 text-sm font-semibold uppercase tracking-wide">
              Monthly
            </p>
            <p className="board-figure text-4xl font-semibold text-white mt-4">
              ₦12,000
            </p>
            <p className="text-white/50 text-sm mt-1">per bus / month</p>

            <ul className="mt-8 space-y-3 text-left">
              {pricingFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <Check size={16} className="text-amber" />
                  <span className="text-white/80">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Per Term — highlighted */}
          <div className="rounded-2xl p-8 text-center bg-amber text-navy relative">
            <span className="absolute top-0 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-navy text-amber text-xs font-bold uppercase tracking-wider px-4 py-1.5 rounded-full">
              Most Popular
            </span>
            <p className="text-navy/60 text-sm font-semibold uppercase tracking-wide">
              Per Term
            </p>
            <p className="board-figure text-4xl font-semibold text-navy mt-4">
              ₦33,000
            </p>
            <p className="text-navy/60 text-sm mt-1">per bus / term</p>
            <p className="text-sm font-semibold text-route mt-2">
              Save ₦3,000 vs monthly
            </p>

            <ul className="mt-8 space-y-3 text-left">
              {pricingFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <Check size={16} className="text-navy" />
                  <span className="text-navy/70">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Annual */}
          <div className="rounded-2xl p-8 text-center bg-white/5 border border-white/10">
            <p className="text-white/50 text-sm font-semibold uppercase tracking-wide">
              Annual
            </p>
            <p className="board-figure text-4xl font-semibold text-white mt-4">
              ₦120,000
            </p>
            <p className="text-white/50 text-sm mt-1">per bus / year</p>
            <p className="text-sm font-semibold text-amber mt-2">
              2 months free — save ₦24,000
            </p>

            <ul className="mt-8 space-y-3 text-left">
              {pricingFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <Check size={16} className="text-amber" />
                  <span className="text-white/80">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="max-w-3xl mx-auto mt-12 space-y-3 text-center">
          <p className="text-white/60 text-sm">
            ₦20,000 refundable device deposit per bus, collected before
            installation. No setup fees.
          </p>
          <p className="text-white/40 text-xs">
            Most schools pass this cost to parents as part of existing bus
            fees — typically ₦2,000–₦3,000 per student per term.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bg-paper py-24 px-6">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-navy text-center">
          Frequently asked questions
        </h2>

        <div className="max-w-2xl mx-auto mt-16">
          <FaqAccordion items={faqItems} />
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-navy py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white">
            Ready to give your parents peace of mind?
          </h2>
          <p className="text-white/60 text-lg mt-4">
            Join Lagos schools already using BusBuzz to track every journey.
          </p>
          <a
            href="mailto:hello@busbuzz.com?subject=BusBuzz Demo Request"
            className="inline-flex items-center gap-2 bg-amber text-navy font-semibold px-10 py-4 rounded-lg text-lg hover:bg-amber-dark transition-colors mt-8"
          >
            Book a Free Demo
            <ArrowRight size={18} />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0a1420] py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-10">
            <div>
              <div className="flex items-center gap-2 font-display text-xl font-bold text-white">
                <Bus size={20} className="text-amber" />
                BusBuzz
              </div>
              <p className="text-white/40 text-sm mt-2">
                Every journey. Every child. Every day.
              </p>
              <p className="text-white/50 text-sm mt-4">
                <a href="mailto:hello@busbuzz.com">hello@busbuzz.com</a>
              </p>
              <p className="text-white/40 text-xs mt-1">Lagos, Nigeria</p>
            </div>

            <div className="flex gap-12">
              <div>
                <p className="text-white/30 text-xs uppercase tracking-wider mb-3">
                  Product
                </p>
                <a href="#how-it-works" className="text-white/60 text-sm hover:text-white block mt-2">
                  How it works
                </a>
                <a href="#pricing" className="text-white/60 text-sm hover:text-white block mt-2">
                  Pricing
                </a>
                <a href="#faq" className="text-white/60 text-sm hover:text-white block mt-2">
                  FAQ
                </a>
              </div>

              <div>
                <p className="text-white/30 text-xs uppercase tracking-wider mb-3">
                  Company
                </p>
                <Link href="/login" className="text-white/60 text-sm hover:text-white block mt-2">
                  School Admin Login
                </Link>
                {/* TODO: add real privacy policy page */}
                <a href="#" className="text-white/60 text-sm hover:text-white block mt-2">
                  Privacy Policy
                </a>
                {/* TODO: add real terms page */}
                <a href="#" className="text-white/60 text-sm hover:text-white block mt-2">
                  Terms
                </a>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 mt-12 pt-8">
            <p className="text-white/30 text-xs text-center">
              © {new Date().getFullYear()} BusBuzz. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
