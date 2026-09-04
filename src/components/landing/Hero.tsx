"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CheckCircle, Radio } from "@phosphor-icons/react/ssr";
import { Tokens, type Token } from "@/components/landing/Code";
import { CountUp } from "@/components/CountUp";
import { Tilt } from "@/components/Tilt";
import { AmbientParallax } from "@/components/AmbientParallax";

/* Spring entrance hero — menggantikan bk-enter/bk-enter-blur (CSS) dengan
   Motion. Overshoot halus (stiffness/damping), delay sama persis dengan
   stagger lama (0/80/160/200/240/320 ms). useReducedMotion → langsung tampil.
   Class bk-motion-reveal: fallback @media (scripting: none) di globals agar
   konten tetap terlihat tanpa JS. */
const enterSpring = { type: "spring", stiffness: 280, damping: 26, mass: 0.9 } as const;

const stats = [
  { to: 99.97, decimals: 2, suffix: "%", label: "uptime rata-rata" },
  { to: 2.4, decimals: 1, suffix: " jt+", label: "pesan terkirim / bulan" },
  { to: 300, decimals: 0, prefix: "< ", suffix: " ms", label: "latensi pengiriman" },
];

const codeTokens: Token[] = [
  ["k", "curl"],
  ["plain", " "],
  ["f", "-X POST"],
  ["plain", " "],
  ["s", "https://wavio.satupintudigital.co.id/v1/messages"],
  ["plain", " \\\n  "],
  ["f", "-H"],
  ["plain", " "],
  ["s", '"Authorization: Bearer $WAVIO_KEY"'],
  ["plain", " \\\n  "],
  ["f", "-H"],
  ["plain", " "],
  ["s", '"Content-Type: application/json"'],
  ["plain", " \\\n  "],
  ["f", "-d"],
  ["plain", " "],
  ["s", '{"device":"62812xxxxxxx","to":"6281234567890",'],
  ["plain", "\n       "],
  ["s", '"text":"Pesanan #1234 sudah dikirim"'],
  ["plain", "}"],
  ["plain", "\n\n"],
  ["c", "# 201 Created"],
  ["plain", "\n"],
  ["p", "{ "],
  ["k", '"messageId"'],
  ["p", ": "],
  ["s", '"9f2c8a1b7e"'],
  ["p", ", "],
  ["k", '"status"'],
  ["p", ": "],
  ["s", '"sent"'],
  ["p", " }"],
];

function CodeCard() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-accent/10 blur-3xl"
      />
      <div className="overflow-hidden rounded-2xl border border-line bg-ink-2/90 shadow-[0_40px_100px_-40px_rgba(16,185,129,0.35)] backdrop-blur">
        <div className="flex items-center gap-2 border-b border-line-soft bg-surface/70 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-2 font-mono text-xs text-fg-faint">kirim-notifikasi.sh</span>
          <span className="ml-auto rounded-md border border-accent/25 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-medium text-accent-bright">
            201 Created
          </span>
        </div>
        <pre tabIndex={0} className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
          <code>
            <Tokens tokens={codeTokens} />
          </code>
        </pre>
      </div>

      {/* Floating toast: pesan terkirim */}
      <div className="bk-toast absolute -right-3 top-14 hidden items-center gap-2.5 rounded-xl border border-line bg-surface-2/95 px-3.5 py-2.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent-bright">
          <CheckCircle size={15} weight="fill" />
        </span>
        <div>
          <p className="text-xs font-semibold text-fg">Pesan terkirim</p>
          <p className="font-mono text-[10px] text-fg-faint">#1234 → 62812…7890</p>
        </div>
      </div>

      {/* Floating toast: webhook event */}
      <div
        className="bk-toast absolute -left-4 bottom-10 hidden items-center gap-2.5 rounded-xl border border-line bg-surface-2/95 px-3.5 py-2.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur sm:flex"
        style={{ animationDelay: "3.2s" }}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent-bright">
          <Radio size={15} />
        </span>
        <div>
          <p className="text-xs font-semibold text-fg">Webhook diterima</p>
          <p className="font-mono text-[10px] text-fg-faint">message.received</p>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  const reduced = useReducedMotion();

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* Parallax ambient: grid (0.12) + glow hero (0.5) — pola sama dengan
            halaman docs. Container sengaja lebih tinggi (+160px) agar grid
            tetap menutupi hero saat bergeser naik mengikuti scroll. */}
        <AmbientParallax className="h-[calc(100%+160px)]">
          <div
            data-parallax="0.12"
            className="absolute inset-0 bg-grid bg-grid-fade opacity-70 will-change-transform"
          />
          <div
            data-parallax="0.5"
            className="bk-breath absolute left-1/2 top-[-32%] h-[560px] w-[900px] -ml-[450px] rounded-full bg-accent/10 blur-[150px] will-change-transform"
          />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
        </AmbientParallax>
      </div>

      <div className="mx-auto grid max-w-7xl gap-14 px-5 pb-16 pt-14 md:grid-cols-[1.05fr_0.95fr] md:items-center md:pb-24 md:pt-20">
        <div className="min-w-0">
          <motion.p
            className="bk-motion-reveal inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/5 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent-bright"
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enterSpring, delay: 0 }}
          >
            <span className="bk-live-dot h-1.5 w-1.5 rounded-full bg-accent-bright" />
            WhatsApp API Gateway
          </motion.p>

          <motion.h1
            className="bk-motion-reveal mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl md:text-[4.3rem]"
            initial={reduced ? false : { opacity: 0, y: 20, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ ...enterSpring, delay: 0.08 }}
          >
            Kirim pesan WhatsApp, semudah memanggil API.
          </motion.h1>

          <motion.p
            className="bk-motion-reveal mt-6 max-w-[52ch] text-lg leading-relaxed text-fg-muted"
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enterSpring, delay: 0.16 }}
          >
            Sambungkan nomor bisnismu, kirim notifikasi transaksi, dan balas pelanggan
            langsung dari dashboard — atau satu baris kode.
          </motion.p>

          <motion.div
            className="bk-motion-reveal mt-8 flex flex-wrap items-center gap-3"
            initial={reduced ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enterSpring, delay: 0.24 }}
          >
            <a
              href="#harga"
              className="bk-shimmer group inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright hover:shadow-[0_0_44px_-8px_rgba(52,211,153,0.8)] active:scale-[0.98]"
            >
              Mulai Sekarang
              <ArrowRight
                size={16}
                weight="bold"
                className="transition-transform group-hover:translate-x-0.5"
              />
            </a>
            <a
              href="#api"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/50 px-6 py-3 text-sm font-medium text-fg-muted transition-colors hover:border-accent/50 hover:text-fg"
            >
              Lihat API
            </a>
          </motion.div>

          <motion.div
            className="bk-motion-reveal mt-12 flex flex-wrap items-center gap-x-10 gap-y-6"
            initial={reduced ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enterSpring, delay: 0.32 }}
          >
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col">
                <CountUp
                  to={s.to}
                  decimals={s.decimals}
                  prefix={s.prefix ?? ""}
                  suffix={s.suffix}
                  className="bk-tabular font-display text-2xl font-semibold tracking-tight text-fg"
                />
                <span className="mt-0.5 text-xs text-fg-faint">{s.label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          className="bk-motion-reveal min-w-0"
          initial={reduced ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...enterSpring, delay: 0.2 }}
        >
          <Tilt className="relative">
            <CodeCard />
          </Tilt>
        </motion.div>
      </div>
    </section>
  );
}
