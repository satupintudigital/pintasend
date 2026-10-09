"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CaretLeft,
  CaretRight,
  ChatCircleText,
  CheckCircle,
  Copy,
  DeviceMobile,
  Eye,
  File,
  FileText,
  Image as ImageIcon,
  MagnifyingGlass,
  Megaphone,
  MusicNote,
  PaperPlaneTilt,
  Smiley,
  SpinnerGap,
  VideoCamera,
  Warning,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";
import { classifyMedia, MEDIA_KIND_LABEL, type MediaKind } from "@/lib/mediaInfo";
import { SendTemplateModal } from "@/components/dashboard/SendTemplateModal";
import { QuickSendModal } from "@/components/dashboard/QuickSendModal";

export interface MessageRow {
  id: string;
  deviceId: string | null;
  deviceLabel: string | null;
  direction: string;
  chatId: string;
  body: string;
  type: string | null;
  status: string | null;
  messageId: string | null;
  mediaUrl: string | null;
  mimetype: string | null;
  reaction: string | null;
  watermark: boolean;
  triggeredAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

interface DeviceOption {
  id: string;
  label: string;
  phone?: string | null;
  status?: string;
  updatedAt?: string;
}

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 350;

type DirectionFilter = "" | "incoming" | "outgoing";
type StatusFilter = "" | "sent" | "delivered" | "read" | "failed";

const KIND_STYLE: Record<
  MediaKind,
  { icon: typeof ImageIcon; box: string; dot: string }
> = {
  image: {
    icon: ImageIcon,
    box: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
    dot: "bg-emerald-400",
  },
  video: {
    icon: VideoCamera,
    box: "border-violet-500/25 bg-violet-500/10 text-violet-400",
    dot: "bg-violet-400",
  },
  audio: {
    icon: MusicNote,
    box: "border-amber-500/25 bg-amber-500/10 text-amber-400",
    dot: "bg-amber-400",
  },
  document: {
    icon: FileText,
    box: "border-sky-500/25 bg-sky-500/10 text-sky-400",
    dot: "bg-sky-400",
  },
  sticker: {
    icon: Smiley,
    box: "border-pink-500/25 bg-pink-500/10 text-pink-400",
    dot: "bg-pink-400",
  },
  other: {
    icon: File,
    box: "border-line-soft bg-surface-2 text-fg-muted",
    dot: "bg-fg-faint",
  },
};

function MediaThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !/^https?:\/\//i.test(src)) {
    const s = KIND_STYLE.image;
    return (
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border ${s.box}`}
        title={alt}
      >
        <s.icon size={20} weight="bold" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt || "Media thumbnail"}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover"
    />
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateChatId(chatId: string): string {
  return chatId.replace(/@(c\.us|g\.us|s\.whatsapp\.net)$/, "");
}

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  sent: { label: "Terkirim", cls: "border-line-soft text-fg-muted", dot: "bg-fg-faint" },
  delivered: { label: "Tersampaikan", cls: "border-sky-500/25 text-sky-400", dot: "bg-sky-400" },
  read: { label: "Terbaca", cls: "border-emerald-500/25 text-emerald-400", dot: "bg-emerald-400" },
  failed: { label: "Gagal", cls: "border-red-500/25 text-red-400", dot: "bg-red-400" },
};

function messageDelaySec(m: MessageRow): number | null {
  if (m.direction !== "outgoing" || !m.triggeredAt || !m.sentAt) return null;
  const diffMs = new Date(m.sentAt).getTime() - new Date(m.triggeredAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  return diffMs / 1000;
}

function reactionSummary(reaction: string | null): { emoji: string; count: number }[] | null {
  if (!reaction) return null;
  try {
    const obj: unknown = JSON.parse(reaction);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const counts = new Map<string, number>();
    for (const v of Object.values(obj as Record<string, unknown>)) {
      if (typeof v === "string" && v.length > 0) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const list = [...counts.entries()].map(([emoji, count]) => ({ emoji, count }));
    return list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

export function MessageHistoryPanel() {
  const [templateOpen, setTemplateOpen] = useState(false);
  const [quickSendOpen, setQuickSendOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [page, setPage] = useState(1);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [inspectMessage, setInspectMessage] = useState<MessageRow | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  useEffect(() => {
    fetch("/api/devices")
      .then((res) => (res.ok ? res.json() : { devices: [] }))
      .then((d) => setDevices(d.devices ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const abortRef = useRef<AbortController | null>(null);
  const fetchMessages = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (direction) params.set("direction", direction);
      if (status) params.set("status", status);
      if (selectedDevice) params.set("deviceId", selectedDevice);

      const res = await fetch(`/api/messages?${params}`, { signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data.error ?? "Gagal memuat riwayat pesan");
        setMessages([]);
        setTotal(0);
        return;
      }
      setMessages(data.messages ?? []);
      setTotal(Number(data.total ?? 0));
      const totalPagesNow = Math.max(1, Math.ceil(Number(data.total ?? 0) / PAGE_SIZE));
      if (page > totalPagesNow) {
        setPage(totalPagesNow);
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setLoadError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery, direction, status, selectedDevice]);

  useEffect(() => {
    const t = setTimeout(() => fetchMessages(), 0);
    return () => {
      clearTimeout(t);
      abortRef.current?.abort();
    };
  }, [fetchMessages, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      {/* Header & Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
              <ChatCircleText size={20} weight="bold" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-fg md:text-3xl">
                Riwayat Pesan
              </h1>
              <p className="text-xs text-fg-muted">
                Pusat data lalu lintas pesan masuk via webhook &amp; keluar via API / Dashboard.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setQuickSendOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 text-xs font-semibold text-fg transition-colors hover:border-accent/40 hover:text-accent-bright"
          >
            <PaperPlaneTilt size={14} weight="bold" />
            Kirim Cepat
          </button>
          <button
            onClick={() => setTemplateOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-accent px-3.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-bright"
          >
            <Megaphone size={14} weight="bold" />
            Kirim Template
          </button>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="rounded-2xl border border-line bg-surface p-5 md:p-6">
        {/* Filters Toolbar */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {/* Search */}
          <div className="relative sm:col-span-2 lg:col-span-5">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-faint"
            />
            <input
              value={query}
              onChange={(e) => {
                setLoading(true);
                setQuery(e.target.value);
              }}
              className="h-10 w-full rounded-xl border border-line bg-ink-2 pl-10 pr-9 text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
              placeholder="Cari pesan atau nomor (mis. 62812...)"
            />
            {query && (
              <button
                onClick={() => {
                  setLoading(true);
                  setQuery("");
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg"
              >
                <X size={14} weight="bold" />
              </button>
            )}
          </div>

          {/* Direction Tabs */}
          <div className="flex h-10 items-center rounded-xl border border-line bg-ink-2 p-1 lg:col-span-3">
            {[
              { value: "", label: "Semua Arah" },
              { value: "incoming", label: "Masuk" },
              { value: "outgoing", label: "Keluar" },
            ].map((d) => (
              <button
                key={d.value}
                onClick={() => {
                  setLoading(true);
                  setDirection(d.value as DirectionFilter);
                  setPage(1);
                }}
                className={`h-full flex-1 rounded-lg text-xs font-medium transition-colors ${
                  direction === d.value ? "bg-accent text-accent-ink" : "text-fg-muted hover:text-fg"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="lg:col-span-2">
            <select
              value={status}
              onChange={(e) => {
                setLoading(true);
                setStatus(e.target.value as StatusFilter);
                setPage(1);
              }}
              className="h-10 w-full rounded-xl border border-line bg-ink-2 px-3 text-xs text-fg focus:border-accent focus:outline-none"
            >
              <option value="">Semua Status</option>
              <option value="sent">Terkirim</option>
              <option value="delivered">Tersampaikan</option>
              <option value="read">Terbaca</option>
              <option value="failed">Gagal</option>
            </select>
          </div>

          {/* Device Filter */}
          <div className="lg:col-span-2">
            <select
              value={selectedDevice}
              onChange={(e) => {
                setLoading(true);
                setSelectedDevice(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-xl border border-line bg-ink-2 px-3 text-xs text-fg focus:border-accent focus:outline-none"
            >
              <option value="">Semua Device</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadError && (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-400">
            <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
            {loadError}
          </p>
        )}

        {/* Message Stream */}
        {loading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 animate-pulse rounded-xl border border-line/60 bg-surface-2/40 p-4">
                <div className="h-9 w-9 shrink-0 rounded-xl bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/4 rounded bg-surface-2" />
                  <div className="h-3 w-3/4 rounded bg-surface-2" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-line p-10 text-center">
            <ChatCircleText size={32} className="mx-auto text-fg-faint" />
            <p className="mt-2 text-sm font-medium text-fg">Tidak ada pesan ditemukan</p>
            <p className="mt-1 text-xs text-fg-muted">
              {debouncedQuery || direction || status || selectedDevice
                ? "Coba sesuaikan kata kunci atau bersihkan filter pencarian."
                : "Pesan yang dikirim via API atau diterima via Webhook akan tercatat otomatis."}
            </p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-line-soft">
            {messages.map((m) => {
              const incoming = m.direction === "incoming";
              const media = classifyMedia(m.type, m.mimetype);
              const kindStyle = KIND_STYLE[media.kind];
              const kindLabel = MEDIA_KIND_LABEL[media.kind];
              const showThumb = media.kind === "image" && !!m.mediaUrl;
              const delaySec = messageDelaySec(m);
              const reactions = reactionSummary(m.reaction);
              const cleanPhone = truncateChatId(m.chatId);

              return (
                <li
                  key={m.id}
                  className="group py-4 transition-colors hover:bg-surface-2/30 first:pt-0 last:pb-0"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                        incoming
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                          : "border-accent/25 bg-accent/10 text-accent-bright"
                      }`}
                      title={incoming ? "Pesan masuk" : "Pesan keluar"}
                    >
                      {incoming ? (
                        <ArrowDownLeft size={16} weight="bold" />
                      ) : (
                        <ArrowUpRight size={16} weight="bold" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={`font-mono text-[10px] uppercase tracking-wider ${
                            incoming ? "text-emerald-400" : "text-accent-bright"
                          }`}
                        >
                          {incoming ? "Masuk" : "Keluar"}
                        </span>
                        <span className="font-mono text-xs font-medium text-fg">
                          {cleanPhone}
                        </span>
                        {m.deviceLabel && (
                          <span className="flex items-center gap-1 rounded-full border border-line-soft bg-surface-2 px-2 py-0.5 text-[10px] text-fg-muted">
                            <DeviceMobile size={11} />
                            {m.deviceLabel}
                          </span>
                        )}
                        {m.status && STATUS_META[m.status] && (
                          <span
                            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_META[m.status].cls}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[m.status].dot}`} />
                            {STATUS_META[m.status].label}
                          </span>
                        )}
                        {delaySec !== null && delaySec >= 1 && (
                          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-400">
                            delay {delaySec.toFixed(1)}s
                          </span>
                        )}
                        {m.watermark && (
                          <span className="flex items-center gap-1 rounded-full border border-line-soft bg-surface-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                            <Megaphone size={10} weight="fill" />
                            watermark
                          </span>
                        )}
                        {reactions && (
                          <span className="flex items-center gap-1 rounded-full border border-pink-500/25 bg-pink-500/10 px-2 py-0.5">
                            {reactions.map((r) => (
                              <span key={r.emoji} className="text-xs leading-none">
                                {r.emoji}
                                {r.count > 1 && <sup className="ml-0.5 text-[9px] text-fg-muted">{r.count}</sup>}
                              </span>
                            ))}
                          </span>
                        )}
                        <span className="ml-auto text-[11px] text-fg-faint">
                          {formatTime(m.createdAt)}
                        </span>
                      </div>

                      {media.isMedia ? (
                        <div className="mt-2 flex items-start gap-3">
                          {showThumb ? (
                            <MediaThumb src={m.mediaUrl!} alt={m.body} />
                          ) : (
                            <span
                              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border ${kindStyle.box}`}
                            >
                              <kindStyle.icon size={18} weight="bold" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${kindStyle.box}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${kindStyle.dot}`} />
                                {kindLabel}
                              </span>
                            </div>
                            <p className="mt-1 break-words text-sm text-fg leading-relaxed">
                              {m.body || <span className="italic text-fg-faint">(tanpa teks — {kindLabel.toLowerCase()})</span>}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1.5 break-words text-sm text-fg leading-relaxed">
                          {m.body || <span className="italic text-fg-faint">(tanpa teks — {m.type ?? "pesan"})</span>}
                        </p>
                      )}

                      {/* Micro actions on hover */}
                      <div className="mt-2 flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setInspectMessage(m)}
                          className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted hover:text-fg hover:border-line-strong"
                        >
                          <Eye size={12} />
                          Detail
                        </button>
                        <a
                          href={`https://wa.me/${cleanPhone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted hover:text-emerald-400 hover:border-emerald-500/30"
                        >
                          <WhatsappLogo size={12} weight="fill" />
                          Chat
                        </a>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
            <p className="text-xs text-fg-muted">
              Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} dari{" "}
              <span className="font-mono text-fg">{total}</span> pesan
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setLoading(true);
                  setPage((p) => Math.max(1, p - 1));
                }}
                disabled={page <= 1 || loading}
                className="flex h-8 items-center gap-1 rounded-lg border border-line bg-ink-2 px-3 text-xs font-medium text-fg transition-colors hover:border-accent hover:text-accent-bright disabled:opacity-40"
              >
                <CaretLeft size={12} weight="bold" /> Sebelumnya
              </button>
              <span className="px-2 font-mono text-xs text-fg-muted">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => {
                  setLoading(true);
                  setPage((p) => Math.min(totalPages, p + 1));
                }}
                disabled={page >= totalPages || loading}
                className="flex h-8 items-center gap-1 rounded-lg border border-line bg-ink-2 px-3 text-xs font-medium text-fg transition-colors hover:border-accent hover:text-accent-bright disabled:opacity-40"
              >
                Berikutnya <CaretRight size={12} weight="bold" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Message Inspector Drawer Modal */}
      {inspectMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line-soft pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent-bright">
                  <Eye size={16} weight="bold" />
                </span>
                <p className="font-display font-semibold text-fg">Detail Pesan</p>
              </div>
              <button
                onClick={() => setInspectMessage(null)}
                className="rounded-lg p-1 text-fg-faint hover:bg-surface-2 hover:text-fg"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <p className="text-fg-faint">Nomor Tujuan / JID</p>
                <p className="font-mono text-sm font-semibold text-fg mt-0.5">{inspectMessage.chatId}</p>
              </div>
              <div>
                <p className="text-fg-faint">Isi Pesan</p>
                <div className="mt-1 rounded-xl border border-line bg-ink-2 p-3 font-sans text-xs text-fg leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {inspectMessage.body || <span className="italic text-fg-faint">(tanpa teks)</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <p className="text-fg-faint">Arah</p>
                  <p className="font-medium text-fg capitalize mt-0.5">{inspectMessage.direction}</p>
                </div>
                <div>
                  <p className="text-fg-faint">Status</p>
                  <p className="font-medium text-fg capitalize mt-0.5">{inspectMessage.status ?? "unknown"}</p>
                </div>
                <div>
                  <p className="text-fg-faint">Waktu Dibuat</p>
                  <p className="font-mono text-fg mt-0.5">{formatTime(inspectMessage.createdAt)}</p>
                </div>
                <div>
                  <p className="text-fg-faint">Device Label</p>
                  <p className="font-mono text-fg mt-0.5">{inspectMessage.deviceLabel ?? "—"}</p>
                </div>
              </div>
              {inspectMessage.messageId && (
                <div>
                  <p className="text-fg-faint">WhatsApp Message ID</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="font-mono text-[11px] text-fg-muted truncate flex-1">{inspectMessage.messageId}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(inspectMessage.messageId!);
                        setCopiedId(true);
                        setTimeout(() => setCopiedId(false), 2000);
                      }}
                      className="text-fg-faint hover:text-fg"
                      title="Salin ID"
                    >
                      {copiedId ? <CheckCircle size={14} className="text-accent-bright" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-line-soft">
              <button
                onClick={() => setInspectMessage(null)}
                className="h-9 rounded-xl border border-line bg-surface-2 px-4 text-xs font-semibold text-fg hover:border-line-strong"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modals */}
      <QuickSendModal
        devices={devices.map((d) => ({
          id: d.id,
          label: d.label,
          phone: d.phone ?? null,
          status: d.status ?? "ready",
          updatedAt: d.updatedAt ?? new Date().toISOString(),
        }))}
        isOpen={quickSendOpen}
        onClose={() => {
          setQuickSendOpen(false);
          setPage(1);
          setLoading(true);
          setRefreshKey((k) => k + 1);
        }}
      />
      <SendTemplateModal
        key={templateOpen ? "open" : "closed"}
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSent={() => {
          setPage(1);
          setLoading(true);
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
