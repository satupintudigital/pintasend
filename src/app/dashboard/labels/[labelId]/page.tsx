"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Trash,
  Warning,
  SpinnerGap,
  UserCircle,
  X,
  Tag,
  ChatCircleText,
} from "@phosphor-icons/react";

interface LabelInfo {
  id: string;
  name: string;
  color: string;
}

interface ChatEntry {
  chatId: string;
  addedAt: string;
}

export default function LabelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const labelId = params.labelId as string;

  const [label, setLabel] = useState<LabelInfo | null>(null);
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [chatIdInput, setChatIdInput] = useState("");
  const [adding, setAdding] = useState(false);

  const loadLabel = useCallback(async () => {
    try {
      const res = await fetch(`/api/labels/${labelId}/chats`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Gagal memuat label (${res.status})`);
      setLabel(data.label);
      setChats(data.chats ?? []);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [labelId]);

  useEffect(() => { loadLabel(); }, [loadLabel]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!chatIdInput.trim() || adding) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/labels/${labelId}/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chatIdInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal menambah chat");
      setAddOpen(false);
      setChatIdInput("");
      loadLabel();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(chatId: string) {
    if (!window.confirm(`Hapus ${chatId} dari label ini?`)) return;
    try {
      const res = await fetch(`/api/labels/${labelId}/chats/${encodeURIComponent(chatId)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Gagal menghapus");
      }
      loadLabel();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    } catch { return iso; }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/dashboard/labels")}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="h-6 w-32 animate-pulse rounded bg-surface-2" />
          ) : label ? (
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: label.color + "20", color: label.color }}
              >
                <Tag size={14} />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Label</p>
                <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                  {label.name}
                </h1>
              </div>
            </div>
          ) : null}
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-[0_0_28px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.97]"
        >
          <Plus size={16} weight="bold" />
          Tambah Chat
        </button>
      </div>

      {error && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
          {error}
        </p>
      )}

      {/* Chat list */}
      <div className="mt-8">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
                <div className="h-10 w-10 animate-pulse rounded-full bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-32 animate-pulse rounded bg-surface-2" />
                  <div className="h-2.5 w-20 animate-pulse rounded bg-line-soft" />
                </div>
              </div>
            ))}
          </div>
        ) : chats.length === 0 ? (
          <div className="rounded-3xl border border-line bg-surface px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent-bright">
              <ChatCircleText size={28} />
            </div>
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Belum ada chat</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">Tambah chat ke label ini</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
              Masukkan JID WhatsApp (mis. 6281234567890@c.us) untuk menambahkan chat ke label.
            </p>
            <button
              onClick={() => setAddOpen(true)}
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink"
            >
              <Plus size={16} weight="bold" />
              Tambah Chat
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="bk-tabular mb-3 font-mono text-xs text-fg-faint">
              {chats.length} chat
            </p>
            {chats.map((chat) => (
              <div
                key={chat.chatId}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/20"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line-soft bg-surface-2 text-fg-muted">
                  <UserCircle size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-fg">{chat.chatId}</p>
                  <p className="font-mono text-xs text-fg-faint">
                    Ditambahkan {formatTime(chat.addedAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(chat.chatId)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-red-500/10 hover:text-red-400"
                  aria-label={`Hapus ${chat.chatId}`}
                >
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Chat Modal */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setAddOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Tambah Chat</p>
                <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
                  Tambah ke {label?.name ?? "Label"}
                </h2>
                <p className="mt-1 text-sm text-fg-muted">
                  Masukkan JID WhatsApp (mis. 6281234567890@c.us)
                </p>
              </div>
              <button
                onClick={() => setAddOpen(false)}
                className="-m-2 flex h-11 w-11 items-center justify-center rounded-xl text-fg-faint hover:bg-surface-2 hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdd} className="mt-6 space-y-4">
              <div>
                <label htmlFor="chat-id" className="mb-1.5 block text-sm font-medium text-fg">
                  Chat JID
                </label>
                <input
                  id="chat-id"
                  value={chatIdInput}
                  onChange={(e) => setChatIdInput(e.target.value)}
                  placeholder="6281234567890@c.us"
                  required
                  autoFocus
                  className="min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 font-mono text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>
              <button
                type="submit"
                disabled={adding}
                className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.99] disabled:opacity-50"
              >
                {adding ? "Menambahkan…" : "Tambah Chat"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
