"use client";

import { useEffect, useState } from "react";
import { ArrowSquareOut, CheckCircle, Copy, Timer, Warning } from "@phosphor-icons/react";

export interface PayableOrder {
  id: string;
  kind: string;
  status: string;
  amount: number;
  payCode: string | null;
  checkoutUrl: string | null;
  payMethod: string | null;
  expiresAt: string | null;
  expiresInSec: number | null;
  paidAt: string | null;
}

interface Props {
  order: PayableOrder;
  /** Status paid dideteksi polling di halaman induk → panel tampil sukses. */
  paid?: boolean;
  /** Saat order sudah lewat batas bayar (expired). */
  expired?: boolean;
  onOpenCheckout?: (url: string) => void;
}

const METHOD_LABEL: Record<string, string> = {
  QRIS2: "QRIS",
  BRIVA: "Virtual Account BRI",
  BCAVA: "Virtual Account BCA",
  MANDIRIVA: "Virtual Account Mandiri",
  BNIVA: "Virtual Account BNI",
  ALFAMART: "Alfamart",
  DANA: "DANA",
  OVO: "OVO",
  SHOPEEPAY: "ShopeePay",
};

function fmtMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function PayCodePanel({ order, paid, expired, onOpenCheckout }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (paid || expired) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [paid, expired]);

  const expiresMs = order.expiresAt ? new Date(order.expiresAt).getTime() - now : 0;
  const methodName = METHOD_LABEL[order.payMethod ?? ""] ?? order.payMethod ?? "Transfer";

  const copyCode = async () => {
    if (!order.payCode) return;
    try {
      await navigator.clipboard.writeText(order.payCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard tidak tersedia */
    }
  };

  if (paid) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6 text-center">
        <CheckCircle size={36} weight="fill" className="mx-auto text-accent-bright" />
        <h3 className="mt-3 font-display text-lg font-semibold">Pembayaran diterima</h3>
        <p className="mt-1 text-sm text-fg-muted">Paket / saldo akan aktif otomatis. Mengalihkan ke dashboard…</p>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center">
        <Warning size={32} weight="fill" className="mx-auto text-amber-300" />
        <h3 className="mt-3 font-display text-lg font-semibold">Order kedaluwarsa</h3>
        <p className="mt-1 text-sm text-fg-muted">Batas waktu pembayaran lewat. Buat order baru untuk melanjutkan.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
        <div className="flex items-center gap-2">
          <Timer size={18} className="text-accent-bright" weight="fill" />
          <span className="text-sm font-semibold">Menunggu pembayaran {methodName}</span>
        </div>
        <span className="rounded-full bg-ink-2 px-3 py-1 font-mono text-xs tabular-nums text-amber-200">
          {expiresMs > 0 ? fmtMs(expiresMs) : "—"}
        </span>
      </div>

      <div className="space-y-5 p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-fg-faint">Total tagihan</p>
            <p className="mt-1 font-display text-3xl font-semibold tracking-tight">
              Rp {order.amount.toLocaleString("id-ID")}
            </p>
          </div>
          {order.payCode && (
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-fg-faint">Kode bayar</p>
              <button
                type="button"
                onClick={copyCode}
                className="mt-1 inline-flex max-w-full items-center gap-2 rounded-xl border border-accent/30 bg-ink-2 px-4 py-2.5 font-mono text-lg font-semibold tracking-widest text-accent-bright transition-colors hover:border-accent/60"
              >
                <span className="truncate">{order.payCode}</span>
                {copied ? <CheckCircle size={16} weight="fill" /> : <Copy size={16} />}
              </button>
              <p className="mt-1 text-[11px] text-fg-faint">Klik untuk menyalin kode</p>
            </div>
          )}
        </div>

        {order.checkoutUrl && (
          <button
            type="button"
            onClick={() => onOpenCheckout?.(order.checkoutUrl!)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.98]"
          >
            Bayar sekarang di {methodName}
            <ArrowSquareOut size={15} weight="bold" />
          </button>
        )}

        <p className="text-xs leading-relaxed text-fg-faint">
          Halaman ini memeriksa status otomatis tiap 5 detik. Setelah membayar, kamu juga bisa menekan{" "}
          <span className="font-semibold text-fg-muted">“Saya sudah bayar”</span> di bawah untuk pengecekan manual.
        </p>
      </div>
    </div>
  );
}
