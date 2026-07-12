'use client';

import { useEffect, useRef, useState } from 'react';

type CountUpProps = {
  value: number;
  duration?: number;
  className?: string;
  formatFn?: (n: number) => string;
};

export function CountUp({
  value,
  duration = 800,
  className,
  formatFn,
}: CountUpProps) {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    const startTime = performance.now();
    const startValue = 0;

    function step(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOut quad
      const eased = 1 - Math.pow(1 - progress, 2);
      const next = Math.round(startValue + (value - startValue) * eased);
      setCurrent(next);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [value, duration]);

  const display = formatFn ? formatFn(current) : String(current);

  return <span className={className}>{display}</span>;
}
