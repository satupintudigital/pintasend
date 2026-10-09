"use client";

import { useState } from "react";
import { PaperPlaneTilt, SpinnerGap, X } from "@phosphor-icons/react";
import type { DeviceHealthItem } from "@/lib/dashboard";

const fieldClass =
  "min-h-11 w-full rounded-xl border border-line bg-ink-2 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line px-3.5 py-2.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50";

export function QuickSendModal({
  devices,
  isOpen,
  onClose,
}: {
  devices: DeviceHealthItem[];
  isOpen: boolean;
  onClose: () => void;
}) {
  const readyDevices = devices.filter((d) => d.status === "ready");
  const [deviceId, setDeviceId] = useState(readyDevices[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!isOpen) return null;

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim() || !message.trim() || !deviceId) return;
    setSending(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          phone: phone.trim(),
          message: message.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengirim pesan");
      setSuccess("Pesan berhasil dikirim!");
      setPhone("");
      setMessage("");
      setTimeout(() => {
        onClose();
        setSuccess("");
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pesan");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-fg">Kirim Pesan Cepat</h2>
            <p className="text-xs text-fg-muted">Kirim pesan teks instan melalui device aktif.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-fg-faint hover:bg-surface-2 hover:text-fg">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300">
            {success}
          </div>
        )}

        {readyDevices.length === 0 ? (
          <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-center text-xs text-amber-300">
            Tidak ada perangkat WhatsApp dengan status <span className="font-semibold">ready</span>. Hubungkan
            perangkat di menu Device terlebih dahulu.
          </div>
        ) : (
          <form onSubmit={handleSend} className="mt-4 space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Pilih Perangkat</label>
              <select
                className={fieldClass}
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                required
              >
                {readyDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} ({d.phone || "No phone"})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Nomor Tujuan</label>
              <input
                className={fieldClass}
                placeholder="628123456789 / 08123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-fg-muted">Isi Pesan</label>
              <textarea
                className={`${fieldClass} min-h-[90px] py-2`}
                placeholder="Tulis pesan..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={btnGhost} onClick={onClose} disabled={sending}>
                Batal
              </button>
              <button type="submit" className={btnPrimary} disabled={sending || !phone || !message}>
                {sending ? (
                  <>
                    <SpinnerGap size={16} className="animate-spin" /> Mengirim…
                  </>
                ) : (
                  <>
                    <PaperPlaneTilt size={16} weight="bold" /> Kirim Sekarang
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
