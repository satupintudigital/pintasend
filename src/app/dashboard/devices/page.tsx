"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  Trash,
  Power,
  ArrowClockwise,
  DeviceMobile,
  CheckCircle,
  Warning,
  SpinnerGap,
  Phone,
  X,
} from "@phosphor-icons/react";
import { Spotlight } from "@/components/Spotlight";

interface Device {
  id: string;
  tenantId: string;
  label: string;
  openwaSessionId: string;
  phone: string | null;
  status: string;
  createdAt: string;
}

type AddState =
  | { phase: "form" }
  | { phase: "qr"; device: Device; qr?: string }
  | { phase: "done"; device: Device }
  | { phase: "error"; message: string };

const PAIR_TIMEOUT_MS = 180_000;

function statusInfo(status: string): { label: string; dot: string } {
  switch (status) {
    case "ready":
      return { label: "Tersambung", dot: "bg-emerald-500" };
    case "qr_ready":
      return { label: "Menunggu scan", dot: "bg-amber-400" };
    case "initializing":
      return { label: "Menyiapkan…", dot: "bg-amber-400" };
    case "authenticating":
      return { label: "Menautkan…", dot: "bg-amber-400" };
    case "created":
      return { label: "Dibuat", dot: "bg-zinc-500" };
    case "disconnected":
      return { label: "Terputus", dot: "bg-zinc-500" };
    case "action_required":
      return { label: "Aksi diperlukan", dot: "bg-orange-500" };
    case "failed":
      return { label: "Gagal", dot: "bg-red-500" };
    default:
      return { label: status, dot: "bg-zinc-500" };
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function DeviceSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-surface-2" />
          <div className="space-y-2">
            <div className="h-3.5 w-28 animate-pulse rounded bg-surface-2" />
            <div className="h-2.5 w-20 animate-pulse rounded bg-line-soft" />
          </div>
        </div>
        <div className="h-6 w-24 animate-pulse rounded-full bg-surface-2" />
      </div>
      <div className="mt-4 h-9 animate-pulse rounded-xl bg-surface-2" />
      <div className="mt-4 flex gap-2 border-t border-line-soft pt-4">
        <div className="h-9 flex-1 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-9 w-9 animate-pulse rounded-lg bg-surface-2" />
      </div>
    </div>
  );
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addState, setAddState] = useState<AddState>({ phase: "form" });
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/devices");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat device");
      setDevices(data.devices ?? []);
      setPageError("");
    } catch (e) {
      setPageError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/devices");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Gagal memuat device");
        if (!cancelled) {
          setDevices(data.devices ?? []);
          setPageError("");
        }
      } catch (e) {
        if (!cancelled) setPageError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pollPairing = useCallback(
    (deviceId: string) => {
      stopPolling();
      const startedAt = Date.now();
      let qrShown = false;
      timerRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/devices/${deviceId}`);
          const data = await res.json();
          const status: string | undefined = data.device?.status;

          if (status === "qr_ready" && !qrShown) {
            const qrRes = await fetch(`/api/devices/${deviceId}/qr`);
            const qrData = await qrRes.json().catch(() => ({}));
            if (qrRes.ok && qrData.qrCode) {
              qrShown = true;
              setAddState((s) => (s.phase === "qr" ? { ...s, qr: qrData.qrCode } : s));
            }
            // Gagal transient → qrShown tetap false, coba lagi di polling berikutnya.
          } else if (status === "ready") {
            stopPolling();
            setAddState({ phase: "done", device: data.device });
            loadDevices();
          } else if (status === "failed" || status === "action_required") {
            stopPolling();
            setAddState({ phase: "error", message: `Device berhenti dengan status "${status}". Coba mulai ulang.` });
            loadDevices();
          } else if (Date.now() - startedAt > PAIR_TIMEOUT_MS) {
            stopPolling();
            setAddState({ phase: "error", message: "Waktu pairing habis. Tutup lalu mulai ulang device." });
          }
        } catch {
          // error transient — biarkan polling lanjut
        }
      }, 2500);
    },
    [loadDevices, stopPolling],
  );

  const closeAdd = useCallback(() => {
    stopPolling();
    setAddOpen(false);
    setAddState({ phase: "form" });
    setLabel("");
  }, [stopPolling]);

  async function createDevice(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat device");

      const device: Device = data.device;
      const startRes = await fetch(`/api/devices/${device.id}/start`, { method: "POST" });
      if (!startRes.ok) {
        const startData = await startRes.json().catch(() => ({}));
        throw new Error(startData.error ?? "Gagal memulai session");
      }

      setAddState({ phase: "qr", device });
      loadDevices();
      pollPairing(device.id);
    } catch (err) {
      setAddState({ phase: "error", message: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  async function deviceAction(id: string, action: "start" | "logout") {
    try {
      await fetch(`/api/devices/${id}/${action}`, { method: "POST" });
      loadDevices();
    } catch {
      /* noop */
    }
  }

  async function deleteDevice(id: string, label: string) {
    if (!window.confirm(`Hapus device "${label}"? Nomor WhatsApp akan ter-logout dari Wavio.`)) return;
    try {
      await fetch(`/api/devices/${id}`, { method: "DELETE" });
      loadDevices();
    } catch {
      /* noop */
    }
  }

  const connectedCount = devices.filter((d) => d.status === "ready").length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Device</p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Device WhatsApp
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            Hubungkan nomor WhatsApp Anda dengan memindai QR. Setiap device = 1 nomor WA.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadDevices}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm text-fg-muted transition-colors hover:border-accent/40 hover:text-fg active:scale-[0.97]"
            aria-label="Muat ulang"
          >
            <ArrowClockwise size={16} />
            <span className="hidden sm:inline">Muat ulang</span>
          </button>
          <button
            onClick={() => {
              setAddState({ phase: "form" });
              setAddOpen(true);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-[0_0_28px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.97]"
          >
            <Plus size={16} weight="bold" />
            Tambah Device
          </button>
        </div>
      </div>

      {pageError && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
          {pageError}
        </p>
      )}

      <div className="mt-8">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DeviceSkeleton />
            <DeviceSkeleton />
            <DeviceSkeleton />
          </div>
        ) : devices.length === 0 ? (
          <div className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-16 text-center">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" />
              <div className="absolute left-1/2 top-1/2 h-[260px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[100px]" />
            </div>
            <div className="relative">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent-bright shadow-[0_0_40px_-12px_rgba(16,185,129,0.7)]">
                <DeviceMobile size={28} />
              </div>
              <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
                Belum ada device
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">
                Mulai dengan device pertamamu
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">
                Tambahkan device untuk mulai menerima dan mengirim pesan WhatsApp dari aplikasimu.
              </p>
              <button
                onClick={() => {
                  setAddState({ phase: "form" });
                  setAddOpen(true);
                }}
                className="mt-7 inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.98]"
              >
                <Plus size={16} weight="bold" />
                Tambah Device
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="bk-tabular mb-4 font-mono text-xs text-fg-faint">
              {devices.length} device · {connectedCount} tersambung
            </p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {devices.map((d) => {
                const info = statusInfo(d.status);
                const isReady = d.status === "ready";
                return (
                  <Spotlight
                    key={d.id}
                    className="group rounded-2xl border border-line bg-surface p-5 transition-colors duration-300 hover:border-accent/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-soft bg-surface-2 text-fg-muted">
                          <DeviceMobile size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-fg">{d.label}</p>
                          <p className="bk-tabular mt-0.5 font-mono text-xs text-fg-faint">
                            ID {d.openwaSessionId.slice(0, 8)}…
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-ink-2 px-2.5 py-1 text-xs text-fg-muted">
                        <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} />
                        {info.label}
                      </span>
                    </div>

                    {isReady ? (
                      <div className="bk-tabular mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-3 py-2 font-mono text-sm text-emerald-300">
                        <Phone size={15} />
                        <span className="truncate font-medium">{d.phone ?? "Nomor tidak tersedia"}</span>
                      </div>
                    ) : (
                      <p className="bk-tabular mt-4 font-mono text-xs text-fg-faint">
                        Terdaftar {formatDate(d.createdAt)}
                      </p>
                    )}

                    <div className="mt-4 flex gap-2 border-t border-line-soft pt-4">
                      {!isReady ? (
                        <button
                          onClick={() => deviceAction(d.id, "start")}
                          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-surface-2 text-sm text-fg transition-colors hover:bg-accent/10 hover:text-accent-bright active:scale-[0.98]"
                        >
                          <Power size={14} />
                          Mulai
                        </button>
                      ) : (
                        <button
                          onClick={() => deviceAction(d.id, "logout")}
                          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-surface-2 text-sm text-fg transition-colors hover:bg-red-500/10 hover:text-red-400 active:scale-[0.98]"
                        >
                          <Power size={14} />
                          Logout
                        </button>
                      )}
                      <button
                        onClick={() => deleteDevice(d.id, d.label)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-red-500/10 hover:text-red-400 active:scale-[0.98]"
                        aria-label={`Hapus ${d.label}`}
                      >
                        <Trash size={15} />
                      </button>
                    </div>
                  </Spotlight>
                );
              })}
            </div>
          </>
        )}
      </div>

      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={closeAdd}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
            <div className="p-6 md:p-7">
              {addState.phase === "form" && (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
                        Device baru
                      </p>
                      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
                        Tambah Device
                      </h2>
                      <p className="mt-1 text-sm text-fg-muted">Beri nama untuk device ini.</p>
                    </div>
                    <button onClick={closeAdd} className="text-fg-faint transition-colors hover:text-fg" aria-label="Tutup">
                      <X size={18} />
                    </button>
                  </div>
                  <form onSubmit={createDevice} className="mt-6 space-y-4">
                    <div>
                      <label htmlFor="device-label" className="mb-1.5 block text-sm font-medium text-fg">
                        Label
                      </label>
                      <input
                        id="device-label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="mis. HP Kasir, WA Marketing, CS 1"
                        maxLength={50}
                        required
                        autoFocus
                        className="min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-sm text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.99] disabled:opacity-50"
                    >
                      {submitting ? "Membuat…" : "Buat Device"}
                    </button>
                  </form>
                </>
              )}

              {addState.phase === "qr" && (
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
                        Langkah 2 dari 2
                      </p>
                      <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">Scan QR</h2>
                      <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                        Buka <span className="font-medium text-fg">WhatsApp</span> di HP Anda, lalu{" "}
                        <span className="font-medium text-fg">Menu › Perangkat Tertaut › Tautkan Perangkat</span>.
                      </p>
                    </div>
                    <button onClick={closeAdd} className="text-fg-faint transition-colors hover:text-fg" aria-label="Tutup">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="mt-6 flex justify-center">
                    {addState.qr ? (
                      <div className="rounded-2xl border border-line bg-white p-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={addState.qr}
                          alt="QR code WhatsApp"
                          width={260}
                          height={260}
                          className="h-60 w-60 object-contain"
                        />
                      </div>
                    ) : (
                      <div className="flex h-60 w-60 flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-ink-2 text-fg-faint">
                        <SpinnerGap size={26} className="animate-spin text-accent" />
                        <p className="text-xs">Menyiapkan QR…</p>
                      </div>
                    )}
                  </div>

                  <p className="mt-4 text-center text-xs text-fg-faint">
                    Status dipantau otomatis — halaman akan memperbarui saat tersambung.
                  </p>
                </>
              )}

              {addState.phase === "done" && (
                <div className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 shadow-[0_0_40px_-12px_rgba(16,185,129,0.7)]">
                    <CheckCircle size={28} weight="fill" />
                  </div>
                  <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
                    Berhasil
                  </p>
                  <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">Tersambung!</h2>
                  <p className="mt-2 text-sm text-fg-muted">
                    Device <span className="font-medium text-fg">{addState.device.label}</span> siap dipakai.
                  </p>
                  {addState.device.phone && (
                    <p className="bk-tabular mt-2 font-mono text-sm text-emerald-300">{addState.device.phone}</p>
                  )}
                  <button
                    onClick={closeAdd}
                    className="mt-7 w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.99]"
                  >
                    Selesai
                  </button>
                </div>
              )}

              {addState.phase === "error" && (
                <div className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-400">
                    <Warning size={28} weight="fill" />
                  </div>
                  <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-red-400">
                    Gagal
                  </p>
                  <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">Terjadi masalah</h2>
                  <p className="mt-2 text-sm text-fg-muted">{addState.message}</p>
                  <button
                    onClick={closeAdd}
                    className="mt-7 w-full rounded-full border border-line bg-surface-2 px-5 py-3 text-sm font-semibold text-fg transition-colors hover:border-red-500/30 hover:text-red-400"
                  >
                    Tutup
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
