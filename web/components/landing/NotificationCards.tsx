'use client';

import { motion } from 'framer-motion';

const notifications = [
  'Bus 2 min away — Ojuelegba Jct',
  'Chidi boarded — 7:42 AM',
  'Arrived at school — 8:14 AM',
];

export function NotificationCards() {
  return (
    <div className="bg-ink rounded-[32px] p-3 shadow-[var(--shadow-float)] max-w-[200px]">
      {notifications.map((text, i) => (
        <motion.div
          key={text}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: i * 0.3, ease: 'easeOut' }}
          className="bg-white rounded-xl p-3 mb-2 last:mb-0"
        >
          <p className="text-[12px] font-medium text-ink leading-snug">{text}</p>
        </motion.div>
      ))}
    </div>
  );
}
