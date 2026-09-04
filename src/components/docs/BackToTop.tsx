"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "@phosphor-icons/react";

/* Tombol kembali ke atas — muncul setelah scroll melewati ambang,
   transform/opacity saja (tanpa reflow), tersembunyi di bawah ambang. */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Kembali ke atas"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-2/90 text-fg-muted shadow-[0_16px_40px_-16px_rgba(15,23,42,0.25)] backdrop-blur transition-all duration-300 hover:border-accent/50 hover:text-fg active:scale-95 ${
        show
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <ArrowUp size={16} weight="bold" />
    </button>
  );
}
