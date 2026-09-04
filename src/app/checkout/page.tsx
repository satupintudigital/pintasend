"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, ArrowLeft, CheckCircle, Warning } from "@phosphor-icons/react";
import { Logo } from "@/components/Logo";
import { PayCodePanel, type PayableOrder } from "@/components/billing/PayCodePanel";
import type { PublicCatalog } from "@/lib/catalog";

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

// Channel Tripay default (tanpa route baru) — sandbox/prod memakai kode method
// yang sama; daftar lengkap bisa disinkron via listChannels nanti.
const CHANNELS: { code: string; name: string; group: string }[] = [
  { code: "QRIS2", name: "QRIS", group: "QR Code" },
  { code: "BRIVA", name: "BRI Virtual Account", group: "Virtual Account" },
  { code: "BCAVA", name: "BCA Virtual Account", group: "Virtual Account" },
  { code: "MANDIRIVA", name: "Mandiri Virtual Account", group: "Virtual Account" },
  { code: "ALFAMART", name: "Alfamart", group: "Retail" },
  { code: "DANA", name: "DANA", group: "E-Wallet" },
  { code: "OVO", name: "OVO", group: "E-Wallet" },
  { code: "SHOPEEPAY", name: "ShopeePay", group: "E-Wallet" },
];

interface MyBilling {
  pending: boolean;
  plan: {
    planId: string | null;
    planName: string | null;
    planKind: string | null;
    priceMonthly: number | null;
    activatedAt: string | null;
    planPeriodEnd: string | null;
  } | null;
  balance: number;
  renewalTriggered: boolean;
}

