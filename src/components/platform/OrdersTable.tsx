"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwise, CheckCircle, HandCoins, Warning } from "@phosphor-icons/react";
import type { PlatformOrderRow } from "@/lib/platform";

interface Props {
  initial: PlatformOrderRow[];
}

const KIND_LABEL: Record<string, string> = {
  first_subscription: "Paket pertama",
  renewal_subscription: "Perpanjangan",
  addon: "Add-on",
  topup: "Top-up",
};

const STATUS_FILTERS = ["semua", "pending", "paid", "expired", "cancelled"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function statusBadge(status: string): string {
  switch (status) {
    case "paid":
      return "bg-accent/10 text-accent-bright border-accent/20";
    case "pending":
      return "bg-amber-300/10 text-amber-200 border-amber-300/20";
    case "expired":
      return "bg-red-300/10 text-red-300 border-red-300/20";
    default:
      return "bg-ink-2 text-fg-faint border-line";
  }
}

export function OrdersTable({ initial }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState(initial);
  const [filter, setFilter] = useState<StatusFilter>("semua");
  const [syncing, setSyncing] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function resync() {
    setSyncing(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/billing/sync", { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as {
        expired?: number;
        paid?: number;
        expiredFromGateway?: number;
        stillPending?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(d.error ?? "Sinkronisasi gagal");
      setFeedback({
        ok: true,
        msg: `Resync: ${d.paid ?? 0} lunas, ${d.expiredFromGateway ?? 0} expired lokal, ${d.expired ?? 0} expired by waktu, ${d.stillPending ?? 0} masih pending.`,
      });
      router.refresh();
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Sinkronisasi gagal" });
    } finally {
      setSyncing(false);
    }
  }

  // Tandai order pending lunas secara manual (rekonsiliasi tanpa gateway) —
  // efek per kind (aktivasi tenant / grant addon / isi kredit) dijalankan oleh
  // finalizePaidOrder yang sama dgn callback Tripay.
  async function markPaid(order: (typeof orders)[number]) {
    if (!window.confirm(`Tandai order ${order.id.slice(0, 8)}… (${order.tenantName}) lunas secara manual?\n\nEfeknya sama dgn pembayaran Tripay sukses: tenant diaktifkan / addon di-grant / kredit diisi.`)) {
      return;
    }
    setFeedback(null);
    try {
      const res = await fetch(`/api/platform/orders/${order.id}/mark-paid`, { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Gagal menandai lunas");
      setOrders((os) =>
        os.map((o) =>
          o.id === order.id ? { ...o, status: "paid", paidAt: new Date().toISOString() } : o,
        ),
      );
      setFeedback({ ok: true, msg: `Order ${order.id.slice(0, 8)}… ditandai lunas — tenant diproses.` });
      router.refresh();
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Gagal menandai lunas" });
    }
  }

  const visible = orders.filter((o) => filter === "semua" || o.status === filter);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filter === f ? "bg-accent text-accent-ink" : "bg-ink-2 text-fg-muted hover:text-fg"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={resync}
          disabled={syncing}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.97] disabled:opacity-50"
        >
          <ArrowClockwise size={14} weight="bold" className={syncing ? "animate-spin" : ""} />
          {syncing ? "Menyinkronkan…" : "Resync Tripay"}
        </button>
      </div>

      {feedback && (
        <p className={`flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-xs ${feedback.ok ? "text-accent-bright" : "text-red-600"}`}>
          {feedback.ok ? <CheckCircle size={14} weight="fill" /> : <Warning size={14} weight="fill" />}
          {feedback.msg}
        </p>
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line-soft text-xs uppercase tracking-wider text-fg-faint">
            <th className="px-4 py-3">Tenant</th>
            <th className="px-4 py-3">Jenis</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Jumlah</th>
            <th className="px-4 py-3">Metode</th>
            <th className="px-4 py-3">Dibuat</th>
            <th className="px-4 py-3">Lunas</th>
            <th className="px-4 py-3 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-sm text-fg-faint">
                Tidak ada order{filter !== "semua" ? ` berstatus ${filter}` : ""}.
              </td>
            </tr>
          ) : (
            visible.map((o) => (
              <tr key={o.id} className="border-b border-line-soft/60 last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-fg">{o.tenantName}</p>
                  <p className="font-mono text-[10px] text-fg-faint">{o.id.slice(0, 8)}…</p>
                </td>
                <td className="px-4 py-3 text-fg-muted">{KIND_LABEL[o.kind] ?? o.kind}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusBadge(o.status)}`}>
                    {o.status}
                  </span>
                </td>
                <td className="bk-tabular px-4 py-3 text-right font-medium text-fg">
                  Rp {o.amount.toLocaleString("id-ID")}
                </td>
                <td className="px-4 py-3 text-xs text-fg-muted">{o.payMethod ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-fg-faint">
                  {new Date(o.createdAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                </td>
                <td className="px-4 py-3 text-xs text-fg-faint">
                  {o.paidAt ? new Date(o.paidAt).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" }) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {o.status === "pending" ? (
                    <button
                      type="button"
                      onClick={() => markPaid(o)}
                      title="Rekonsiliasi manual: tandai lunas tanpa gateway (transfer manual / Tripay down)"
                      className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs font-semibold text-accent-bright transition-all hover:bg-accent hover:text-accent-ink active:scale-[0.97]"
                    >
                      <HandCoins size={13} weight="bold" />
                      Tandai lunas
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="border-t border-line-soft px-4 py-3 text-xs text-fg-faint">
        Menampilkan 200 order terbaru. Status diperbarui via callback Tripay & tombol Resync.
      </p>
    </div>
  );
}