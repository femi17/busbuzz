import type { Metadata } from 'next';
import { ArrowRight, Check } from 'lucide-react';
import { LandingNav } from '@/components/LandingNav';
import { FaqAccordion } from '@/components/FaqAccordion';
import { HeroVisual } from '@/components/landing/HeroVisual';
import { NotificationCards } from '@/components/landing/NotificationCards';
import { ScrollReveal } from '@/components/landing/ScrollReveal';

export const metadata: Metadata = {
  title: 'BusBuzz — Live School Bus Tracking for Private Schools',
  description:
    "Real-time GPS tracking for school buses across Nigeria. Parents see their child's bus live. Schools get a full admin dashboard. No hardware to buy — we handle everything.",
};

const pricingFeatures = [
  'Pre-configured tracking device',
  'SIM card + data plan',
  'Parent app (iOS & Android)',
  'School admin dashboard',
  'Real-time GPS tracking',
  'Boarding & arrival alerts',
  'WhatsApp & email support',
];

const proofStats = [
  { value: '10s', label: 'to open the app and see the bus on a live map' },
  { value: '3', label: 'alerts per trip — approaching, boarded, arrived' },
  { value: '0', label: '“where is the bus?” calls to your front office' },
];

const faqItems = [
  {
    question: 'Do we need to buy hardware?',
    answer: 'No. BusBuzz provides a pre-configured Android phone for each bus, included in your subscription. We handle setup, SIM data, and replacements. There is a refundable N20,000 device deposit per bus, collected before installation.',
  },
  {
    question: 'What does our driver need to do?',
    answer: 'The driver taps Start Trip when leaving, marks each student as they board, and taps End Trip on arrival. The phone is mounted on the dashboard and GPS tracking is completely automatic. No training needed -- most drivers are comfortable within one trip.',
  },
  {
    question: 'How do parents get access?',
    answer: "Parents download the free BusBuzz app from the App Store or Google Play. The school links each parent to their child's bus route through the admin dashboard. Parents receive an email invitation and can start tracking immediately.",
  },
  {
    question: 'We already have GPS trackers. Can we use those?',
    answer: 'BusBuzz is a fully managed solution -- our tracking device, our SIM, our software. Existing GPS trackers use different protocols and cannot integrate with the parent app. The advantage is that you have zero management overhead: we handle everything.',
  },
  {
    question: 'What if a device is lost or damaged?',
    answer: 'We replace it. The refundable device deposit covers loss or damage. We ship a replacement device pre-configured and ready to mount. Most replacements are delivered within 48 hours.',
  },
  {
    question: 'What is the minimum commitment?',
    answer: 'There is no lock-in. You can subscribe monthly, per term, or annually and cancel anytime. We collect the device back when the subscription ends. Most schools start with a monthly plan and switch to per-term once they see the value.',
  },
];

