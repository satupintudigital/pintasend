"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bank,
  CheckCircle,
  Coins,
  CreditCard,
  Lightbulb,
  Warning,
} from "@phosphor-icons/react";
import type { PublicCatalog } from "@/lib/catalog";

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

interface MyPlan {
  planId: string | null;
  planName: string | null;
  planKind: string | null;
  priceMonthly: number | null;
  priceDisplay: string | null;
  maxMessagesPerMonth: number | null;
  maxDevices: number | null;
  maxUsers: number | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  planAssignedAt: string | null;
  planPeriodEnd: string | null;
}

interface OrderRow {
  id: string;
  kind: string;
  status: string;
  amount: number;
  payCode: string | null;
  checkoutUrl: string | null;
  payMethod: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface MyResponse {
  catalog: PublicCatalog;
  plan: MyPlan | null;
  balance: number;
  orders: OrderRow[];
  pending: boolean;
  deviceCount: number;
  renewalTriggered: boolean;
}

const KIND_LABEL: Record<string, string> = {
  first_subscription: "Paket pertama",
  renewal_subscription: "Perpanjangan bulanan",
  addon: "Add-on",
  topup: "Top-up pulsa",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-300/10 text-amber-200 border-amber-300/20",
    paid: "bg-accent/10 text-accent-bright border-accent/20",
    expired: "bg-red-300/10 text-red-300 border-red-300/20",
    cancelled: "bg-ink-2 text-fg-faint border-line",
  };
  const label: Record<string, string> = {
    pending: "Menunggu bayar",
    paid: "Lunas",
    expired: "Kedaluwarsa",
    cancelled: "Dibatalkan",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${map[status] ?? "bg-ink-2 text-fg-faint border-line"}`}>
      {label[status] ?? status}
    </span>
  );
}

export function SubscriptionDashboard() {
  const router = useRouter();
  const [data, setData] = useState<MyResponse | null>(null);
  const [error, setError] = useState("");
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupMessages, setTopupMessages] = useState(100);

  useEffect(() => {
    let mounted = true;
    fetch("/api/billing/my")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: MyResponse) => {
        if (mounted) setData(d);
      })
      .catch(() => {
        if (mounted) setError("Gagal memuat data langganan.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const minMessages = data
    ? Math.ceil(data.catalog.settings.creditMinTopupRp / data.catalog.settings.creditPerMessageRp)
    : 50;
  const rate = data?.catalog.settings.creditPerMessageRp ?? 400;

  const purchasableAddons = useMemo(
    () => (data?.catalog.addons ?? []).filter((a) => a.priceMonthly != null),
    [data],
  );

  const firstSubscriptionPlan = useMemo(
    () => data?.catalog.plans.find((p) => p.kind === "subscription") ?? null,
    [data],
  );

  if (error) {
    return <p className="rounded-2xl border border-line bg-surface p-6 text-sm text-red-600">{error}</p>;
  }
  if (!data) {
    return <div className="h-72 animate-pulse rounded-2xl border border-line bg-surface/60" />;
  }

  const { plan, pending } = data;
  const canPayRenewal =
    plan && !pending && plan.planId && plan.planKind === "subscription" && plan.planPeriodEnd
      ? new Date(plan.planPeriodEnd) <= new Date()
      : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Langganan</h1>
          <p className="mt-1 text-sm text-fg-muted">Paket aktif, pulsa pesan, dan tagihan.</p>
        </div>
        {!pending && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent-bright">
            <CheckCircle size={14} weight="fill" /> Tenant aktif
          </span>
        )}
      </div>

      {/* Banner tenant pending */}
      {pending && (
        <div className="flex flex-col gap-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Warning size={22} weight="fill" className="mt-0.5 shrink-0 text-amber-200" />
            <div>
              <p className="font-display text-base font-semibold text-amber-100">Akunmu belum aktif</p>
              <p className="mt-1 text-sm text-amber-200/80">
                Pilih paket bulanan (Latte/Mocha) atau isi pulsa Espresso untuk mulai menggunakan Wavio.
              </p>
            </div>
          </div>
          <Link
            href={firstSubscriptionPlan ? `/checkout?plan=${firstSubscriptionPlan.id}` : "/checkout"}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.98]"
          >
            Aktivasi sekarang <ArrowRight size={15} weight="bold" />
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Kartu plan aktif */}
        <div className="rounded-2xl border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">Paket aktif</p>
            <CreditCard size={18} className="text-accent-bright" />
          </div>
          {plan?.planId ? (
            <>
              <div className="mt-3 flex flex-wrap items-baseline gap-3">
                <h2 className="font-display text-2xl font-semibold tracking-tight">{plan.planName}</h2>
                <span className="text-sm text-fg-muted">
                  {plan.planKind === "prepaid"
                    ? "Prepaid (per pesan)"
                    : plan.priceDisplay ?? (plan.priceMonthly != null ? `${rupiah(plan.priceMonthly)}/bulan` : "")}
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-line bg-ink-2 p-3">
                  <dt className="text-[11px] uppercase tracking-wider text-fg-faint">Device</dt>
                  <dd className="mt-1 font-display text-lg font-semibold">
                    {data.deviceCount}/{plan.maxDevices ?? "∞"}
                  </dd>
                </div>
                <div className="rounded-xl border border-line bg-ink-2 p-3">
                  <dt className="text-[11px] uppercase tracking-wider text-fg-faint">User</dt>
                  <dd className="mt-1 font-display text-lg font-semibold">{plan.maxUsers ?? "∞"}</dd>
                </div>
                <div className="rounded-xl border border-line bg-ink-2 p-3">
                  <dt className="text-[11px] uppercase tracking-wider text-fg-faint">Pesan/bln</dt>
                  <dd className="mt-1 font-display text-lg font-semibold">
                    {plan.planKind === "prepaid" ? "—" : plan.maxMessagesPerMonth != null ? plan.maxMessagesPerMonth.toLocaleString("id-ID") : "∞"}
                  </dd>
                </div>
              </dl>
              {plan.planPeriodEnd && (
                <p className="mt-4 text-xs text-fg-faint">
                  Periode berakhir: <span className="font-medium text-fg-muted">{new Date(plan.planPeriodEnd).toLocaleString("id-ID")}</span>
                  {canPayRenewal && (
                    <Link href={`/checkout?kind=renewal`} className="ml-2 font-semibold text-accent-bright hover:underline">
                      Perpanjang sekarang →
                    </Link>
                  )}
                </p>
              )}
            </>
          ) : (
            <p className="mt-4 text-sm text-fg-muted">
              Belum ada paket.{" "}
              <Link href={firstSubscriptionPlan ? `/checkout?plan=${firstSubscriptionPlan.id}` : "/checkout"} className="font-semibold text-accent-bright hover:underline">
                Pilih paket
              </Link>
              .
            </p>
          )}
        </div>

        {/* Saldo prepaid (Espresso) */}
        <div className="rounded-2xl border border-line bg-surface p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">Pulsa pesan</p>
            <Coins size={18} className="text-accent-bright" />
          </div>
          <p className="mt-3 font-display text-3xl font-semibold tracking-tight">
            {data.balance.toLocaleString("id-ID")}
            <span className="ml-1 text-base font-normal text-fg-faint">pesan</span>
          </p>
          <p className="mt-1 text-xs text-fg-faint">
            {rate > 0 ? `Top-up dari ${rupiah(data.catalog.settings.creditMinTopupRp)} (${minMessages} pesan @ ${rupiah(rate)})` : "Top-up saat saldo menipis."}
          </p>
          <button
            type="button"
            onClick={() => {
              setTopupMessages(minMessages);
              setTopupOpen(true);
            }}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.98]"
          >
            <Bank size={15} weight="bold" /> Top-up
          </button>

          {/* Addon mandiri */}
          {purchasableAddons.length > 0 && (
            <div className="mt-6 border-t border-line-soft pt-5">
              <p className="text-xs uppercase tracking-wider text-fg-faint">Add-on berbayar</p>
              <ul className="mt-3 space-y-2">
                {purchasableAddons.map((a) => (
                  <li key={a.key} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ink-2 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg">{a.name}</p>
                      <p className="text-xs text-fg-faint">{rupiah(a.priceMonthly!)}/bulan</p>
                    </div>
                    <Link
                      href={`/checkout?addon=${encodeURIComponent(a.key)}`}
                      className="shrink-0 rounded-full border border-line px-4 py-1.5 text-xs font-semibold text-fg transition-colors hover:border-accent/50 hover:text-accent-bright"
                    >
                      Beli
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Daftar order / tagihan */}
      <div className="rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold">Riwayat tagihan</h2>
        </div>
        {data.orders.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-fg-faint">Belum ada transaksi.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {data.orders.map((o) => {
              const expiredLocal = o.status === "pending" && o.expiresAt && new Date(o.expiresAt) <= new Date();
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{KIND_LABEL[o.kind] ?? o.kind}</p>
                    <p className="mt-0.5 text-xs text-fg-faint">
                      {new Date(o.createdAt).toLocaleString("id-ID")} · {rupiah(o.amount)}
                      {o.payMethod ? ` · ${o.payMethod}` : ""}
                    </p>
                  </div>
                  {expiredLocal ? <StatusBadge status="expired" /> : <StatusBadge status={o.status} />}
                  {o.status === "pending" && !expiredLocal && (
                    <Link
                      href={`/checkout?kind=renewal`}
                      className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-ink transition-all hover:bg-accent-bright"
                    >
                      Bayar Sekarang
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal top-up */}
      {topupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Top-up pulsa pesan</h3>
              <button type="button" onClick={() => setTopupOpen(false)} className="rounded-lg px-2 py-1 text-sm text-fg-faint hover:text-fg">
                ✕
              </button>
            </div>
            <label htmlFor="topup-messages" className="mt-5 mb-1.5 block text-sm font-medium text-fg">
              Jumlah pesan (min {minMessages})
            </label>
            <input
              id="topup-messages"
              type="number"
              min={minMessages}
              value={topupMessages}
              onChange={(e) => setTopupMessages(Math.max(1, Number.parseInt(e.target.value, 10) || 1))}
              className="min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <p className="mt-2 text-xs text-fg-faint">
              Total: <span className="font-semibold text-fg-muted">{rupiah(Math.max(minMessages, topupMessages) * rate)}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                setTopupOpen(false);
                router.push(`/checkout?topup=1&creditMessages=${Math.max(minMessages, topupMessages)}`);
              }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.98]"
            >
              <Lightbulb size={15} weight="fill" /> Lanjut ke pembayaran
            </button>
          </div>
        </div>
      )}
    </div>
  );
}