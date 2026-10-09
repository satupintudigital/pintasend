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
  MagnifyingGlass,
  QrCode,
  PaperPlaneTilt,
  Info,
  ShieldCheck,
} from "@phosphor-icons/react";
import { Spotlight } from "@/components/Spotlight";
import { QuickSendModal } from "@/components/dashboard/QuickSendModal";

interface Device {
  id: string;
  tenantId: string;
  label: string;
  openwaSessionId: string;
  phone: string | null;
  restriction: string | null;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

interface RestrictionInfo {
  kind: string;
  code: string;
  expiresAt: string | null;
  label: string;
}

function restrictionInfo(raw: string | null): RestrictionInfo | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { kind?: unknown; code?: unknown; expiresAt?: unknown };
    if (!o || typeof o.kind !== "string" || !o.kind) return null;
    const kind = o.kind;
    const label =
      kind === "reachout_timelock"
        ? "Time-lock jangkauan"
        : kind === "tos_block"
          ? "Blokir ToS WhatsApp"
          : kind === "proxy_block"
            ? "Proxy diblokir"
            : kind;
    return {
      kind,
      code: typeof o.code === "string" ? o.code : "",
      expiresAt: typeof o.expiresAt === "string" ? o.expiresAt : null,
      label,
    };
  } catch {
    return null;
  }
}

type AddState =
  | { phase: "form" }
  | { phase: "qr"; device: Device; qr?: string }
  | { phase: "done"; device: Device }
  | { phase: "error"; message: string };

const PAIR_TIMEOUT_MS = 180_000;

