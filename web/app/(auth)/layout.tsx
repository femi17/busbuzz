export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-night dot-grid flex flex-col items-center justify-center px-4">
      {/* danfo livery rail */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1.5 hazard-stripe" />
      {/* ambient amber wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[420px] w-[640px] rounded-full bg-amber/[0.07] blur-[110px]"
      />

      <div className="relative mb-8 text-center">
        <span className="font-mono font-semibold tracking-tight text-[26px] text-white">
          Bus<span className="text-amber">Buzz</span>
        </span>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35 mt-2">
          Route control · School admin
        </p>
      </div>

      <div className="relative w-full max-w-md">{children}</div>

      <div className="relative mt-8 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] text-white/30">
        <a href="/terms" className="hover:text-amber transition-colors duration-150">Terms</a>
        <span aria-hidden className="h-3 w-px bg-white/15" />
        <a href="/privacy" className="hover:text-amber transition-colors duration-150">Privacy</a>
        <span aria-hidden className="h-3 w-px bg-white/15" />
        <span className="text-white/25">Nigeria</span>
      </div>
    </div>
  );
}