type Mode = "subscription" | "topup" | "addon";

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [my, setMy] = useState<MyBilling | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [channel, setChannel] = useState("QRIS2");
  // Inisialisasi sekali dari query (bukan setState dalam effect).
  const [messages, setMessages] = useState<number>(() => {
    const p = Number.parseInt(searchParams.get("creditMessages") ?? "", 10);
    return Number.isInteger(p) && p > 0 ? p : 50;
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [order, setOrder] = useState<PayableOrder | null>(null);
  const [paid, setPaid] = useState(false);
  const [expired, setExpired] = useState(false);
  const paidRef = useRef(false);

  const planParam = searchParams.get("plan");
  const addonParam = searchParams.get("addon");
  const topupParam = searchParams.get("topup");
  const creditParam = searchParams.get("creditMessages");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [catalogRes, myRes] = await Promise.all([
          fetch("/api/public/catalog"),
          fetch("/api/billing/my"),
        ]);
        if (catalogRes.ok) {
          const d = (await catalogRes.json()) as { catalog: PublicCatalog };
          if (mounted) setCatalog(d.catalog);
        }
        if (myRes.status === 401) {
          if (mounted) setAuthRequired(true);
          return;
        }
        if (myRes.ok) {
          // /api/billing/my mengembalikan { plan, pending, balance, ... } —
          // field ekstra (orders/catalog) tidak dipakai di sini.
          const d = (await myRes.json()) as MyBilling;
          if (mounted) setMy(d);
        }
      } catch {
        if (mounted) setError("Gagal memuat data checkout. Muat ulang halaman.");
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const plan = useMemo(() => catalog?.plans.find((p) => p.id === planParam), [catalog, planParam]);
  const addon = useMemo(
    () => (addonParam ? catalog?.addons.find((a) => a.key === addonParam && a.priceMonthly != null) ?? null : null),
    [catalog, addonParam],
  );

  // Mode order diturunkan dari query + status tenant.
  const mode: Mode | null = (() => {
    if (topupParam === "1" || (plan && plan.kind === "prepaid")) return "topup";
    if (plan && plan.kind === "subscription") return "subscription";
    if (addon) return "addon";
    return null;
  })();

  const minMessages = catalog
    ? Math.ceil(catalog.settings.creditMinTopupRp / catalog.settings.creditPerMessageRp)
    : 50;
  void creditParam;

  const rate = catalog?.settings.creditPerMessageRp ?? 400;
  const topupAmount = messages * rate;

  const summary = useMemo(() => {
    if (!catalog || !my) return null;
    if (mode === "subscription" && plan) {
      const rows = [
        { label: `Paket ${plan.name}`, value: plan.priceMonthly != null ? rupiah(plan.priceMonthly) : "" },
      ];
      if (my.pending) {
        rows.push({ label: "Biaya aktivasi (sekali)", value: rupiah(catalog.settings.activationFeeRp) });
      }
      if (addon) rows.push({ label: `Add-on ${addon.name}`, value: rupiah(addon.priceMonthly!) });
      const total =
        (plan.priceMonthly ?? 0) +
        (my.pending ? catalog.settings.activationFeeRp : 0) +
        (addon ? addon.priceMonthly! : 0);
      return { rows, total };
    }
    if (mode === "topup") {
      return {
        rows: [{ label: `Pulsa pesan × ${messages}`, value: rupiah(topupAmount) }],
        total: topupAmount,
      };
    }
    if (mode === "addon" && addon) {
      return { rows: [{ label: `Add-on ${addon.name}`, value: rupiah(addon.priceMonthly!) }], total: addon.priceMonthly! };
    }
    return null;
  }, [catalog, my, mode, plan, addon, messages, topupAmount]);

  // Polling status order tiap 5 dtk sampai paid/expired.
  useEffect(() => {
    if (!order || paidRef.current) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/billing/orders/${order.id}`);
        if (!res.ok) return;
        const d = (await res.json()) as { order: PayableOrder };
        const st = d.order.status;
        if (st === "paid") {
          paidRef.current = true;
          setPaid(true);
          setTimeout(() => router.push("/dashboard/langganan?paid=1"), 1400);
        } else if (st === "expired") {
          setExpired(true);
        } else {
          setOrder(d.order);
        }
      } catch {
        /* polling berikutnya */
      }
    };
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [order, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!mode || !channel) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { payMethod: channel };
      if (mode === "subscription" && plan) {
        body.kind = "first_subscription";
        body.planId = plan.id;
        if (addon) body.addonKeys = [addon.key];
      } else if (mode === "topup") {
        body.kind = "topup";
        // Clamp ke minimal top-up dari katalog (server memvalidasi ulang).
        body.creditMessages = Math.max(minMessages, messages);
        // Aktivasi Espresso (tenant pending): order top-up pertama membawa planId prepaid.
        if (my?.pending && plan?.kind === "prepaid") body.planId = plan.id;
      } else if (mode === "addon" && addon) {
        body.kind = "addon";
        body.addonKey = addon.key;
      }
      const res = await fetch("/api/billing/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        order?: PayableOrder & { kind: string };
        redirectUrl?: string | null;
        error?: string;
      };
      if (!res.ok || !data.order) {
        setError(data.error ?? "Gagal membuat pesanan. Coba lagi.");
        return;
      }
      const o: PayableOrder = {
        id: data.order.id,
        kind: data.order.kind,
        status: data.order.status,
        amount: data.order.amount,
        payCode: data.order.payCode,
        checkoutUrl: data.order.checkoutUrl,
        expiresAt: data.order.expiresAt,
        expiresInSec: null,
        paidAt: data.order.paidAt,
        payMethod: data.order.payMethod ?? null,
      };
      // Redirect method (e-wallet dsb): buka checkout_url gateway.
      if (o.checkoutUrl && !o.payCode) {
        window.open(o.checkoutUrl, "_self");
      }
      setOrder(o);
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  if (authRequired) {
    return (
      <Shell>
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <Warning size={32} weight="fill" className="mx-auto text-amber-300" />
          <h1 className="mt-4 font-display text-xl font-semibold">Masuk dulu untuk checkout</h1>
          <p className="mt-2 text-sm text-fg-muted">Kamu perlu login ke akun tenant sebelum melanjutkan pembayaran.</p>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent("/checkout" + window.location.search)}`}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink"
          >
            Masuk <ArrowRight size={15} weight="bold" />
          </Link>
        </div>
      </Shell>
    );
  }

  if (!catalog || !my || !mode || !summary) {
    return (
      <Shell>
        <div className="h-72 animate-pulse rounded-2xl border border-line bg-surface/60" />
        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      </Shell>
    );
  }

  const isPendingOnly = my.pending && mode !== "subscription" && !(plan?.kind === "prepaid");
  // Tenant subscription sudah aktif: beli paket pertama tidak berlaku lagi.
  const activeSubscriptionOnly =
    !my.pending && mode === "subscription";

  return (
    <Shell>
      <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={15} weight="bold" /> Kembali ke beranda
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Kiri: ringkasan + metode bayar */}
        <div className="rounded-2xl border border-line bg-surface p-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Checkout</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight">
            {mode === "subscription" ? "Aktivasi paket" : mode === "topup" ? "Top-up pulsa pesan" : "Beli add-on"}
          </h1>

          {my.pending && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3.5 py-2.5 text-sm text-amber-200">
              <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
              Tenant belum aktif — pembayaran pertama ini akan mengaktifkan akunmu.
            </p>
          )}

          {mode === "topup" ? (
            <div className="mt-6 space-y-5">
              <div>
                <label htmlFor="messages" className="mb-1.5 block text-sm font-medium text-fg">
                  Jumlah pesan (min {minMessages})
                </label>
                <input
                  id="messages"
                  type="number"
                  min={minMessages}
                  step={1}
                  value={messages}
                  onChange={(e) => setMessages(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
                  className="min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <p className="mt-2 text-xs text-fg-faint">
                  {rupiah(rate)}/pesan · total <span className="font-semibold text-fg-muted">{rupiah(topupAmount)}</span>
                </p>
              </div>
              {plan?.kind === "prepaid" && (
                <p className="text-xs text-fg-muted">
                  Top-up pertama sekaligus mengaktifkan tenant dengan paket <b>{plan.name}</b> — tanpa biaya aktivasi.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 space-y-1 text-sm">
              {plan && mode === "subscription" && (
                <p className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 p-3.5">
                  <CheckCircle size={18} className="shrink-0 text-accent-bright" weight="fill" />
                  Paket <b>{plan.name}</b> — {plan.tagline}
                </p>
              )}
              {addon && (
                <p className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 p-3.5">
                  <CheckCircle size={18} className="shrink-0 text-accent-bright" weight="fill" />
                  Add-on <b>{addon.name}</b>
                </p>
              )}
            </div>
          )}

          {isPendingOnly && (
            <p className="mt-5 rounded-xl border border-line bg-ink-2 p-4 text-sm text-fg-muted">
              Tenant belum aktif. Pilih paket bulanan atau paket Espresso untuk aktivasi terlebih dahulu —{" "}
              <Link href="/register" className="font-semibold text-accent-bright hover:underline">
                mulai dari sini
              </Link>
              .
            </p>
          )}

          {activeSubscriptionOnly && (
            <p className="mt-5 rounded-xl border border-line bg-ink-2 p-4 text-sm text-fg-muted">
              Akunmu sudah aktif. Kelola perpanjangan, top-up, dan add-on lewat{" "}
              <Link href="/dashboard/langganan" className="font-semibold text-accent-bright hover:underline">
                menu Langganan
              </Link>
              .
            </p>
          )}

          {/* Pilih channel pembayaran */}
          <div className="mt-7">
            <p className="mb-2 text-sm font-medium text-fg">Metode pembayaran</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {CHANNELS.map((c) => {
                const active = channel === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setChannel(c.code)}
                    aria-pressed={active}
                    className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                      active ? "border-accent/60 bg-accent/5" : "border-line bg-ink-2 hover:border-line"
                    }`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${active ? "border-accent" : "border-line"}`}>
                      {active && <span className="h-2 w-2 rounded-full bg-accent" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg">{c.name}</span>
                      <span className="block text-xs text-fg-faint">{c.group}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
              <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
              {error}
            </p>
          )}

          {!order && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting || isPendingOnly || activeSubscriptionOnly}
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.98] disabled:opacity-50"
            >
              {submitting ? "Membuat pesanan…" : (
                <>
                  Bayar {rupiah(summary.total)}
                  <ArrowRight size={15} weight="bold" />
                </>
              )}
            </button>
          )}
        </div>

        {/* Kanan: ringkasan + panel pembayaran */}
        <div className="space-y-6">
          {order ? (
            <>
              <PayCodePanel
                order={order}
                paid={paid}
                expired={expired}
                onOpenCheckout={(url) => window.open(url, "_self")}
              />
              {!paid && !expired && (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch(`/api/billing/orders/${order.id}`);
                    if (!res.ok) return;
                    const d = (await res.json()) as { order: PayableOrder };
                    if (d.order.status === "paid") {
                      paidRef.current = true;
                      setPaid(true);
                      setTimeout(() => router.push("/dashboard/langganan?paid=1"), 1400);
                    } else {
                      setOrder(d.order);
                    }
                  }}
                  className="w-full rounded-full border border-line px-5 py-3 text-sm font-semibold text-fg transition-colors hover:border-accent/50"
                >
                  Saya sudah bayar
                </button>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="font-display text-lg font-semibold">Ringkasan</h2>
              <dl className="mt-4 space-y-2.5">
                {summary.rows.map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-4 text-sm">
                    <dt className="text-fg-muted">{r.label}</dt>
                    <dd className="font-medium text-fg">{r.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                <span className="text-sm font-semibold">Total</span>
                <span className="font-display text-xl font-semibold tracking-tight">{rupiah(summary.total)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-70" />
        <div className="bk-breath absolute left-1/2 top-[-40%] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-accent/10 blur-[150px]" />
      </div>
      <div className="mx-auto w-full max-w-5xl px-5 py-12">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/">
            <Logo className="h-8" />
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">Pembayaran aman</span>
        </div>
        {children}
      </div>
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh]" />}>
      <CheckoutContent />
    </Suspense>
  );
}
