"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle, DownloadSimple, PlusCircle, Prohibit } from "@phosphor-icons/react";

interface InvoiceRow {
  id: string;
  tenantId: string;
  tenantName: string;
  planId: string | null;
  planName: string;
  priceMonthly: number | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
}

const PAGE_SIZE = 25;

const STATUS_BADGE: Record<string, string> = {
  issued: "bg-blue-50 text-blue-700 border border-blue-200",
  paid: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  void: "bg-amber-50 text-amber-700 border border-amber-200",
};

function fmtRp(v: number | null): string {
  if (v === null) return "Gratis";
  return `Rp ${v.toLocaleString("id-ID")}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
  });
}

export function InvoicesTable() {
  const router = useRouter();
  const sp = useSearchParams();
  const status = sp.get("status") ?? "";
  const tenantId = sp.get("tenantId") ?? "";
  const year = sp.get("year") ?? "";
  const month = sp.get("month") ?? "";
  const page = Math.max(1, Number(sp.get("page") ?? "1"));

  const [data, setData] = useState<{ invoices: InvoiceRow[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (tenantId) params.set("tenantId", tenantId);
  if (year) params.set("year", year);
  if (month) params.set("month", month);
  params.set("page", String(page));
  params.set("limit", String(PAGE_SIZE));
  const queryString = params.toString();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/platform/invoices?${queryString}`)
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Gagal memuat");
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  function push(next: Record<string, string>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, tenantId, year, month, ...next })) {
      if (v) p.set(k, v);
    }
    router.push(`/platform/invoices?${p.toString()}`);
  }

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  async function generate() {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/platform/invoices/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ year: curYear, month: curMonth }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Gagal generate");
      setStatusMsg({
        ok: true,
        msg: `${d.created} invoice dibuat, ${d.skipped} di-skip (sudah ada / tanpa plan).`,
      });
      push({ year: String(curYear), month: String(curMonth) });
    } catch (e) {
      setStatusMsg({ ok: false, msg: e instanceof Error ? e.message : "Gagal generate" });
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "void" | "mark_paid") {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/platform/invoices/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Gagal");
      setStatusMsg({
        ok: true,
        msg: action === "mark_paid" ? "Invoice ditandai lunas." : "Invoice dibatalkan (void).",
      });
      // Refresh halaman tetap — ganti page key.
      router.push(`/platform/invoices?${queryString}&t=${Date.now()}`);
    } catch (e) {
      setStatusMsg({ ok: false, msg: e instanceof Error ? e.message : "Gagal" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: filter + generate */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            push({
              status: String(fd.get("status") ?? ""),
              tenantId: String(fd.get("tenantId") ?? "").trim(),
              year: String(fd.get("year") ?? ""),
              month: String(fd.get("month") ?? ""),
            });
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <select
            name="status"
            defaultValue={status}
            className="rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm text-fg focus:outline-none"
          >
            <option value="">Semua status</option>
            <option value="issued">Issued</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
          <input
            name="tenantId"
            defaultValue={tenantId}
            placeholder="Tenant ID"
            className="rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <input
            name="year"
            defaultValue={year}
            type="number"
            min={2020}
            max={2100}
            placeholder="Tahun"
            className="w-24 rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <select
            name="month"
            defaultValue={month}
            className="rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm text-fg focus:outline-none"
          >
            <option value="">Bulan</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
          >
            Filter
          </button>
        </form>

        <div className="flex items-center gap-2">
          <a
            href={`/api/platform/invoices/export?${queryString}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
          >
            <DownloadSimple size={14} />
            Export CSV
          </a>
          <button
            onClick={generate}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-bright disabled:opacity-50"
          >
            <PlusCircle size={14} />
            Generate bulan ini ({curMonth}/{curYear})
          </button>
        </div>
      </div>

      {statusMsg && (
        <p className={`text-sm ${statusMsg.ok ? "text-emerald-600" : "text-red-600"}`}>
          {statusMsg.msg}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="text-sm text-fg-faint">Memuat…</p>}

      {data && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line-soft text-xs uppercase tracking-wider text-fg-faint">
                <th className="px-4 py-3">Periode</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3 text-right">Nominal</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-fg-faint">
                    Belum ada invoice. Klik “Generate bulan ini” untuk membuat
                    tagihan tenant ber-plan.
                  </td>
                </tr>
              )}
              {data.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-line-soft last:border-0 hover:bg-surface-2/40">
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-fg">
                    {fmtDate(inv.periodStart)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-fg">{inv.tenantName || "—"}</p>
                    <p className="font-mono text-xs text-fg-faint">{inv.tenantId}</p>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{inv.planName}</td>
                  <td className="px-4 py-3 text-right font-medium text-fg">
                    {fmtRp(inv.priceMonthly)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[inv.status] ?? "bg-ink-2 text-fg-muted"}`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {inv.status === "issued" && (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => act(inv.id, "mark_paid")}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle size={12} />
                          Lunas
                        </button>
                        <button
                          onClick={() => act(inv.id, "void")}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-2 disabled:opacity-50"
                        >
                          <Prohibit size={12} />
                          Void
                        </button>
                      </div>
                    )}
                    {inv.status === "paid" && inv.paidAt && (
                      <span className="text-xs text-fg-faint">
                        Lunas {new Date(inv.paidAt).toLocaleDateString("id-ID")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-end gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
            .map((n, idx, arr) => {
              const prev = arr[idx - 1];
              return (
                <span key={n} className="flex items-center gap-1">
                  {prev !== undefined && n - prev > 1 && (
                    <span className="px-1 text-fg-faint">…</span>
                  )}
                  <button
                    onClick={() => push({ page: String(n) })}
                    className={`h-8 min-w-8 rounded-lg px-2 text-xs font-medium transition-colors ${
                      n === page ? "bg-accent text-accent-ink" : "text-fg-muted hover:bg-surface-2"
                    }`}
                  >
                    {n}
                  </button>
                </span>
              );
            })}
        </div>
      )}
    </div>
  );
}
