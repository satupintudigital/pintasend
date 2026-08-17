"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, List, X } from "@phosphor-icons/react";

const links = [
  { href: "#fitur", label: "Fitur" },
  { href: "#cara-kerja", label: "Cara Kerja" },
  { href: "#api", label: "API" },
  { href: "#harga", label: "Harga" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 16);
      let current = "";
      for (const l of links) {
        const el = document.querySelector(l.href);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.top <= 140) current = l.href;
        }
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "border-b border-line-soft bg-ink/85 backdrop-blur-xl"
          : "border-b border-transparent bg-ink/40 backdrop-blur-md"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
        <Link href="/" className="group flex items-center gap-2.5 font-display font-semibold tracking-tight text-fg">
          <span className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-accent text-sm font-bold text-accent-ink transition-shadow group-hover:shadow-[0_0_24px_-4px_rgba(52,211,153,0.7)]">
            W
          </span>
          wavio
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const isActive = active === l.href;
            return (
              <a
                key={l.href}
                href={l.href}
                aria-current={isActive ? "true" : undefined}
                className={`relative rounded-full px-4 py-2 text-sm transition-colors ${
                  isActive ? "text-fg" : "text-fg-muted hover:text-fg"
                }`}
              >
                {l.label}
                {isActive && (
                  <span className="absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-accent to-transparent" />
                )}
              </a>
            );
          })}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <a
            href="#api"
            className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm text-fg-muted transition-colors hover:text-fg"
          >
            Dokumentasi
            <ArrowUpRight size={14} />
          </a>
          <a
            href="#harga"
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink shadow-[0_0_24px_-8px_rgba(16,185,129,0.8)] transition-all hover:bg-accent-bright hover:shadow-[0_0_32px_-6px_rgba(52,211,153,0.7)] active:scale-[0.97]"
          >
            Mulai Sekarang
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-fg transition-colors hover:bg-surface-2 md:hidden"
          aria-label={open ? "Tutup menu" : "Buka menu"}
          aria-expanded={open}
        >
          {open ? <X size={20} /> : <List size={20} />}
        </button>
      </nav>

      {/* Mobile menu — smooth grid-rows expand */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out md:hidden ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line-soft bg-ink/95 px-5 py-4">
            <div className="flex flex-col gap-1">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    active === l.href
                      ? "bg-surface-2 text-fg"
                      : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                  }`}
                >
                  {l.label}
                </a>
              ))}
              <a
                href="#harga"
                onClick={() => setOpen(false)}
                className="mt-2 rounded-full bg-accent px-4 py-2.5 text-center text-sm font-semibold text-accent-ink"
              >
                Mulai Sekarang
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
