'use client';

import { motion } from 'framer-motion';

const ROUTE_PATH =
  'M 70 470 C 90 400, 170 410, 205 350 C 240 290, 315 285, 345 225 C 368 178, 388 150, 410 110';

const STOPS = [
  { x: 70, y: 470, label: 'Chevron', anchor: 'start' as const, dx: 14, dy: 4 },
  { x: 205, y: 350, label: 'Falomo', anchor: 'start' as const, dx: 14, dy: 4 },
  { x: 345, y: 225, label: 'Lekki Ph. 1', anchor: 'end' as const, dx: -14, dy: 4 },
];

const BOARD = [
  { stop: 'Lekki Phase 1', eta: '4 min', live: true },
  { stop: 'Admiralty Way', eta: '11 min', live: false },
  { stop: 'Greenfield School', eta: '18 min', live: false },
];

export function HeroVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full"
    >
      {/* ambient danfo glow */}
      <div className="absolute -inset-10 -z-10 rounded-full bg-amber/15 blur-[80px] animate-drift pointer-events-none" />

      <div className="relative rounded-[26px] bg-night-2 border border-white/10 overflow-hidden shadow-[0_40px_100px_-30px_rgba(0,0,0,0.8)]">
        {/* danfo livery rail */}
        <div className="h-1.5 hazard-stripe" />

        {/* board header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber opacity-70" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber" />
            </span>
            <span className="font-mono text-[12px] font-semibold tracking-[0.15em] text-white/80">
              IKOYI MORNING RUN
            </span>
          </div>
          <span className="board-figure text-[13px] text-white/50">07:41</span>
        </div>

        {/* live map */}
        <div className="relative h-[300px] sm:h-[360px] dot-grid bg-navy">
          <svg viewBox="0 0 480 540" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
            <defs>
              <linearGradient id="routeGrad" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(255,201,0,0.15)" />
                <stop offset="100%" stopColor="rgba(255,201,0,0.6)" />
              </linearGradient>
            </defs>

            {/* travelled trail (glowing) + full route (dotted) */}
            <path d={ROUTE_PATH} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={3} strokeLinecap="round" strokeDasharray="1 11" />
            <path d={ROUTE_PATH} fill="none" stroke="url(#routeGrad)" strokeWidth={3.5} strokeLinecap="round" strokeDasharray="600" strokeDashoffset="300" />

            {STOPS.map((stop) => (
              <g key={stop.label}>
                <circle cx={stop.x} cy={stop.y} r={5.5} className="fill-navy" stroke="rgba(255,255,255,0.55)" strokeWidth={2} />
                <text
                  x={stop.x + stop.dx}
                  y={stop.y + stop.dy}
                  textAnchor={stop.anchor}
                  className="fill-white/55 font-mono"
                  style={{ fontSize: 12, letterSpacing: '0.03em' }}
                >
                  {stop.label}
                </text>
              </g>
            ))}

            {/* the danfo, moving along the route */}
            <g>
              <animateMotion dur="10s" repeatCount="indefinite" rotate="auto" path={ROUTE_PATH} />
              <circle r={22} className="fill-amber" opacity={0.18} />
              <circle r={13} className="fill-amber" opacity={0.28} />
              <rect x={-15} y={-9} width={30} height={18} rx={5} className="fill-amber" />
              <rect x={-15} y={-9} width={30} height={4.5} rx={2} className="fill-stripe" />
              <circle cx={-9} cy={9} r={3.2} className="fill-stripe" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
              <circle cx={9} cy={9} r={3.2} className="fill-stripe" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
            </g>
          </svg>

          {/* floating arrival toast — the app's real moment */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 1.1 }}
            className="absolute bottom-4 left-4 flex items-center gap-3 rounded-2xl bg-white/[0.08] backdrop-blur-md border border-white/12 pl-2.5 pr-4 py-2.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-green text-white text-[15px] font-bold">C</span>
            <div className="leading-tight">
              <p className="text-[13px] font-semibold text-white">Chidi has boarded</p>
              <p className="text-[11px] text-white/50">Chevron Estate · 07:38</p>
            </div>
          </motion.div>
        </div>

        {/* departure board */}
        <div className="px-5 py-4 border-t border-white/[0.07] bg-black/20">
          <div className="flex items-end justify-between">
            <div>
              <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-white/40">NEXT STOP</p>
              <p className="text-[17px] font-bold text-white mt-0.5">Lekki Phase 1</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-white/40">ARRIVES IN</p>
              <p className="board-figure text-[22px] font-semibold text-amber leading-none mt-1">04:00</p>
            </div>
          </div>

          <div className="mt-4 border-t border-white/[0.06] pt-3 space-y-2.5">
            {BOARD.map((row) => (
              <div key={row.stop} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${row.live ? 'bg-amber' : 'bg-white/25'}`} />
                  <span className={`text-[13px] ${row.live ? 'text-white font-medium' : 'text-white/45'}`}>{row.stop}</span>
                </div>
                <span className={`board-figure text-[13px] ${row.live ? 'text-amber' : 'text-white/40'}`}>{row.eta}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
