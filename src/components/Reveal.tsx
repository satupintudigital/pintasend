"use client";

import { useEffect, useRef } from "react";

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("bk-in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // min-w-0: item grid tidak boleh melebar karena konten (mis. <pre>) —
  // cegah overflow horizontal pada viewport kecil.
  return (
    <div ref={ref} className={`bk-reveal min-w-0 ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