function statusInfo(status: string): { label: string; dot: string; badgeCls: string } {
  switch (status) {
    case "ready":
      return {
        label: "Tersambung",
        dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]",
        badgeCls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
      };
    case "qr_ready":
      return {
        label: "Menunggu Scan",
        dot: "bg-amber-400 animate-pulse",
        badgeCls: "border-amber-500/25 bg-amber-500/10 text-amber-300",
      };
    case "initializing":
    case "authenticating":
      return {
        label: "Menghubungkan…",
        dot: "bg-amber-400",
        badgeCls: "border-amber-500/25 bg-amber-500/10 text-amber-300",
      };
    case "action_required":
      return {
        label: "Aksi Diperlukan",
        dot: "bg-orange-500",
        badgeCls: "border-orange-500/25 bg-orange-500/10 text-orange-300",
      };
    case "failed":
      return {
        label: "Gagal",
        dot: "bg-red-500",
        badgeCls: "border-red-500/25 bg-red-500/10 text-red-300",
      };
    case "disconnected":
    default:
      return {
        label: "Terputus",
        dot: "bg-zinc-500",
        badgeCls: "border-line-soft bg-surface-2 text-fg-muted",
      };
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [addState, setAddState] = useState<AddState>({ phase: "form" });
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [quickSendOpen, setQuickSendOpen] = useState(false);
  const [quickSendDevice, setQuickSendDevice] = useState<Device | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const loadDevices = useCallback(async () => {
    setLoading(true);
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
    loadDevices();
    return () => {
      clearInterval(timerRef.current as NodeJS.Timeout);
    };
  }, [loadDevices]);

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
              loadDevices();
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
          // ignore transient error
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

  async function deleteDevice(id: string, deviceLabel: string) {
    if (!window.confirm(`Hapus device "${deviceLabel}"? Nomor WhatsApp akan ter-logout dari PintaSend.`)) return;
    try {
      await fetch(`/api/devices/${id}`, { method: "DELETE" });
      loadDevices();
    } catch {
      /* noop */
    }
  }

  const readyCount = devices.filter((d) => d.status === "ready").length;
  const qrCount = devices.filter((d) => d.status === "qr_ready").length;
  const offlineCount = devices.length - readyCount - qrCount;

  const filteredDevices = devices.filter((d) => {
    const matchSearch =
      !search.trim() ||
      d.label.toLowerCase().includes(search.toLowerCase()) ||
      (d.phone && d.phone.includes(search.trim()));
    const matchStatus =
      !statusFilter ||
      (statusFilter === "ready" && d.status === "ready") ||
      (statusFilter === "qr_ready" && d.status === "qr_ready") ||
      (statusFilter === "offline" && d.status !== "ready" && d.status !== "qr_ready");
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
              <DeviceMobile size={20} weight="bold" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-fg md:text-3xl">
                Device WhatsApp
              </h1>
              <p className="text-xs text-fg-muted">
                Kelola multi-nomor WhatsApp aktif, status sinkronisasi, dan pairing QR.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadDevices}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-xs text-fg-muted transition-colors hover:text-fg hover:border-line-strong"
          >
            <ArrowClockwise size={14} className={loading ? "animate-spin text-accent" : ""} />
            <span>Muat Ulang</span>
          </button>
          <button
            onClick={() => {
              setAddState({ phase: "form" });
              setAddOpen(true);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-accent px-4 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
          >
            <Plus size={14} weight="bold" />
            Tambah Device
          </button>
        </div>
      </div>

      {/* Telemetry Stats Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-fg-muted">Total Device</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-fg">{devices.length}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-emerald-400 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            Tersambung
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-fg">{readyCount}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-amber-400 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Menunggu Scan
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-fg">{qrCount}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-fg-faint flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-zinc-500" />
            Terputus / Lainnya
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-fg">{offlineCount}</p>
        </div>
      </div>

      {/* Filter & Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-faint"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-line bg-surface pl-10 pr-9 text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
            placeholder="Cari label device atau nomor WhatsApp…"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>
        <div className="flex h-10 items-center rounded-xl border border-line bg-surface p-1">
          {[
            { value: "", label: "Semua" },
            { value: "ready", label: "Tersambung" },
            { value: "qr_ready", label: "Scan QR" },
            { value: "offline", label: "Terputus" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`h-full rounded-lg px-3 text-xs font-medium transition-colors ${
                statusFilter === f.value ? "bg-accent text-accent-ink font-semibold" : "text-fg-muted hover:text-fg"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {pageError && (
        <p className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
          <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
          {pageError}
        </p>
      )}

      {/* Device Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-line bg-surface p-5 animate-pulse space-y-4">
              <div className="flex justify-between items-center">
                <div className="h-4 w-32 rounded bg-surface-2" />
                <div className="h-5 w-20 rounded-full bg-surface-2" />
              </div>
              <div className="h-8 rounded-xl bg-surface-2" />
              <div className="h-9 rounded-lg bg-surface-2" />
            </div>
          ))}
        </div>
      ) : filteredDevices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-12 text-center">
          <DeviceMobile size={36} className="mx-auto text-fg-faint" />
          <p className="mt-3 text-sm font-medium text-fg">Tidak ada device yang cocok</p>
          <p className="mt-1 text-xs text-fg-muted">
            {search || statusFilter
              ? "Coba ubah filter pencarian."
              : "Belum ada device WhatsApp terhubung. Klik Tambah Device untuk mulai."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredDevices.map((d) => {
            const info = statusInfo(d.status);
            const isReady = d.status === "ready";
            const isQrReady = d.status === "qr_ready";
            const restriction = restrictionInfo(d.restriction);

            return (
              <Spotlight
                key={d.id}
                className="group rounded-2xl border border-line bg-surface p-5 transition-all hover:border-accent/40 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-soft bg-surface-2 text-fg">
                        <DeviceMobile size={20} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-fg text-sm">{d.label}</p>
                        <p className="font-mono text-[11px] text-fg-faint">
                          Session: {d.openwaSessionId.slice(0, 10)}…
                        </p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${info.badgeCls}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} />
                      {info.label}
                    </span>
                  </div>

                  {restriction && (
                    <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-2.5 text-xs text-red-300">
                      <Warning size={14} className="mt-0.5 shrink-0" weight="fill" />
                      <div className="min-w-0">
                        <p className="font-semibold">{restriction.label}</p>
                        {restriction.expiresAt && (
                          <p className="font-mono text-[10px] text-red-400/80">
                            Hingga {formatDate(restriction.expiresAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    {isReady ? (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 font-mono text-xs text-emerald-300">
                        <Phone size={14} weight="bold" />
                        <span className="font-medium">{d.phone ?? "Nomor WhatsApp aktif"}</span>
                      </div>
                    ) : isQrReady ? (
                      <button
                        onClick={() => {
                          setAddState({ phase: "qr", device: d });
                          setAddOpen(true);
                          pollPairing(d.id);
                        }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
                      >
                        <QrCode size={14} weight="bold" />
                        Scan QR Sekarang
                      </button>
                    ) : (
                      <div className="rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-xs text-fg-faint">
                        Terdaftar: {formatDate(d.createdAt)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-3">
                  {isReady ? (
                    <>
                      <button
                        onClick={() => {
                          setQuickSendDevice(d);
                          setQuickSendOpen(true);
                        }}
                        className="flex-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 text-xs font-medium text-fg hover:border-accent hover:text-accent-bright transition-colors"
                      >
                        <PaperPlaneTilt size={12} />
                        Kirim Uji Coba
                      </button>
                      <button
                        onClick={() => deviceAction(d.id, "logout")}
                        className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-line bg-surface-2 px-2.5 text-xs text-fg-muted hover:border-red-500/30 hover:text-red-400 transition-colors"
                        title="Logout dari nomor WhatsApp"
                      >
                        <Power size={12} />
                        Logout
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => deviceAction(d.id, "start")}
                      className="flex-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-accent px-2 text-xs font-semibold text-accent-ink hover:bg-accent-bright transition-colors"
                    >
                      <Power size={12} />
                      Mulai / Hubungkan
                    </button>
                  )}
                  <button
                    onClick={() => deleteDevice(d.id, d.label)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-faint hover:border-red-500/30 hover:text-red-400 transition-colors"
                    aria-label={`Hapus ${d.label}`}
                    title="Hapus Device"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              </Spotlight>
            );
          })}
        </div>
      )}

      {/* Add Device Modal */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={closeAdd}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {addState.phase === "form" && (
              <>
                <div className="flex items-start justify-between border-b border-line-soft pb-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-fg">Tambah Device</h2>
                    <p className="text-xs text-fg-muted">Beri label pengenal untuk device ini.</p>
                  </div>
                  <button onClick={closeAdd} className="text-fg-faint hover:text-fg">
                    <X size={18} />
                  </button>
                </div>
                <form onSubmit={createDevice} className="mt-4 space-y-4">
                  <div>
                    <label htmlFor="device-label" className="block text-xs font-medium text-fg mb-1">
                      Label Device
                    </label>
                    <input
                      id="device-label"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="mis. WhatsApp Kasir, CS 1, Marketing"
                      maxLength={50}
                      required
                      autoFocus
                      className="h-10 w-full rounded-xl border border-line bg-ink-2 px-3.5 text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-10 rounded-xl bg-accent text-xs font-semibold text-accent-ink hover:bg-accent-bright transition-colors disabled:opacity-50"
                  >
                    {submitting ? "Memproses…" : "Lanjutkan ke Scan QR"}
                  </button>
                </form>
              </>
            )}

            {addState.phase === "qr" && (
              <>
                <div className="flex items-start justify-between border-b border-line-soft pb-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-fg">Scan QR WhatsApp</h2>
                    <p className="text-xs text-fg-muted">
                      Buka WA &gt; Menu &gt; Perangkat Tertaut &gt; Tautkan Perangkat.
                    </p>
                  </div>
                  <button onClick={closeAdd} className="text-fg-faint hover:text-fg">
                    <X size={18} />
                  </button>
                </div>

                <div className="mt-6 flex justify-center">
                  {addState.qr ? (
                    <div className="rounded-2xl border border-line bg-white p-3 shadow-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={addState.qr}
                        alt="QR code WhatsApp"
                        width={240}
                        height={240}
                        className="h-56 w-56 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex h-56 w-56 flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-ink-2 text-fg-faint">
                      <SpinnerGap size={24} className="animate-spin text-accent" />
                      <p className="text-xs">Menyiapkan QR Code…</p>
                    </div>
                  )}
                </div>

                <p className="mt-4 text-center text-xs text-fg-faint">
                  Status akan otomatis tersambung begitu QR dipindai.
                </p>
              </>
            )}

            {addState.phase === "done" && (
              <div className="text-center py-4 space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                  <CheckCircle size={24} weight="fill" />
                </div>
                <h2 className="font-display text-lg font-semibold text-fg">Device Tersambung!</h2>
                <p className="text-xs text-fg-muted">
                  Device <span className="font-semibold text-fg">{addState.device.label}</span> siap mengirim &amp; menerima pesan.
                </p>
                {addState.device.phone && (
                  <p className="font-mono text-xs text-emerald-300">{addState.device.phone}</p>
                )}
                <button
                  onClick={closeAdd}
                  className="w-full h-10 rounded-xl bg-accent text-xs font-semibold text-accent-ink hover:bg-accent-bright transition-colors mt-4"
                >
                  Selesai
                </button>
              </div>
            )}

            {addState.phase === "error" && (
              <div className="text-center py-4 space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10 text-red-400">
                  <Warning size={24} weight="fill" />
                </div>
                <h2 className="font-display text-lg font-semibold text-fg">Gagal Menghubungkan</h2>
                <p className="text-xs text-fg-muted">{addState.message}</p>
                <button
                  onClick={closeAdd}
                  className="w-full h-10 rounded-xl border border-line bg-surface-2 text-xs font-semibold text-fg hover:border-line-strong transition-colors mt-4"
                >
                  Tutup
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick Send Test Modal */}
      {quickSendOpen && quickSendDevice && (
        <QuickSendModal
          devices={devices.map((d) => ({
            id: d.id,
            label: d.label,
            phone: d.phone ?? null,
            status: d.status,
            updatedAt: d.updatedAt ?? new Date().toISOString(),
          }))}
          isOpen={quickSendOpen}
          onClose={() => {
            setQuickSendOpen(false);
            setQuickSendDevice(null);
          }}
        />
      )}
    </div>
  );
}
