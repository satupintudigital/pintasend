"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle, Timer } from "@phosphor-icons/react";
import { Reveal } from "@/components/Reveal";
import { AmbientParallax } from "@/components/AmbientParallax";
import type { PublicCatalog } from "@/lib/catalog";

// ─── Landing harga — dinamis dari /api/public/catalog (Plan + Addon + setting) ─
// Toggle Bulanan/Tahunan dihapus (harga tahunan belum ada di DB). CTA tiap plan
// → /register?plan=<id> (addon di-bundle saat register/checkout pertama).
// Tampilkan skeleton saat loading & error kecil bila katalog gagal dimuat.

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

function formatPrice(plan: PublicCatalog["plans"][number]): { price: string; unit: string } {
  if (plan.kind === "prepaid" && plan.pricePerMessage != null) {
    return { price: `Rp ${plan.pricePerMessage.toLocaleString("id-ID")}`, unit: "/pesan" };
  }
  if (plan.priceMonthly != null) {
    return { price: rupiah(plan.priceMonthly), unit: "/bulan" };
  }
  return { price: "Hubungi kami", unit: "" };
}

function planNote(plan: PublicCatalog["plans"][number]): string {
  if (plan.kind === "prepaid") return "Prepaid — isi saldo pesan, tanpa biaya bulanan";
  if (plan.maxMessagesPerMonth != null) {
    return `${plan.maxMessagesPerMonth.toLocaleString("id-ID")} pesan per bulan`;
  }
  return "Tanpa batas pesan";
}

export function Pricing() {
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/public/catalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { catalog: PublicCatalog }) => {
        if (!mounted) return;
        setCatalog(data.catalog);
      })
      .catch(() => {
        if (mounted) setError(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const plans = catalog?.plans ?? [];
  const purchasableAddons = (catalog?.addons ?? []).filter((a) => a.priceMonthly != null);
  // Highlight tengah (Latte bila 3 kartu) agar konsisten dengan seed.
  const highlightIndex = plans.length === 3 ? 1 : 0;

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
            <p className="mx-auto mt-4 max-w-[58ch] leading-relaxed text-fg-muted">
              {catalog
                ? `Biaya aktivasi ${rupiah(catalog.settings.activationFeeRp)} sekali khusus paket bulanan. Espresso: bayar sesuai pesan, tanpa biaya bulanan.`
                : "Biaya aktivasi sekali khusus paket bulanan. Espresso: bayar sesuai pesan, tanpa biaya bulanan."}
            </p>
          </div>
        </Reveal>

        {error && (
          <p className="mt-10 rounded-2xl border border-line bg-surface p-4 text-center text-sm text-fg-muted">
            Harga gagal dimuat — silakan muat ulang halaman.
          </p>
        )}

        <div className="mt-14 grid items-stretch gap-4 md:grid-cols-3">
          {loading && !error
            ? [0, 1, 2].map((i) => (
                <div key={i} className="h-[420px] animate-pulse rounded-2xl border border-line bg-surface/60" />
              ))
            : plans.map((p, i) => {
                const highlighted = i === highlightIndex;
                const { price, unit } = formatPrice(p);
                const card = (
                  <div className={`flex h-full flex-col rounded-2xl p-6 ${highlighted ? "bg-surface" : "border border-line bg-surface"}`}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                      {highlighted && (
                        <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-accent-ink">{p.tagline}</span>
                      )}
                    </div>
                    {!highlighted && <p className="mt-1 text-sm text-fg-faint">{p.tagline}</p>}

                    <div className="mt-5 flex items-baseline gap-1">
                      <span className="bk-tabular font-display text-4xl font-semibold tracking-tight">{price}</span>
                      <span className="text-sm text-fg-faint">{unit}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-fg-faint">{planNote(p)}</p>

                    <ul className="mt-6 flex-1 space-y-3">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm text-fg-muted">
                          <CheckCircle size={18} className="mt-0.5 shrink-0 text-accent-bright" weight="fill" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    <Link
                      href={`/register?plan=${encodeURIComponent(p.id)}`}
                      className={`mt-8 inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-3 text-sm font-semibold transition-all active:scale-[0.98] ${
                        highlighted
                          ? "bg-accent text-accent-ink shadow-[0_0_28px_-10px_rgba(16,185,129,0.9)] hover:bg-accent-bright"
                          : "border border-line text-fg hover:border-accent/50"
                      }`}
                    >
                      {p.kind === "subscription" ? `Pilih ${p.name}` : `Mulai dengan ${p.name}`}
                      {highlighted && <ArrowUpRight size={14} weight="bold" />}
                    </Link>
                  </div>
                );
                return (
                  <Reveal key={p.id} delay={i * 80}>
                    {highlighted ? (
                      <div className="relative h-full rounded-2xl bg-gradient-to-b from-accent/50 via-accent/15 to-transparent p-px shadow-[0_24px_80px_-32px_rgba(16,185,129,0.45)]">
                        <div className="h-full rounded-[calc(1rem-1px)]">{card}</div>
                      </div>
                    ) : (
                      card
                    )}
                  </Reveal>
                );
              })}
        </div>

        {/* Add-on berbayar dari katalog (priceMonthly != null) */}
        {purchasableAddons.length > 0 && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {purchasableAddons.map((addon, i) => (
              <Reveal key={addon.key} delay={200 + i * 60}>
                <div className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 transition-colors duration-300 hover:border-accent/30 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        aria-hidden
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/10 text-amber-200"
                      >
                        <Timer size={20} weight="fill" />
                      </span>
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-200">Add-on</span>
                      <h3 className="font-display text-lg font-semibold">{addon.name}</h3>
                    </div>
                    <p className="mt-3 max-w-[68ch] text-sm leading-relaxed text-fg-muted">{addon.tagline}</p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-3 md:items-end">
                    <div className="flex items-baseline gap-1">
                      <span className="bk-tabular font-display text-2xl font-semibold tracking-tight">
                        {rupiah(addon.priceMonthly!)}
                      </span>
                      <span className="text-sm text-fg-faint">/bulan</span>
                    </div>
                    <Link
                      href={`/register?addon=${encodeURIComponent(addon.key)}`}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line px-5 py-3 text-sm font-semibold text-fg transition-all hover:border-accent/50 hover:text-accent-bright active:scale-[0.98]"
                    >
                      Pilih addon
                      <ArrowUpRight size={14} weight="bold" />
                    </Link>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        )}

        <Reveal delay={300}>
          <p className="mt-10 text-center text-xs text-fg-faint">
            Semua paket termasuk dukungan via WhatsApp dan riwayat pesan 30 hari.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
