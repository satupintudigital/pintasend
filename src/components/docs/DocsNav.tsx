"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";

export const docsSections = [
  {
    title: "Memulai",
    links: [{ href: "/docs", label: "Ringkasan & Mulai Cepat" }],
  },
  {
    title: "Referensi API",
    links: [{ href: "/docs/api", label: "Endpoint API" }],
  },
  {
    title: "Integrasi",
    links: [{ href: "/docs/integrations", label: "Panduan Pihak Ketiga" }],
  },
];

const flatPages = docsSections.flatMap((s) => s.links);

/* Sidebar desktop — halaman aktif ditandai rail aksen + aria-current. */
export function DocsNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;

  return (
    <aside className="hidden w-56 shrink-0 md:block">
      <nav className="sticky top-24 space-y-8" aria-label="Navigasi dokumentasi">
        {docsSections.map((sec) => (
          <div key={sec.title}>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">
              {sec.title}
            </p>
            <ul className="mt-3 space-y-1">
              {sec.links.map((l) => {
                const active = isActive(l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={active ? "page" : undefined}
                      className={`relative block rounded-lg px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-surface-2 font-medium text-fg"
                          : "text-fg-muted hover:bg-surface-2/60 hover:text-fg"
                      }`}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent-bright"
                        />
                      )}
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="border-t border-line-soft pt-6">
          <Link
            href="/"
            className="group inline-flex items-center gap-1.5 text-sm text-fg-faint transition-colors hover:text-fg"
          >
            <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
            Kembali ke beranda
          </Link>
        </div>
      </nav>
    </aside>
  );
}

/* Tab horizontal mobile — pengganti sidebar di layar kecil. */
export function DocsMobileTabs() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;

  return (
    <nav
      aria-label="Navigasi dokumentasi"
      className="-mx-5 overflow-x-auto border-b border-line-soft px-5 pb-3 md:hidden"
    >
      <div className="flex w-max gap-2">
        {flatPages.map((l) => {
          const active = isActive(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                active
                  ? "border-accent/40 bg-accent/10 font-medium text-fg"
                  : "border-line text-fg-muted hover:border-line hover:bg-surface-2/60 hover:text-fg"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
