"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle } from "@phosphor-icons/react";
import { Reveal } from "@/components/Reveal";
import { AmbientParallax } from "@/components/AmbientParallax";

type Plan = {
  name: string;
  tagline: string;
  price: string;
  priceYearly?: string;
  unit: string;
  note: string;
  noteYearly?: string;
  features: string[];
  highlight: boolean;
  cta: string;
};

const plans: Plan[] = [
  {
    name: "Espresso",
    tagline: "Bayar sesuai pakai",
    price: "Rp 400",
    unit: "/pesan",
    note: "Tanpa biaya bulanan, semua fitur inti",
    features: [
      "Tanpa biaya bulanan",
      "Semua fitur inti",
      "Cocok untuk trial dan toko kecil",
    ],
    highlight: false,
    cta: "Mulai dengan Espresso",
  },
  {
    name: "Latte",
    tagline: "Paling laris",
    price: "Rp 150.000",
    priceYearly: "Rp 120.000",
    unit: "/bulan",
    note: "500 pesan per bulan, overage Rp 300/pesan",
    noteYearly: "Ditagih Rp 1.440.000 per tahun",
    features: [
      "500 pesan per bulan",
      "Overage Rp 300 per pesan",
      "Sekitar 125 order transaksional",
      "Dashboard dan inbox lengkap",
    ],
    highlight: true,
    cta: "Pilih Latte",
  },
  {
    name: "Mocha",
    tagline: "Unlimited",
    price: "Rp 300.000",
    priceYearly: "Rp 240.000",
    unit: "/bulan",
    note: "Tanpa batas pesan, prioritas support",
    noteYearly: "Ditagih Rp 2.880.000 per tahun",
    features: [
      "Tanpa batas pesan",
      "Prioritas support",
      "Cocok untuk toko ramai",
    ],
    highlight: false,
    cta: "Pilih Mocha",
  },
];

export function Pricing() {
  const [yearly, setYearly] = useState(false);

  return (
    <section id="harga" className="relative overflow-hidden border-t border-line-soft bg-surface/40">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <AmbientParallax className="h-full">
          <div
            data-parallax="0.28"
            className="absolute left-1/2 top-[-30%] h-[420px] w-[720px] -ml-[360px] rounded-full bg-accent/5 blur-[140px] will-change-transform"
          />
        </AmbientParallax>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-24 md:py-32">
        <Reveal>
          <div className="text-center">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Harga</p>
            <h2 className="mx-auto mt-3 max-w-[22ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              Harga sederhana, tanpa hitungan rumit.
            </h2>
            <p className="mx-auto mt-4 max-w-[52ch] leading-relaxed text-fg-muted">
              Biaya aktivasi Rp 350.000 sekali, berlaku untuk semua paket. Naik atau turun kelas kapan saja.
            </p>

            {/* Toggle periode */}
            <div className="relative mt-8 inline-flex rounded-full border border-line bg-ink-2 p-1">
              <span
                aria-hidden
                className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-surface-2 shadow-sm transition-transform duration-300 [transition-timing-function:var(--ease-spring)] ${
                  yearly ? "translate-x-[calc(100%+8px)]" : "translate-x-0"
                }`}
              />
              <button
                type="button"
                onClick={() => setYearly(false)}
                aria-pressed={!yearly}
                className={`relative z-10 w-24 rounded-full py-2.5 text-sm transition-colors ${
                  !yearly ? "font-semibold text-fg" : "text-fg-muted hover:text-fg"
                }`}
              >
                Bulanan
              </button>
              <button
                type="button"
                onClick={() => setYearly(true)}
                aria-pressed={yearly}
                className={`relative z-10 w-24 rounded-full py-2.5 text-sm transition-colors ${
                  yearly ? "font-semibold text-fg" : "text-fg-muted hover:text-fg"
                }`}
              >
                Tahunan
              </button>
              <span className="relative z-10 ml-2 mr-1.5 flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent-bright">
                hemat 20%
              </span>
            </div>
          </div>
        </Reveal>

        <div className="mt-14 grid items-stretch gap-4 md:grid-cols-3">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 80}>
              {p.highlight ? (
                <div className="relative h-full rounded-2xl bg-gradient-to-b from-accent/50 via-accent/15 to-transparent p-px shadow-[0_24px_80px_-32px_rgba(16,185,129,0.45)]">
                  <div className="flex h-full flex-col rounded-[calc(1rem-1px)] bg-surface p-6">
                    <CardContent p={p} yearly={yearly} />
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition-colors duration-300 hover:border-line">
                  <CardContent p={p} yearly={yearly} />
                </div>
              )}
            </Reveal>
          ))}
        </div>

        <Reveal delay={200}>
          <p className="mt-10 text-center text-xs text-fg-faint">
            Semua paket termasuk dukungan via WhatsApp dan riwayat pesan 30 hari.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function CardContent({ p, yearly }: { p: Plan; yearly: boolean }) {
  const showYearly = yearly && p.priceYearly;

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">{p.name}</h3>
        {p.highlight && (
          <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-accent-ink">
            {p.tagline}
          </span>
        )}
      </div>
      {!p.highlight && <p className="mt-1 text-sm text-fg-faint">{p.tagline}</p>}

      <div className="mt-5 flex items-baseline gap-1">
        <span className="bk-tabular font-display text-4xl font-semibold tracking-tight">
          {showYearly ? p.priceYearly : p.price}
        </span>
        <span className="text-sm text-fg-faint">{p.unit}</span>
      </div>
      {/* Tinggi tetap agar daftar fitur sejajar antar kartu */}
      <p className="mt-1.5 h-4 text-xs text-fg-faint">
        {showYearly ? p.noteYearly : p.note}
      </p>

      <ul className="mt-6 flex-1 space-y-3">
        {p.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-fg-muted">
            <CheckCircle size={18} className="mt-0.5 shrink-0 text-accent-bright" weight="fill" />
            {f}
          </li>
        ))}
      </ul>

      <a
        href="#mulai"
        className={`mt-8 inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-3 text-sm font-semibold transition-all active:scale-[0.98] ${
          p.highlight
            ? "bg-accent text-accent-ink shadow-[0_0_28px_-10px_rgba(16,185,129,0.9)] hover:bg-accent-bright"
            : "border border-line text-fg hover:border-accent/50"
        }`}
      >
        {p.cta}
        {p.highlight && <ArrowUpRight size={14} weight="bold" />}
      </a>
    </>
  );
}
