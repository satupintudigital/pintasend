"use client";

import { useEffect, useRef } from "react";

/* Parallax halus untuk lapisan ambient (grid + glow).
   Setiap child dengan atribut `data-parallax="0.15"` bergerak pada faktor
   berbeda mengikuti scroll. Transform-only (translate3d) + throttle rAF —
   tanpa reflow. Otomatis nonaktif pada prefers-reduced-motion. */
export function AmbientParallax({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const layers = Array.from(
      el.querySelectorAll<HTMLElement>("[data-parallax]"),
    );

    let raf = 0;
    let y = window.scrollY;

    const update = () => {
      for (const layer of layers) {
        const factor = parseFloat(layer.dataset.parallax ?? "0");
        layer.style.transform = `translate3d(0, ${(-y * factor).toFixed(1)}px, 0)`;
      }
    };

    const onScroll = () => {
      y = window.scrollY;
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 z-0 overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}
