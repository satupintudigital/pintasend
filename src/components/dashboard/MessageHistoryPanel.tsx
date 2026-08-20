"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CaretLeft,
  CaretRight,
  ChatCircleText,
  File,
  FileText,
  Image,
  MagnifyingGlass,
  MusicNote,
  Smiley,
  VideoCamera,
  Warning,
  X,
} from "@phosphor-icons/react";
import { classifyMedia, MEDIA_KIND_LABEL, type MediaKind } from "@/lib/mediaInfo";

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
  triggeredAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 350;

type DirectionFilter = "" | "incoming" | "outgoing";

const KIND_STYLE: Record<
  MediaKind,
  { icon: typeof Image; box: string; dot: string }
> = {
  image: {
    icon: Image,
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

/** Thumbnail gambar dari mediaUrl eksternal; fallback ke badge saat gagal. */
function MediaThumb({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !/^https?:\/\//i.test(src)) {
    const s = KIND_STYLE.image;
    return (
      <span
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border ${s.box}`}
        title={alt}
      >
        <s.icon size={20} weight="bold" />
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- URL dinamis dari CDN
       client (tidak dikenal build-time); thumbnail kecil + lazy, next/image tidak
       cocok utk host eksternal arbitrer (remotePatterns tak bisa memprediksi). */
    <img
      src={src}
      alt={alt || "Gambar"}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-14 w-14 shrink-0 rounded-lg border border-line object-cover"
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

/** Label & warna badge status kirim pesan keluar (sent → delivered → read / failed). */
const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  sent: { label: "Terkirim", cls: "border-line-soft text-fg-muted", dot: "bg-fg-faint" },
  delivered: { label: "Tersampaikan", cls: "border-sky-500/25 text-sky-400", dot: "bg-sky-400" },
  read: { label: "Terbaca", cls: "border-emerald-500/25 text-emerald-400", dot: "bg-emerald-400" },
  failed: { label: "Gagal", cls: "border-red-500/25 text-red-400", dot: "bg-red-400" },
};

/** Delay aktual pesan keluar (detik) — null bila tidak ada data / pesan masuk. */
function messageDelaySec(m: MessageRow): number | null {
  if (m.direction !== "outgoing" || !m.triggeredAt || !m.sentAt) return null;
  const diffMs = new Date(m.sentAt).getTime() - new Date(m.triggeredAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  return diffMs / 1000;
}

/** Ringkasan reaksi (emoji + jumlah) dari JSON map senderId→emoji. */
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
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("");
  const [page, setPage] = useState(1);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Debounce pencarian → reset ke halaman 1. (loading di-set di onChange —
  // pola sama seperti PenggunaList, hindari setState sync dalam effect.)
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
  }, [page, debouncedQuery, direction]);

  useEffect(() => {
    const t = setTimeout(() => fetchMessages(), 0);
    return () => {
      clearTimeout(t);
      abortRef.current?.abort();
    };
  }, [fetchMessages]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
            <ChatCircleText size={19} weight="bold" />
          </span>
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">Riwayat Pesan</p>
            <p className="text-xs text-fg-muted">
              Semua pesan masuk (via webhook) &amp; keluar (via API) tenant ini.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-line-soft bg-surface-2 px-3 py-1 font-mono text-xs text-fg-muted">
          {total} pesan
        </span>
      </div>

      {/* Pencarian + filter arah */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-faint"
          />
          <input
            value={query}
            onChange={(e) => {
              setLoading(true);
              setQuery(e.target.value);
            }}
            className="min-h-11 w-full rounded-xl border border-line bg-ink-2 pl-11 pr-12 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="Cari isi pesan atau nomor…"
            aria-label="Cari pesan"
          />
          {query && (
            <button
              onClick={() => {
                setLoading(true);
                setQuery("");
              }}
              aria-label="Bersihkan pencarian"
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X size={15} weight="bold" />
            </button>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-xl border border-line bg-ink-2 p-1">
          {(
            [
              { value: "", label: "Semua" },
              { value: "incoming", label: "Masuk" },
              { value: "outgoing", label: "Keluar" },
            ] as { value: DirectionFilter; label: string }[]
          ).map((f) => (
            <button
              key={f.value}
              onClick={() => {
                setLoading(true);
                setDirection(f.value);
                setPage(1);
              }}
              className={`min-h-9 rounded-lg px-3.5 text-xs font-medium transition-colors ${
                direction === f.value
                  ? "bg-accent text-accent-ink"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-400">
          <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
          {loadError}
        </p>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 animate-pulse">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-surface-2" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-surface-2" />
                <div className="h-2.5 w-2/3 rounded bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line-soft bg-surface-2/60 px-4 py-8 text-center text-sm text-fg-faint">
          {debouncedQuery || direction
            ? "Tidak ada pesan yang cocok dengan filter ini."
            : "Belum ada pesan. Kirim pesan lewat API atau tunggu pesan masuk via webhook."}
        </p>
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
            return (
              <li key={m.id} className="py-4 first:pt-0 last:pb-0">
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
                      <span className="font-mono text-xs text-fg">
                        {truncateChatId(m.chatId)}
                      </span>
                      {m.deviceLabel && (
                        <span className="rounded-full border border-line-soft bg-surface-2 px-2 py-0.5 text-[10px] text-fg-faint">
                          {m.deviceLabel}
                        </span>
                      )}
                      {m.status && STATUS_META[m.status] ? (
                        <span
                          className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS_META[m.status].cls}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[m.status].dot}`} />
                          {STATUS_META[m.status].label}
                        </span>
                      ) : m.status ? (
                        <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                          {m.status}
                        </span>
                      ) : null}
                      {delaySec !== null && delaySec >= 1 && (
                        <span
                          className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-400"
                          title={`Trigger: ${formatTime(m.triggeredAt!)} · Kirim: ${formatTime(m.sentAt!)}`}
                        >
                          delay {delaySec.toFixed(1)} dtk
                        </span>
                      )}
                      {reactions && (
                        <span
                          className="flex items-center gap-1 rounded-full border border-pink-500/25 bg-pink-500/10 px-2 py-0.5"
                          title="Reaksi pesan"
                        >
                          {reactions.map((r) => (
                            <span key={r.emoji} className="text-[13px] leading-none">
                              {r.emoji}
                              {r.count > 1 && (
                                <sup className="ml-0.5 text-[9px] text-fg-muted">{r.count}</sup>
                              )}
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
                            className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border ${kindStyle.box}`}
                            title={kindLabel}
                          >
                            <kindStyle.icon size={20} weight="bold" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${kindStyle.box}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${kindStyle.dot}`} />
                              {kindLabel}
                            </span>
                            {m.mimetype && (
                              <span
                                className="max-w-[16rem] truncate font-mono text-[10px] text-fg-faint"
                                title={m.mimetype}
                              >
                                {m.mimetype}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 break-words text-sm leading-relaxed text-fg">
                            {m.body || (
                              <span className="italic text-fg-faint">
                                (tanpa teks — {kindLabel.toLowerCase()})
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 break-words text-sm leading-relaxed text-fg">
                        {m.body || (
                          <span className="italic text-fg-faint">
                            (tanpa teks — {m.type ?? "media"})
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
          <p className="text-xs text-fg-faint">
            Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} dari{" "}
            {total} pesan
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setLoading(true);
                setPage((p) => Math.max(1, p - 1));
              }}
              disabled={page <= 1 || loading}
              className="flex min-h-11 items-center gap-1 rounded-full border border-line bg-ink-2 px-3.5 py-2 text-xs font-medium text-fg transition-colors hover:border-accent/40 hover:text-accent-bright disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg"
            >
              <CaretLeft size={13} weight="bold" /> Sebelumnya
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
              className="flex min-h-11 items-center gap-1 rounded-full border border-line bg-ink-2 px-3.5 py-2 text-xs font-medium text-fg transition-colors hover:border-accent/40 hover:text-accent-bright disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg"
            >
              Berikutnya <CaretRight size={13} weight="bold" />
            </button>
          </div>
        </div>
      )}

      <p className="mt-5 rounded-xl border border-line-soft bg-surface-2/60 px-4 py-3 text-xs leading-relaxed text-fg-faint">
        Riwayat disimpan di basis data utama (Neon) untuk setiap pesan masuk via webhook dan keluar
        via <code className="font-mono">POST /v1/messages</code>. Pesan media ditandai badge jenisnya;
        gambar menampilkan thumbnail saat dikirim lewat URL publik. Pencarian memakai{" "}
        <code className="font-mono">ILIKE</code> pada isi pesan &amp; nomor.
      </p>
    </div>
  );
}
