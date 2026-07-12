import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-mono font-semibold tracking-tight ${className}`}>
      Bus<span className="text-amber">Buzz</span>
    </span>
  );
}

export function LegalShell({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="bg-night">
        <div aria-hidden className="h-1.5 hazard-stripe" />
        <div className="max-w-3xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" aria-label="BusBuzz home">
            <Wordmark className="text-[18px] text-white" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-white/50 hover:text-amber transition-colors duration-150"
          >
            <ArrowLeft size={13} strokeWidth={2} />
            Back to home
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6 py-14 md:py-20">
        <article className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2.5 mb-5">
            <span aria-hidden className="h-3 w-8 hazard-stripe rounded-full" />
            <p className="font-mono text-[11px] font-semibold text-amber-dark uppercase tracking-[0.18em]">BusBuzz</p>
          </div>
          <h1 className="font-heading font-bold text-ink text-[34px] md:text-[44px] tracking-tight leading-[1.05]">
            {title}
          </h1>
          <p className="board-figure text-[12px] text-sub mt-4 uppercase tracking-wide">Last updated: {updated}</p>
          <p className="text-[16px] leading-relaxed text-sub mt-6 max-w-2xl">{intro}</p>

          <div className="mt-12 flex flex-col gap-10">{children}</div>
        </article>
      </main>

      <footer className="bg-stripe border-t border-white/[0.06] px-6 py-8">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[12px] text-white/30">© {new Date().getFullYear()} BusBuzz. All rights reserved.</p>
          <a href="mailto:hello@busbuzz.com.ng" className="font-mono text-[12px] text-white/40 hover:text-amber transition-colors duration-150">
            hello@busbuzz.com.ng
          </a>
        </div>
      </footer>
    </div>
  );
}

export function Section({ n, heading, children }: { n: number; heading: string; children: ReactNode }) {
  return (
    <section className="scroll-mt-24">
      <h2 className="font-heading font-bold text-ink text-[20px] md:text-[23px] tracking-tight flex items-baseline gap-3">
        <span className="board-figure text-[15px] text-amber-dark shrink-0">{String(n).padStart(2, '0')}</span>
        {heading}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed text-sub pl-0 md:pl-9">{children}</div>
    </section>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Mail() {
  return (
    <a href="mailto:hello@busbuzz.com.ng" className="font-medium text-ink underline decoration-amber/50 underline-offset-2 hover:text-amber-dark">
      hello@busbuzz.com.ng
    </a>
  );
}
