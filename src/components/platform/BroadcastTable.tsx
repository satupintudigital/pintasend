"use client";

import { useEffect, useState } from "react";
import { Megaphone, PaperPlaneTilt, Prohibit } from "@phosphor-icons/react";

interface BroadcastRow {
  id: string;
  name: string;
  messageBody: string;
  status: string;
  targetMode: string;
  createdBy: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failReason: string | null;
  totalJobs: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-ink-2 text-fg-muted",
  running: "bg-blue-50 text-blue-700 border border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  failed: "bg-red-50 text-red-600 border border-red-200",
  cancelled: "bg-amber-50 text-amber-700 border border-amber-200",
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function progress(b: BroadcastRow): string {
  if (b.status === "draft") return "Belum mulai";
  const done = b.sentCount + b.failedCount;
  return `${done}/${b.totalJobs} selesai (${b.sentCount} terkirim, ${b.failedCount} gagal)`;
}

export function BroadcastTable() {
  const [data, setData] = useState<{ broadcasts: BroadcastRow[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  // Form create
  const [name, setName] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/platform/broadcasts?limit=50");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Gagal memuat");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !messageBody.trim()) return;
    setCreating(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/platform/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), messageBody: messageBody.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Gagal membuat");
      setName("");
      setMessageBody("");
      setStatusMsg({ ok: true, msg: "Broadcast draft dibuat — review lalu Start." });
      await load();
    } catch (err) {
      setStatusMsg({ ok: false, msg: err instanceof Error ? err.message : "Gagal membuat" });
    } finally {
      setCreating(false);
    }
  }

  async function act(id: string, action: "start" | "cancel") {
    setActingId(id);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/platform/broadcasts/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Gagal");
      setStatusMsg({
        ok: true,
        msg: action === "start"
          ? `Broadcast dimulai (${d.jobs ?? 0} perangkat sasaran).`
          : "Broadcast dibatalkan.",
      });
      await load();
    } catch (err) {
      setStatusMsg({ ok: false, msg: err instanceof Error ? err.message : "Gagal" });
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Buat broadcast */}
      <form
        onSubmit={createBroadcast}
        className="rounded-2xl border border-line bg-surface p-5"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Megaphone size={17} className="text-accent-bright" />
          Buat broadcast baru
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[240px_1fr_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama (internal)"
            maxLength={120}
            className="rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <textarea
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            placeholder="Isi pesan pengumuman…"
            maxLength={4096}
            rows={2}
            className="resize-y rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating || !name.trim() || !messageBody.trim()}
            className="rounded-xl bg-accent px-5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-bright disabled:opacity-50"
          >
            {creating ? "Membuat…" : "Buat draft"}
          </button>
        </div>
        <p className="mt-2 text-xs text-fg-faint">
          Dikirim ke nomor pemilik tiap perangkat yang siap (status ready) —
          watermark iklan tenant tetap dihormati.
        </p>
      </form>

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
                <th className="px-4 py-3">Broadcast</th>
                <th className="px-4 py-3">Dibuat</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Progres</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.broadcasts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-fg-faint">
                    Belum ada broadcast.
                  </td>
                </tr>
              )}
              {data.broadcasts.map((b) => (
                <tr key={b.id} className="border-b border-line-soft last:border-0 hover:bg-surface-2/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-fg">{b.name}</p>
                    <p className="max-w-md truncate text-xs text-fg-muted">{b.messageBody}</p>
                    {b.failReason && <p className="text-xs text-red-600">{b.failReason}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-fg-muted">
                    {fmtTime(b.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[b.status] ?? "bg-ink-2 text-fg-muted"}`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-fg-muted">{progress(b)}</td>
                  <td className="px-4 py-3 text-right">
                    {b.status === "draft" && (
                      <button
                        onClick={() => act(b.id, "start")}
                        disabled={actingId !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-bright disabled:opacity-50"
                      >
                        <PaperPlaneTilt size={13} />
                        Start
                      </button>
                    )}
                    {b.status === "running" && (
                      <button
                        onClick={() => act(b.id, "cancel")}
                        disabled={actingId !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
                      >
                        <Prohibit size={13} />
                        Cancel
                      </button>
                    )}
                    {(b.status === "completed" || b.status === "failed" || b.status === "cancelled") && (
                      <span className="text-xs text-fg-faint">Selesai</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
