"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Gauge,
  HouseLine,
} from "@phosphor-icons/react/ssr";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/landing/Footer";

const enterSpring = {
  type: "spring",
  stiffness: 280,
  damping: 26,
  mass: 0.9,
} as const;

const quickLinks = [
  { href: "/", label: "Beranda", icon: HouseLine },
  { href: "/docs", label: "Dokumentasi", icon: BookOpenText },
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
];

export default function NotFound() {
  const reduced = useReducedMotion();

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-ink">
      {/* Ambient: grid + glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-30" />
        <div className="bk-breath absolute left-1/2 top-[-6%] h-[340px] w-[680px] -ml-[340px] rounded-full bg-accent/5 blur-[130px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-line-soft bg-ink/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo />
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/login"
              className="text-fg-muted transition-colors hover:text-fg"
            >
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
        {/* 404 — outline besar dekoratif */}
        <motion.p
          aria-hidden
          className="font-display text-[6.5rem] font-bold leading-none tracking-tighter text-transparent md:text-[10.5rem]"
          style={{ WebkitTextStroke: "1.5px rgba(244, 244, 245, 0.22)" }}
          initial={reduced ? false : { opacity: 0, scale: 0.85, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ ...enterSpring, delay: 0 }}
        >
          404
        </motion.p>

        <motion.p
          className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-accent-bright"
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...enterSpring, delay: 0.08 }}
        >
          Nomor tidak ditemukan
        </motion.p>

        <motion.h1
          className="mt-3 max-w-[22ch] font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
          initial={
            reduced
              ? false
              : { opacity: 0, y: 18, filter: "blur(8px)" }
          }
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ ...enterSpring, delay: 0.14 }}
        >
          Halaman ini tidak terdaftar di WhatsApp kami
        </motion.h1>

        <motion.p
          className="mt-4 max-w-[52ch] leading-relaxed text-fg-muted"
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...enterSpring, delay: 0.2 }}
        >
          Alamat yang kamu buka salah ketik, sudah dipindahkan, atau tidak pernah
          ada. Periksa kembali URL-nya — atau lanjutkan dari salah satu jalur di
          bawah.
        </motion.p>

        {/* Blok error ala API response */}
        <motion.div
          className="mt-8 w-full max-w-md overflow-hidden rounded-2xl border border-line bg-ink-2 text-left shadow-[0_24px_60px_-36px_rgba(0,0,0,0.8)]"
          initial={reduced ? false : { opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...enterSpring, delay: 0.26 }}
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
              <span className="tok-s">
                &quot;Periksa URL atau kembali ke beranda&quot;
              </span>
              {"\n"}
              <span className="tok-p">{"}"}</span>
            </code>
          </pre>
        </motion.div>

        {/* CTA */}
        <motion.div
          className="mt-9 flex flex-wrap items-center justify-center gap-3"
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...enterSpring, delay: 0.32 }}
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
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </motion.div>

        {/* Jalur cepat */}
        <motion.nav
          aria-label="Jalur alternatif"
          className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3"
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...enterSpring, delay: 0.38 }}
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
        </motion.nav>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
