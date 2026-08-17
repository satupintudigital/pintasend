"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

function formatId(value: number, decimals: number): string {
  return value.toLocaleString("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Count-up angka saat elemen masuk viewport.
 * - rAF loop tanpa alokasi objek; tulis langsung ke textContent.
 * - Nilai akhir dirender saat SSR (tanpa-JS tetap benar); di-reset ke 0
 *   sebelum paint (useLayoutEffect) agar tidak ada flash.
 * - Menghormati prefers-reduced-motion: langsung ke nilai akhir.
 */
export function CountUp({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1.4,
  className = "",
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useLayoutEffect(() => {
    if (ref.current) ref.current.textContent = prefix + formatId(0, decimals) + suffix;
  }, [prefix, suffix, decimals]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = prefix + formatId(to, decimals) + suffix;
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !started.current) {
            started.current = true;
            io.disconnect();
            const t0 = performance.now();
            const step = (now: number) => {
              const p = Math.min((now - t0) / (duration * 1000), 1);
              const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
              el.textContent = prefix + formatId(to * eased, decimals) + suffix;
              if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, decimals, prefix, suffix, duration]);

  // Tanpa aria-label: teks terlihat sudah menjadi nilai akhir (screen reader
  // membaca textContent; aria-label terlarang pada span tanpa role).
  return (
    <span ref={ref} className={className}>
      {prefix + formatId(to, decimals) + suffix}
    </span>
  );
}