function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-mono font-semibold tracking-tight ${className}`}>
      Bus<span className="text-amber">Buzz</span>
    </span>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-night">
      <LandingNav />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-night px-6 pt-32 pb-24 lg:pt-40 lg:pb-32">
        {/* ambient danfo wash */}
        <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-amber/10 blur-[120px] pointer-events-none" />
        <div className="absolute top-1/3 right-0 h-[400px] w-[400px] rounded-full bg-navy/40 blur-[120px] pointer-events-none" />

        <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-14 lg:gap-10 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-[var(--radius-chip)] bg-white/[0.06] border border-white/10 pl-2.5 pr-4 py-1.5 mb-7">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber opacity-70" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber" />
              </span>
              <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-white/70">
                LIVE · NIGERIA
              </span>
            </div>

            <h1 className="font-heading font-extrabold text-white text-[46px] sm:text-[58px] lg:text-[68px] leading-[0.95]">
              Know where the
              <br />
              school bus is.
              <span className="block font-display italic font-normal text-amber mt-1 tracking-normal">
                Right now.
              </span>
            </h1>

            <p className="mt-7 text-[18px] sm:text-[19px] text-white/55 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Live GPS for your child&apos;s school bus — with an alert before it arrives,
              when they board, and when they&apos;re safely at school. Your school manages
              nothing; we handle the device, the SIM, and the app.
            </p>

            {/* departure-board micro-ticker */}
            <div className="mt-7 inline-flex items-center gap-3 rounded-full border border-white/10 bg-black/30 px-4 py-2 font-mono text-[11px] tracking-[0.12em] text-white/50">
              <span className="text-amber">NEXT STOP</span>
              <span className="text-white/70">GREENFIELD ESTATE</span>
              <span className="h-3 w-px bg-white/15" />
              <span className="text-amber">ETA</span>
              <span className="board-figure text-white/80">04:00</span>
            </div>

            <div className="mt-9 flex flex-col sm:flex-row justify-center lg:justify-start gap-3.5">
              <a
                href="mailto:hello@busbuzz.com.ng?subject=School Demo Request"
                className="group inline-flex items-center justify-center gap-2 bg-amber text-night rounded-[var(--radius-btn)] px-7 py-3.5 text-base font-bold hover:brightness-105 active:scale-[0.98] transition-all duration-150 shadow-[0_16px_36px_-12px_rgba(255,201,0,0.6)]"
              >
                Book a school demo
                <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform duration-150" />
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center bg-white/[0.05] border border-white/12 text-white rounded-[var(--radius-btn)] px-7 py-3.5 text-base font-medium hover:bg-white/[0.09] transition-colors duration-150"
              >
                See how it works
              </a>
            </div>

            {/* trust stats — departure-board numerals */}
            <div className="mt-14 flex justify-center lg:justify-start items-stretch">
              {[
                { value: '12+', label: 'Schools' },
                { value: '47', label: 'Buses live' },
                { value: '800+', label: 'Parents' },
              ].map((stat, i) => (
                <div key={stat.label} className="flex items-stretch">
                  {i > 0 && <div className="w-px bg-white/10 mx-6 sm:mx-8" />}
                  <div className="text-center lg:text-left">
                    <p className="board-figure text-[30px] font-semibold text-white leading-none">{stat.value}</p>
                    <p className="text-[12px] text-white/40 mt-1.5 uppercase tracking-wider">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <HeroVisual />
        </div>
      </section>

      {/* ── The silence (emotional pivot) ────────────────────── */}
      <section className="relative bg-canvas py-32 md:py-44 px-6 overflow-hidden">
        <svg className="absolute inset-0 w-full h-full opacity-[0.5] pointer-events-none" preserveAspectRatio="none" viewBox="0 0 1200 400">
          <path d="M -50 300 C 200 300, 250 120, 500 120 C 750 120, 800 320, 1050 320 C 1200 320, 1250 180, 1300 180" fill="none" stroke="var(--color-rule)" strokeWidth={2} strokeDasharray="2 12" strokeLinecap="round" />
        </svg>
        <ScrollReveal className="relative max-w-2xl mx-auto text-center">
          <p className="text-[17px] text-sub">Every school morning, a child gets on a bus.</p>
          <p className="font-display italic text-[52px] md:text-[76px] text-ink leading-[1.02] mt-4">
            45 minutes of silence.
          </p>
          <p className="text-[17px] text-sub mt-6">No map. No message. No way to know.</p>
        </ScrollReveal>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section id="how-it-works" className="bg-canvas pb-28 px-6">
        <ScrollReveal className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2.5 mb-5">
            <span className="h-3 w-8 hazard-stripe rounded-full" />
            <p className="font-mono text-[11px] font-semibold text-amber-dark uppercase tracking-[0.18em]">How it works</p>
          </div>
          <h2 className="font-heading font-bold text-ink text-[34px] md:text-[46px] leading-[1.05]">
            One system. Three people. <span className="text-sub">Nobody trained.</span>
          </h2>
        </ScrollReveal>

        <div className="max-w-5xl mx-auto space-y-4">
          <ScrollReveal>
            <div className="group bg-surface border border-rule/70 shadow-[var(--shadow-card)] rounded-[24px] p-8 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 transition-all duration-200">
              <div>
                <p className="font-mono text-[11px] font-semibold text-amber-dark uppercase tracking-[0.16em] mb-4">For parents</p>
                <h3 className="font-heading font-bold text-[30px] md:text-[34px] text-ink leading-[1.05]">The bus is two minutes away.</h3>
                <p className="text-[16px] text-sub leading-relaxed mt-4 max-w-sm">
                  An alert lands before the bus reaches your stop, the moment your child boards,
                  and when they arrive at school. You never have to call anyone.
                </p>
              </div>
              <div className="flex justify-center"><NotificationCards /></div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.08}>
            <div className="group bg-surface border border-rule/70 shadow-[var(--shadow-card)] rounded-[24px] p-8 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex justify-center order-last md:order-first">
                <div className="w-full max-w-[300px] rounded-[20px] bg-night p-5 shadow-[var(--shadow-float)] border border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <Wordmark className="text-[14px] text-white" />
                    <span className="font-mono text-[10px] text-white/40">3 routes live</span>
                  </div>
                  {[
                    { name: 'Greenfield Morning', val: 'On route', live: true },
                    { name: 'Sunrise Afternoon', val: 'Boarding', live: true },
                    { name: 'Central Express', val: 'Idle', live: false },
                  ].map((r) => (
                    <div key={r.name} className="flex items-center justify-between rounded-xl bg-white/[0.05] px-3 py-2.5 mb-2 last:mb-0">
                      <div className="flex items-center gap-2.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${r.live ? 'bg-amber' : 'bg-white/25'}`} />
                        <span className="text-[13px] text-white/80">{r.name}</span>
                      </div>
                      <span className={`font-mono text-[11px] ${r.live ? 'text-amber' : 'text-white/35'}`}>{r.val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-mono text-[11px] font-semibold text-amber-dark uppercase tracking-[0.16em] mb-4">For schools</p>
                <h3 className="font-heading font-bold text-[30px] md:text-[34px] text-ink leading-[1.05]">Zero work for your team.</h3>
                <p className="text-[16px] text-sub leading-relaxed mt-4 max-w-sm">
                  We install the device, manage the SIM, and run the app. One dashboard shows every
                  bus, route, and student. All your school does is tell us which routes you run.
                </p>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.16}>
            <div className="group bg-surface border border-rule/70 shadow-[var(--shadow-card)] rounded-[24px] p-8 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 transition-all duration-200">
              <div>
                <p className="font-mono text-[11px] font-semibold text-amber-dark uppercase tracking-[0.16em] mb-4">For drivers</p>
                <h3 className="font-heading font-bold text-[30px] md:text-[34px] text-ink leading-[1.05]">One tap to start.</h3>
                <p className="text-[16px] text-sub leading-relaxed mt-4 max-w-sm">
                  The phone is mounted on the dashboard. The driver taps Start Trip, marks each
                  child boarding, and taps End Trip. GPS broadcasts the whole way, automatically.
                </p>
              </div>
              <div className="flex justify-center">
                <div className="w-full max-w-[220px] rounded-[28px] bg-night p-4 shadow-[var(--shadow-float)] border border-white/10">
                  <div className="h-1.5 w-10 mx-auto rounded-full bg-white/15 mb-4" />
                  <p className="font-mono text-[11px] text-white/50 text-center tracking-wide mb-4">MORNING SCHOOL RUN</p>
                  <div className="w-full bg-amber rounded-[16px] py-4 text-[16px] font-bold text-night text-center shadow-[0_10px_24px_-10px_rgba(255,201,0,0.7)]">
                    Start Trip
                  </div>
                  <p className="font-mono text-[10px] text-white/30 text-center mt-3">8 students · First stop → School</p>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ── Proof ────────────────────────────────────────────── */}
      <section className="relative bg-night py-24 md:py-28 px-6 overflow-hidden">
        <div className="h-1.5 hazard-stripe absolute top-0 left-0 right-0" />
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 h-[400px] w-[700px] rounded-full bg-amber/[0.06] blur-[120px] pointer-events-none" />
        <ScrollReveal className="relative max-w-5xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-4">
            {proofStats.map((stat, i) => (
              <div key={stat.label} className="text-center flex flex-col items-center px-4 relative">
                {i > 0 && <div className="hidden sm:block absolute left-0 top-2 bottom-2 w-px bg-white/10" />}
                <p className="board-figure text-[56px] md:text-[64px] text-amber leading-none">{stat.value}</p>
                <p className="text-[14px] text-white/50 mt-3 max-w-[190px] leading-snug">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 max-w-2xl mx-auto rounded-[24px] border border-white/10 bg-white/[0.04] p-8 md:p-10 text-center">
            <p className="font-display italic text-[22px] md:text-[26px] text-white/85 leading-relaxed">
              &ldquo;Since BusBuzz, we haven&apos;t had a single &lsquo;where is the bus&rsquo; call.
              Parents bring it up when they&apos;re enrolling.&rdquo;
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <span className="flex items-center justify-center w-9 h-9 rounded-full bg-amber text-night text-[13px] font-bold">A</span>
              <div className="text-left">
                <p className="text-[13px] font-semibold text-white">School Proprietor</p>
                <p className="text-[12px] text-white/40">Verified partner · Pilot school</p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" className="bg-canvas py-28 px-6">
        <ScrollReveal className="text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2.5 mb-5">
            <span className="h-3 w-8 hazard-stripe rounded-full" />
            <p className="font-mono text-[11px] font-semibold text-amber-dark uppercase tracking-[0.18em]">Pricing</p>
          </div>
          <h2 className="font-heading font-bold text-ink text-[34px] md:text-[48px] leading-[1.05]">One fee. Everything included.</h2>
          <p className="text-[17px] text-sub mt-3">Device, SIM, both apps, and support — in a single per-bus price.</p>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto mt-14 items-start">
          {/* Monthly */}
          <ScrollReveal>
            <div className="bg-surface border border-rule/70 shadow-[var(--shadow-card)] rounded-[24px] p-8 hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 transition-all duration-200">
              <p className="font-mono text-[11px] font-semibold text-sub uppercase tracking-[0.16em]">Monthly</p>
              <p className="board-figure text-[46px] text-ink mt-3 leading-none">₦12,000</p>
              <p className="text-[14px] text-sub mt-1.5">per bus · per month</p>
              <hr className="border-rule my-6" />
              <ul className="flex flex-col gap-2.5">
                {pricingFeatures.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check size={16} className="text-amber-dark shrink-0 mt-0.5" strokeWidth={2.5} />
                    <span className="text-[14px] text-sub">{f}</span>
                  </li>
                ))}
              </ul>
              <a href="mailto:hello@busbuzz.com.ng?subject=Monthly Plan" className="mt-8 block w-full border border-rule text-ink rounded-[var(--radius-btn)] py-3 text-sm font-semibold text-center hover:bg-canvas transition-colors duration-150">
                Get started
              </a>
            </div>
          </ScrollReveal>

          {/* Per term — the danfo ticket */}
          <ScrollReveal delay={0.1}>
            <div className="relative bg-night rounded-[24px] p-8 shadow-[0_30px_70px_-24px_rgba(0,0,0,0.6)] md:-mt-4">
              <div className="h-1.5 hazard-stripe absolute top-0 left-6 right-6 rounded-b-full" />
              <div className="flex items-center justify-between">
                <p className="font-mono text-[11px] font-semibold text-white/40 uppercase tracking-[0.16em]">Per term</p>
                <span className="inline-flex bg-amber text-night rounded-[var(--radius-chip)] px-3 py-1 text-[11px] font-bold">Most popular</span>
              </div>
              <p className="board-figure text-[46px] text-white mt-3 leading-none">₦33,000</p>
              <p className="text-[14px] text-white/40 mt-1.5">per bus · per term</p>
              <span className="inline-flex mt-3 bg-white/10 text-white/70 rounded-[var(--radius-chip)] px-3 py-1 text-[12px] font-medium">Save ₦3,000 vs monthly</span>
              <hr className="border-white/10 my-6" />
              <ul className="flex flex-col gap-2.5">
                {pricingFeatures.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check size={16} className="text-amber shrink-0 mt-0.5" strokeWidth={2.5} />
                    <span className="text-[14px] text-white/70">{f}</span>
                  </li>
                ))}
              </ul>
              <a href="mailto:hello@busbuzz.com.ng?subject=Per Term Plan" className="mt-8 block w-full bg-amber text-night rounded-[var(--radius-btn)] py-3 text-sm font-bold text-center hover:brightness-105 active:scale-[0.98] transition-all duration-150">
                Get started
              </a>
            </div>
          </ScrollReveal>

          {/* Annual */}
          <ScrollReveal delay={0.2}>
            <div className="bg-surface border border-rule/70 shadow-[var(--shadow-card)] rounded-[24px] p-8 hover:shadow-[var(--shadow-float)] hover:-translate-y-0.5 transition-all duration-200">
              <p className="font-mono text-[11px] font-semibold text-sub uppercase tracking-[0.16em]">Annual</p>
              <p className="board-figure text-[46px] text-ink mt-3 leading-none">₦120,000</p>
              <p className="text-[14px] text-sub mt-1.5">per bus · per year</p>
              <span className="inline-flex mt-3 bg-green-bg text-green rounded-[var(--radius-chip)] px-3 py-1 text-[12px] font-semibold">2 months free</span>
              <hr className="border-rule my-6" />
              <ul className="flex flex-col gap-2.5">
                {pricingFeatures.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check size={16} className="text-amber-dark shrink-0 mt-0.5" strokeWidth={2.5} />
                    <span className="text-[14px] text-sub">{f}</span>
                  </li>
                ))}
              </ul>
              <a href="mailto:hello@busbuzz.com.ng?subject=Annual Plan" className="mt-8 block w-full border border-rule text-ink rounded-[var(--radius-btn)] py-3 text-sm font-semibold text-center hover:bg-canvas transition-colors duration-150">
                Get started
              </a>
            </div>
          </ScrollReveal>
        </div>

        <p className="font-mono text-[12px] text-sub text-center mt-10 tracking-wide">
          ₦20,000 refundable device deposit · No setup fees · Cancel anytime
        </p>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section id="faq" className="bg-canvas pb-28 px-6">
        <ScrollReveal className="text-center mb-12">
          <h2 className="font-heading font-bold text-ink text-[34px] md:text-[46px]">Common questions.</h2>
        </ScrollReveal>
        <div className="max-w-2xl mx-auto">
          <FaqAccordion items={faqItems} />
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <section className="relative bg-night py-32 md:py-40 px-6 text-center overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] rounded-full bg-amber/[0.07] blur-[120px] pointer-events-none" />
        <ScrollReveal className="relative">
          <h2 className="font-heading font-extrabold text-white text-[42px] md:text-[64px] leading-[1.02]">
            Give every parent
            <span className="block font-display italic font-normal text-amber mt-1">peace of mind.</span>
          </h2>
          <p className="mt-6 text-[18px] text-white/50 max-w-md mx-auto">
            We set up everything. You just tell us which routes you run.
          </p>
          <a
            href="mailto:hello@busbuzz.com.ng?subject=BusBuzz Demo Request"
            className="inline-flex items-center gap-2 mt-10 bg-amber text-night rounded-[var(--radius-btn)] px-9 py-4 text-lg font-bold hover:brightness-105 active:scale-[0.98] transition-all duration-150 shadow-[0_20px_50px_-16px_rgba(255,201,0,0.6)]"
          >
            Book a free demo
            <ArrowRight size={19} />
          </a>
          <p className="mt-5 font-mono text-[12px] text-white/30 tracking-wide">hello@busbuzz.com.ng · Nigeria</p>
        </ScrollReveal>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="bg-stripe border-t border-white/[0.06] pt-14 pb-10 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2">
            <Wordmark className="text-[20px] text-white" />
            <p className="text-[14px] text-white/40 mt-3 max-w-xs leading-relaxed">
              Live school-bus tracking for parents and schools across Nigeria. We handle the hardware,
              the SIM, and the software.
            </p>
            <a href="mailto:hello@busbuzz.com.ng" className="inline-block text-[14px] text-white/60 mt-4 hover:text-amber transition-colors duration-150">hello@busbuzz.com.ng</a>
            <p className="text-[12px] text-white/35 mt-1">Nigeria</p>
          </div>

          <div>
            <p className="font-mono text-[11px] font-semibold text-white/30 uppercase tracking-[0.16em] mb-4">Product</p>
            <ul className="flex flex-col gap-3">
              {[{ href: '#how-it-works', label: 'How it works' }, { href: '#pricing', label: 'Pricing' }, { href: '#faq', label: 'FAQ' }, { href: '/dashboard', label: 'School login' }].map((l) => (
                <li key={l.label}><a href={l.href} className="text-[14px] text-white/55 hover:text-white transition-colors duration-150">{l.label}</a></li>
              ))}
            </ul>
          </div>

          <div>
            <p className="font-mono text-[11px] font-semibold text-white/30 uppercase tracking-[0.16em] mb-4">Company</p>
            <ul className="flex flex-col gap-3">
              {[{ href: 'mailto:hello@busbuzz.com.ng', label: 'Contact' }, { href: '/terms', label: 'Terms & Conditions' }, { href: '/privacy', label: 'Privacy policy' }].map((l) => (
                <li key={l.label}><a href={l.href} className="text-[14px] text-white/55 hover:text-white transition-colors duration-150">{l.label}</a></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="max-w-6xl mx-auto mt-12 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[12px] text-white/30">© {new Date().getFullYear()} BusBuzz. All rights reserved.</p>
          <div className="h-2 w-24 hazard-stripe rounded-full opacity-70" />
        </div>
      </footer>
    </div>
  );
}
