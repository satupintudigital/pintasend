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
            qrShown = true;
            const qrRes = await fetch(`/api/devices/${deviceId}/qr`);
            const qrData = await qrRes.json();
            if (qrRes.ok && qrData.qrCode) {
              setAddState((s) => (s.phase === "qr" ? { ...s, qr: qrData.qrCode } : s));
            }
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

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Device</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Hubungkan nomor WhatsApp Anda dengan memindai QR. Setiap device = 1 nomor WA.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadDevices}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
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
            className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={16} weight="bold" />
            Tambah Device
          </button>
        </div>
      </div>

      {pageError && (
        <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {pageError}
        </p>
      )}

      <div className="mt-8">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-fg-faint">
            <SpinnerGap size={18} className="animate-spin" />
            <span className="text-sm">Memuat device…</span>
          </div>
        ) : devices.length === 0 ? (
          <div className="rounded-3xl border border-line bg-surface p-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <DeviceMobile size={28} />
            </div>
            <h2 className="mt-6 text-lg font-semibold tracking-tight">Belum ada device</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
              Tambahkan device pertama Anda untuk mulai menerima dan mengirim pesan WhatsApp.
            </p>
            <button
              onClick={() => {
                setAddState({ phase: "form" });
                setAddOpen(true);
              }}
              className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus size={16} weight="bold" />
              Tambah Device
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {devices.map((d) => {
              const info = statusInfo(d.status);
              const isReady = d.status === "ready";
              return (
                <div
                  key={d.id}
                  className="group rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-line-strong"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-fg-muted">
                        <DeviceMobile size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-fg">{d.label}</p>
                        <p className="mt-0.5 text-xs text-fg-faint">ID {d.openwaSessionId.slice(0, 8)}…</p>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-fg-muted">
                      <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} />
                      {info.label}
                    </span>
                  </div>

                  {isReady ? (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300">
                      <Phone size={15} />
                      <span className="truncate font-medium">{d.phone ?? "Nomor tidak tersedia"}</span>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-fg-faint">
                      Terdaftar {formatDate(d.createdAt)}
                    </p>
                  )}

                  <div className="mt-4 flex gap-2 border-t border-line-soft pt-4">
                    {!isReady ? (
                      <button
                        onClick={() => deviceAction(d.id, "start")}
                        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-surface-2 text-sm text-fg transition-colors hover:bg-accent/10 hover:text-accent"
                      >
                        <Power size={14} />
                        Mulai
                      </button>
                    ) : (
                      <button
                        onClick={() => deviceAction(d.id, "logout")}
                        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-surface-2 text-sm text-fg transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Power size={14} />
                        Logout
                      </button>
                    )}
                    <button
                      onClick={() => deleteDevice(d.id, d.label)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-red-500/10 hover:text-red-400"
                      aria-label={`Hapus ${d.label}`}
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={closeAdd}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {addState.phase === "form" && (
              <>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">Tambah Device</h2>
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
                      className="min-h-12 w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
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
                    <h2 className="text-lg font-semibold tracking-tight">Scan QR</h2>
                    <p className="mt-1 text-sm text-fg-muted">
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
                    <div className="rounded-2xl border border-line bg-white p-3">
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
                    <div className="flex h-60 w-60 flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface-2 text-fg-faint">
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
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                  <CheckCircle size={28} weight="fill" />
                </div>
                <h2 className="mt-5 text-lg font-semibold tracking-tight">Tersambung!</h2>
                <p className="mt-2 text-sm text-fg-muted">
                  Device <span className="font-medium text-fg">{addState.device.label}</span> siap dipakai.
                </p>
                {addState.device.phone && (
                  <p className="mt-2 text-sm text-emerald-300">{addState.device.phone}</p>
                )}
                <button
                  onClick={closeAdd}
                  className="mt-6 w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink"
                >
                  Selesai
                </button>
              </div>
            )}

            {addState.phase === "error" && (
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
                  <Warning size={28} weight="fill" />
                </div>
                <h2 className="mt-5 text-lg font-semibold tracking-tight">Gagal</h2>
                <p className="mt-2 text-sm text-fg-muted">{addState.message}</p>
                <button
                  onClick={closeAdd}
                  className="mt-6 w-full rounded-full border border-line bg-surface-2 px-5 py-3 text-sm font-semibold text-fg transition-colors hover:bg-surface"
                >
                  Tutup
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
