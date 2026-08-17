"use client";

import { useEffect, useRef } from "react";

/**
 * Tilt 3D mengikuti kursor (transform-only, GPU friendly).
 * - getBoundingClientRect di-cache per pointer-enter (kartu tidak bergerak
 *   saat hover berlangsung) agar handler pointer-move ringan.
 * - Saat keluar: reset dengan spring overshoot.
 * - Menghormati prefers-reduced-motion.
 */
export function Tilt({
  children,
  className = "",
  max = 4,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const rect = useRef<DOMRect | null>(null);
  const reduce = useRef(false);

  useEffect(() => {
    // Tilt hanya untuk perangkat dengan hover (mouse/trackpad) — di layar
    // sentuh, pointermove ikut terbakar saat scroll → berpotensi jank.
    reduce.current =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !window.matchMedia("(hover: hover)").matches;
  }, []);

  function onEnter() {
    const el = ref.current;
    if (!el || reduce.current) return;
    rect.current = el.getBoundingClientRect();
  }

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || reduce.current) return;
    if (!rect.current) rect.current = el.getBoundingClientRect();
    const r = rect.current;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    const rx = -py * max * 2;
    const ry = px * max * 2;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    });
  }

  function onLeave() {
    const el = ref.current;
    if (!el || reduce.current) return;
    if (raf.current) cancelAnimationFrame(raf.current);
    el.style.transition = "transform 0.6s var(--ease-spring)";
    el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
    window.setTimeout(() => {
      el.style.transition = "";
    }, 650);
    rect.current = null;
  }

  return (
    <div
      ref={ref}
      onPointerEnter={onEnter}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={className}
      style={{ transformStyle: "preserve-3d", willChange: "transform" }}
    >
      {children}
    </div>
  );
}
