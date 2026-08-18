import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, BookOpenText, Gauge, HouseLine } from "@phosphor-icons/react/ssr";
import { Logo } from "@/components/Logo";
import { AmbientParallax } from "@/components/AmbientParallax";

export const metadata: Metadata = {
  title: "404 — Halaman tidak ditemukan · Wavio",
  description: "Halaman yang kamu cari tidak ditemukan. Kembali ke beranda atau baca dokumentasi Wavio.",
};

const quickLinks = [
  { href: "/", label: "Beranda", icon: HouseLine },
  { href: "/docs", label: "Dokumentasi", icon: BookOpenText },
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
];

export default function NotFound() {
  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-ink">
      {/* Ambient: grid + glow dengan parallax halus */}
      <AmbientParallax className="h-[560px]">
        <div
          data-parallax="0.12"
          className="absolute inset-0 bg-grid bg-grid-fade opacity-30 will-change-transform"
        />
        <div
          data-parallax="0.28"
          className="absolute -top-32 left-1/2 h-[340px] w-[680px] -ml-[340px] rounded-full bg-accent/5 blur-[130px] will-change-transform"
        />
      </AmbientParallax>

      {/* Header */}
      <header className="relative z-10 border-b border-line-soft bg-ink/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
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

      {/* Konten */}
      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center px-5 py-16 text-center md:py-24">
        {/* Angka 404 besar — outline, dekoratif */}
        <p
          aria-hidden
          className="bk-enter font-display text-[6.5rem] font-bold leading-none tracking-tighter text-transparent md:text-[10.5rem]"
          style={{ WebkitTextStroke: "1.5px rgba(244, 244, 245, 0.22)" }}
        >
          404
        </p>

        <p
          className="bk-enter-blur mt-8 font-mono text-xs uppercase tracking-[0.2em] text-accent-bright"
          style={{ animationDelay: "80ms" }}
        >
          Nomor tidak ditemukan
        </p>
        <h1
          className="bk-enter-blur mt-3 max-w-[22ch] font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
          style={{ animationDelay: "140ms" }}
        >
          Halaman ini tidak terdaftar di WhatsApp kami
        </h1>
        <p
          className="bk-enter-blur mt-4 max-w-[52ch] leading-relaxed text-fg-muted"
          style={{ animationDelay: "200ms" }}
        >
          Alamat yang kamu buka salah ketik, sudah dipindahkan, atau tidak pernah ada.
          Periksa kembali URL-nya — atau lanjutkan dari salah satu jalur di bawah.
        </p>

        {/* Blok error ala API — sesuai bahasa produk */}
        <div
          className="bk-enter-blur mt-8 w-full max-w-md overflow-hidden rounded-xl border border-line bg-ink-2 text-left shadow-[0_24px_60px_-36px_rgba(0,0,0,0.8)]"
          style={{ animationDelay: "260ms" }}
        >
          <div className="flex items-center gap-3 border-b border-line-soft bg-surface/60 px-4 py-2.5">
            <span aria-hidden className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-line" />
              <span className="h-2.5 w-2.5 rounded-full bg-line" />
              <span className="h-2.5 w-2.5 rounded-full bg-line" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
              http
            </span>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
            <code>
              <span className="tok-k">HTTP/1.1</span>
              <span className="tok-n"> 404</span>
              <span> Not Found</span>
              {"\n\n"}
              <span className="tok-p">{"{"}</span>
              {"\n  "}
              <span className="tok-k">&quot;error&quot;</span>
              <span className="tok-p">: </span>
              <span className="tok-s">&quot;Halaman tidak ditemukan&quot;</span>
              <span className="tok-p">,</span>
              {"\n  "}
              <span className="tok-k">&quot;hint&quot;</span>
              <span className="tok-p">: </span>
              <span className="tok-s">&quot;Periksa URL atau kembali ke beranda&quot;</span>
              {"\n"}
              <span className="tok-p">{"}"}</span>
            </code>
          </pre>
        </div>

        {/* CTA */}
        <div
          className="bk-enter-blur mt-9 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "320ms" }}
        >
          <Link
            href="/"
            className="bk-shimmer group inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_28px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.98]"
          >
            <ArrowLeft
              size={15}
              weight="bold"
              className="transition-transform group-hover:-translate-x-0.5"
            />
            Kembali ke beranda
          </Link>
          <Link
            href="/docs"
            className="group inline-flex items-center gap-2 rounded-full border border-line bg-ink-2/60 px-6 py-3 text-sm font-medium text-fg-muted transition-colors hover:border-accent/50 hover:text-fg"
          >
            Baca dokumentasi
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Jalur cepat */}
        <nav
          aria-label="Jalur alternatif"
          className="bk-enter-blur mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3"
          style={{ animationDelay: "380ms" }}
        >
          {quickLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="group inline-flex items-center gap-2 text-sm text-fg-faint transition-colors hover:text-fg"
            >
              <l.icon size={15} className="text-accent-bright" />
              {l.label}
            </Link>
          ))}
        </nav>
      </main>

      {/* Footer tipis */}
      <footer className="relative z-10 border-t border-line-soft px-5 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-fg-faint sm:flex-row">
          <p>© 2026 Wavio · Satu Pintu Digital</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="transition-colors hover:text-fg">
              Kebijakan Privasi
            </Link>
            <Link href="/terms" className="transition-colors hover:text-fg">
              Syarat &amp; Ketentuan
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
