export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-navy flex flex-col items-center justify-center px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-[repeating-linear-gradient(90deg,var(--color-amber)_0,var(--color-amber)_28px,transparent_28px,transparent_42px)]"
      />
      <div className="mb-10 flex items-baseline gap-2">
        <span className="font-display text-3xl font-bold tracking-tight text-white">
          Bus<span className="text-amber">Buzz</span>
        </span>
      </div>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 board-figure text-xs uppercase text-white/30">
        Route Control · Lagos
      </p>
    </div>
  );
}
