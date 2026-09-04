"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwise,
  CaretDown,
  CaretUp,
  Megaphone,
  Pause,
  Play,
  Plus,
  Stop,
  X,
} from "@phosphor-icons/react";

export interface CampaignView {
  id: string;
  name: string;
  status: string;
  deviceLabel: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  scheduledAt: string | null;
  createdAt: string;
}

interface RecipientView {
  id: string;
  chatId: string;
  name: string | null;
  status: string;
  error: string | null;
}

interface CampaignDetail extends CampaignView {
  messageBody: string;
  mediaType: string | null;
  mediaUrl: string | null;
  failReason: string | null;
  recipients: RecipientView[];
}

interface DeviceLite {
  id: string;
  label: string;
  status: string;
}

const fieldClass =
  "min-h-11 w-full rounded-xl border border-line bg-ink-2 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-xs text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50";

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "border-line bg-surface-2 text-fg-muted" },
  scheduled: { label: "Terjadwal", cls: "border-sky-500/25 bg-sky-500/10 text-sky-300" },
  running: { label: "Berjalan", cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" },
  paused: { label: "Jeda", cls: "border-amber-500/25 bg-amber-500/10 text-amber-300" },
  completed: { label: "Selesai", cls: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" },
  failed: { label: "Gagal", cls: "border-red-500/25 bg-red-500/10 text-red-300" },
  cancelled: { label: "Dibatalkan", cls: "border-line bg-surface-2 text-fg-faint" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { label: status, cls: "border-line bg-surface-2 text-fg-muted" };
  return <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${s.cls}`}>{s.label}</span>;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(
    new Date(iso),
  );
}

function progressPct(c: CampaignView): number {
  const done = c.sentCount + c.failedCount + c.skippedCount;
  if (!c.totalRecipients) return 0;
  return Math.min(100, Math.round((done / c.totalRecipients) * 100));
}

export function CampaignPanel({ hasAddon }: { hasAddon: boolean }) {
  const [campaigns, setCampaigns] = useState<CampaignView[]>([]);
  const [addonActive, setAddonActive] = useState(hasAddon);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [devices, setDevices] = useState<DeviceLite[]>([]);

  // Form buat campaign
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [audienceTag, setAudienceTag] = useState("");
  const [messageBody, setMessageBody] = useState("Hai {{nama}}, ada promo spesial untukmu!");
  const [mediaType, setMediaType] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [minDelaySec, setMinDelaySec] = useState(5);
  const [maxDelaySec, setMaxDelaySec] = useState(15);
  const [scheduledAt, setScheduledAt] = useState("");

  // Detail
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat campaign");
      setCampaigns(data.campaigns ?? []);
      setAddonActive(Boolean(data.addonActive));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat campaign");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
      void fetch("/api/devices")
        .then((r) => r.json())
        .then((d) => setDevices((d.devices ?? []).filter((x: DeviceLite & { status?: string }) => x.status === "ready")))
        .catch(() => undefined);
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Polling detail saat campaign berjalan.
  useEffect(() => {
    if (!detailId) return;
    let stop = false;
    async function poll() {
      try {
        const res = await fetch(`/api/campaigns/${detailId}`);
        const data = await res.json();
        if (!stop && res.ok) setDetail(data.campaign ?? null);
      } catch {
        /* ignore */
      }
    }
    void poll();
    const t = setInterval(poll, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [detailId]);

  async function createCampaign() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          messageBody,
          ...(deviceId ? { deviceId } : {}),
          ...(audienceTag.trim() ? { audienceTag: audienceTag.trim() } : {}),
          ...(mediaType && mediaUrl ? { mediaType, mediaUrl } : {}),
          minDelaySec,
          maxDelaySec,
          ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat campaign");
      setShowCreate(false);
      setName("");
      setScheduledAt("");
      setMediaType("");
      setMediaUrl("");
      setAudienceTag("");
      setNotice(`Draft "${name}" dibuat. Tekan Mulai untuk menjalankannya.`);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat campaign");
    } finally {
      setSaving(false);
    }
  }

  async function doAction(id: string, action: "start" | "pause" | "resume" | "cancel") {
    setActionBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/campaigns/${id}/${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Aksi gagal");
      setNotice(
        action === "start"
          ? "Campaign dimulai — dispatcher mengirim batch tiap menit."
          : `Campaign ${action === "pause" ? "dijeda" : action === "resume" ? "dilanjutkan" : "dibatalkan"}.`,
      );
      void load();
      if (detailId === id) setDetailId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aksi gagal");
    } finally {
      setActionBusy(false);
    }
  }

  function openDetail(id: string) {
    setDetailId((cur) => (cur === id ? null : id));
    setDetail(null);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-semibold text-fg">
            <Megaphone size={20} className="text-accent-bright" /> Campaign
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Blast pesan massal bertahap — jeda acak antar pesan, hormati opt-out.
          </p>
        </div>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={() => void load()} disabled={loading}>
            <ArrowClockwise size={16} /> Muat ulang
          </button>
          <button className={btnPrimary} onClick={() => setShowCreate((v) => !v)} disabled={!addonActive}>
            <Plus size={16} /> Campaign Baru
          </button>
        </div>
      </header>

      {!addonActive && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          Modul Campaign belum aktif untuk tenant ini. Hubungi admin platform untuk mengaktifkan addon.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
      {notice && !error && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      {showCreate && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Buat Campaign</h2>
            <button onClick={() => setShowCreate(false)} aria-label="Tutup" className="text-fg-faint hover:text-fg">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <input className={fieldClass} placeholder="Nama campaign" value={name} onChange={(e) => setName(e.target.value)} />
              <select className={fieldClass} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                <option value="">Device otomatis (ready pertama)</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
              <input className={fieldClass} placeholder="Tag audiens (kosong = semua kontak)" value={audienceTag} onChange={(e) => setAudienceTag(e.target.value)} />
              <label className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 px-3 text-xs text-fg-faint">
                Jeda min
                <input type="number" min={3} max={60} className="w-full bg-transparent text-right text-sm text-fg outline-none" value={minDelaySec} onChange={(e) => setMinDelaySec(Number(e.target.value))} />
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 px-3 text-xs text-fg-faint">
                Jeda maks
                <input type="number" min={3} max={60} className="w-full bg-transparent text-right text-sm text-fg outline-none" value={maxDelaySec} onChange={(e) => setMaxDelaySec(Number(e.target.value))} />
              </label>
            </div>
            <textarea
              className={`${fieldClass} min-h-28`}
              placeholder="Isi pesan — gunakan {{nama}} dan {{nomor}} untuk personalisasi"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
            />
            <p className="-mt-2 font-mono text-[11px] text-fg-faint">
              Variabel tersedia: {"{{nama}}"}, {"{{nomor}}"}, {"{{tanggal}}"}
            </p>
            <div className="grid gap-3 sm:grid-cols-[140px_1fr_220px]">
              <select className={fieldClass} value={mediaType} onChange={(e) => setMediaType(e.target.value)}>
                <option value="">Tanpa media</option>
                <option value="image">Gambar</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="document">Dokumen</option>
              </select>
              <input className={fieldClass} placeholder="URL media publik (https://…)" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} disabled={!mediaType} />
              <label className="flex items-center gap-2 rounded-xl border border-line bg-ink-2 px-3 text-xs text-fg-faint">
                Jadwal
                <input
                  type="datetime-local"
                  className="w-full bg-transparent text-sm text-fg outline-none"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end">
              <button className={btnPrimary} onClick={() => void createCampaign()} disabled={saving || !name.trim() || !messageBody.trim()}>
                {saving ? "Menyimpan…" : "Simpan Draft"}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface">
        {loading ? (
          <p className="p-8 text-center text-sm text-fg-faint">Memuat…</p>
        ) : campaigns.length === 0 ? (
          <p className="p-8 text-center text-sm text-fg-faint">Belum ada campaign.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {campaigns.map((c) => (
              <li key={c.id} className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-fg">{c.name}</p>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-fg-faint">
                      {c.deviceLabel ?? "tanpa device"} · {fmtDateTime(c.createdAt)}
                      {c.scheduledAt && c.status === "scheduled" ? ` · jadwal ${fmtDateTime(c.scheduledAt)}` : ""}
                    </p>
                  </div>
                  <div className="font-mono text-xs text-fg-faint">
                    {c.sentCount}/{c.totalRecipients} terkirim
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(c.status === "draft" || c.status === "paused") && (
                      <button className={btnGhost} disabled={actionBusy} onClick={() => void doAction(c.id, c.status === "paused" ? "resume" : "start")}>
                        <Play size={13} /> {c.status === "paused" ? "Lanjut" : "Mulai"}
                      </button>
                    )}
                    {(c.status === "running" || c.status === "scheduled") && (
                      <button className={btnGhost} disabled={actionBusy} onClick={() => void doAction(c.id, "pause")}>
                        <Pause size={13} /> Jeda
                      </button>
                    )}
                    {!["completed", "failed", "cancelled"].includes(c.status) && (
                      <button className={`${btnGhost} text-red-300`} disabled={actionBusy} onClick={() => void doAction(c.id, "cancel")}>
                        <Stop size={13} /> Batal
                      </button>
                    )}
                    <button className={btnGhost} onClick={() => openDetail(c.id)}>
                      {detailId === c.id ? <CaretUp size={13} /> : <CaretDown size={13} />} Detail
                    </button>
                  </div>
                </div>

                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      c.status === "failed" ? "bg-red-400" : c.status === "completed" ? "bg-emerald-400" : "bg-accent"
                    }`}
                    style={{ width: `${progressPct(c)}%` }}
                  />
                </div>

                {detailId === c.id && (
                  <div className="mt-4 rounded-xl border border-line-soft bg-ink-2 p-4">
                    {detail ? (
                      <>
                        <p className="whitespace-pre-wrap text-sm text-fg-muted">{detail.messageBody}</p>
                        {detail.failReason && (
                          <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                            {detail.failReason}
                          </p>
                        )}
                        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                          {detail.recipients.map((r) => (
                            <li key={r.id} className="flex items-center justify-between gap-2 font-mono text-[11px]">
                              <span className="truncate text-fg-faint">{r.name ? `${r.name} · ` : ""}{r.chatId}</span>
                              <span
                                className={
                                  r.status === "sent"
                                    ? "text-emerald-300"
                                    : r.status === "failed"
                                      ? "text-red-300"
                                      : r.status === "skipped"
                                        ? "text-fg-faint line-through"
                                        : "text-sky-300"
                                }
                              >
                                {r.error ? `${r.status}: ${r.error.slice(0, 60)}...` : r.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="text-center text-xs text-fg-faint">Memuat detail…</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
