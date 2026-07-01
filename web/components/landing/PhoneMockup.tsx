'use client';

import { motion } from 'framer-motion';

export function PhoneMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.3 }}
      className="w-64 h-[480px] mx-auto mt-12 rounded-[2.5rem] border-4 border-white/20 bg-navy-light p-3 shadow-2xl"
    >
      <div className="rounded-[2rem] bg-[#1a2c47] h-full w-full overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 flex items-center justify-center pt-4">
          <span className="text-xs text-white/50 font-display">BusBuzz</span>
        </div>

        <svg
          viewBox="0 0 256 480"
          className="absolute inset-0 h-full w-full"
          fill="none"
        >
          <path
            d="M 20 100 Q 100 140 80 220 T 160 340"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M 200 80 Q 140 180 200 260 T 100 420"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M 40 200 Q 130 220 220 200"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="2"
            fill="none"
          />

          <circle cx="80" cy="220" r="3" fill="rgba(255,255,255,0.3)" />
          <circle cx="160" cy="340" r="3" fill="rgba(255,255,255,0.3)" />
          <circle cx="200" cy="260" r="3" fill="rgba(255,255,255,0.3)" />
        </svg>

        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute"
          style={{ left: '80px', top: '220px' }}
        >
          <div className="w-4 h-4 rounded-full bg-amber shadow-[0_0_12px_rgba(255,201,0,0.5)]" />
        </motion.div>
      </div>
    </motion.div>
  );
}
