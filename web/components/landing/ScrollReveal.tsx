'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

export function ScrollReveal({ children, className, delay }: ScrollRevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.6, delay: delay ?? 0, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
