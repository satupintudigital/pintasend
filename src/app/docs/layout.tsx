import Link from "next/link";
import type { Metadata } from "next";
import { DocsNav, DocsMobileTabs } from "@/components/docs/DocsNav";
import { DocsProgress } from "@/components/docs/DocsProgress";
import { DocsPager } from "@/components/docs/DocsPager";
import { DocsSearch } from "@/components/docs/DocsSearch";
import { BackToTop } from "@/components/docs/BackToTop";
import { AmbientParallax } from "@/components/docs/AmbientParallax";

export const metadata: Metadata = {
  title: "Dokumentasi — Wavio",
  description:
    "Dokumentasi API Wavio: mulai cepat, referensi endpoint, dan panduan integrasi pihak ketiga untuk mengirim notifikasi WhatsApp.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] bg-ink">
      {/* Ambient: grid + glow halus dengan parallax (transform-only) */}
      <AmbientParallax className="h-[440px]">
        <div
          data-parallax="0.12"
          className="absolute inset-0 bg-grid bg-grid-fade opacity-30 will-change-transform"
        />
        <div
          data-parallax="0.28"
          className="absolute -top-40 left-1/2 h-[320px] w-[640px] -ml-80 rounded-full bg-accent/5 blur-[130px] will-change-transform"
        />
      </AmbientParallax>

      <header className="sticky top-0 z-40 border-b border-line-soft bg-ink/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link
            href="/"
            className="group flex items-center gap-2.5 font-display font-semibold tracking-tight text-fg"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-ink transition-shadow group-hover:shadow-[0_0_24px_-4px_rgba(52,211,153,0.7)]">
              W
            </span>
            <span>wavio</span>
            <span className="ml-1 rounded-md border border-line-soft bg-surface-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
              Docs
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <DocsSearch />
            <Link
              href="/login"
              className="hidden text-fg-muted transition-colors hover:text-fg sm:inline"
            >
              Masuk
            </Link>
            <Link
              href="/"
              className="shrink-0 rounded-full bg-accent px-4 py-2 font-medium text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.97]"
            >
              Beranda
            </Link>
          </div>
        </div>
        <DocsProgress />
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-8 md:pb-20 md:pt-14">
        <DocsMobileTabs />

        <div className="mt-6 flex gap-10 md:mt-10">
          <DocsNav />
          <main className="min-w-0 flex-1">{children}</main>
        </div>

        <DocsPager />

        <footer className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-line-soft pt-6 text-xs text-fg-faint sm:flex-row">
          <p>© 2026 Wavio · Satu Pintu Digital</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="transition-colors hover:text-fg">
              Kebijakan Privasi
            </Link>
            <Link href="/terms" className="transition-colors hover:text-fg">
              Syarat &amp; Ketentuan
            </Link>
          </div>
        </footer>
      </div>

      <BackToTop />
    </div>
  );
}
