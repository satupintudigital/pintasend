import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dokumentasi — Wavio",
  description:
    "Dokumentasi API Wavio: mulai cepat, referensi endpoint, dan panduan integrasi pihak ketiga untuk mengirim notifikasi WhatsApp.",
};

const sections = [
  {
    title: "Memulai",
    links: [
      { href: "/docs", label: "Ringkasan & Mulai Cepat" },
    ],
  },
  {
    title: "Referensi API",
    links: [
      { href: "/docs/api", label: "Endpoint API" },
    ],
  },
  {
    title: "Integrasi",
    links: [
      { href: "/docs/integrations", label: "Panduan Pihak Ketiga" },
    ],
  },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-ink">
      <header className="sticky top-0 z-40 border-b border-line-soft bg-ink/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5 font-display font-semibold tracking-tight text-fg">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-ink">
              W
            </span>
            <span>wavio</span>
            <span className="ml-1 rounded-full border border-line-soft bg-surface-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
              Docs
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-fg-muted transition-colors hover:text-fg">
              Masuk
            </Link>
            <Link
              href="/"
              className="rounded-full bg-accent px-4 py-2 font-medium text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.97]"
            >
              Beranda
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-5 py-10 md:py-14">
        {/* Sidebar */}
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="sticky top-24 space-y-8">
            {sections.map((sec) => (
              <div key={sec.title}>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">
                  {sec.title}
                </p>
                <ul className="mt-3 space-y-1">
                  {sec.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="block rounded-lg px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Konten */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
