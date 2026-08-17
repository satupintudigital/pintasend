"use client";

import { motion, useReducedMotion } from "motion/react";

/* Reveal scroll-driven berbasis Motion — kurva & durasi sama dengan versi
   CSS lama (0.6s, cubic-bezier 0.16/1/0.3/1), delay tetap dalam ms.
   - useReducedMotion → konten langsung terlihat (tanpa animasi).
   - @media (scripting: none) di globals → konten terlihat tanpa JS
     (Motion menerapkan initial styles inline saat SSR). */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={`bk-motion-reveal min-w-0 ${className}`}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: delay / 1000 }}
    >
      {children}
    </motion.div>
  );
}
