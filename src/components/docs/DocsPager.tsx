"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";

const pages = [
  { href: "/docs", label: "Ringkasan", desc: "Mulai cepat & konsep dasar" },
  { href: "/docs/api", label: "Endpoint API", desc: "Referensi lengkap endpoint" },
  { href: "/docs/integrations", label: "Integrasi", desc: "Panduan pihak ketiga" },
];

/* Navigasi sebelumnya / selanjutnya di bawah setiap halaman docs. */
export function DocsPager() {
  const pathname = usePathname();
  const idx = pages.findIndex((p) => pathname === p.href);
  if (idx === -1) return null;

  const prev = idx > 0 ? pages[idx - 1] : null;
  const next = idx < pages.length - 1 ? pages[idx + 1] : null;

  return (
    <div className="mt-14 grid gap-3 border-t border-line-soft pt-8 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/40"
        >
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            <ArrowLeft size={12} className="transition-transform group-hover:-translate-x-0.5" />
            Sebelumnya
          </span>
          <span className="mt-2 block text-sm font-medium text-fg">{prev.label}</span>
          <span className="mt-0.5 block text-xs text-fg-faint">{prev.desc}</span>
        </Link>
      ) : (
        <div aria-hidden className="hidden sm:block" />
      )}

      {next ? (
        <Link
          href={next.href}
          className="group rounded-xl border border-line bg-surface p-4 text-right transition-colors hover:border-accent/40"
        >
          <span className="flex items-center justify-end gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            Selanjutnya
            <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="mt-2 block text-sm font-medium text-fg">{next.label}</span>
          <span className="mt-0.5 block text-xs text-fg-faint">{next.desc}</span>
        </Link>
      ) : (
        <div aria-hidden className="hidden sm:block" />
      )}
    </div>
  );
}
