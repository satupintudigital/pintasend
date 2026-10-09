"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Trash,
  Tag,
  X,
  Warning,
  SpinnerGap,
  PencilSimple,
} from "@phosphor-icons/react";
import { Spotlight } from "@/components/Spotlight";

interface Label {
  id: string;
  name: string;
  color: string;
  contactCount: number;
  openwaSynced: boolean;
}

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#64748b", "#78716c",
];

export default function LabelsPage() {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState("#6366f1");
  const [submitting, setSubmitting] = useState(false);

  const loadLabels = useCallback(async () => {
    try {
      const res = await fetch("/api/labels");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Gagal memuat label (${res.status})`);
      setLabels(data.labels ?? []);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLabels(); }, [loadLabels]);

  function openCreate() {
    setEditingLabel(null);
    setFormName("");
    setFormColor("#6366f1");
    setModalOpen(true);
  }

  function openEdit(label: Label) {
    setEditingLabel(label);
    setFormName(label.name);
    setFormColor(label.color);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || submitting) return;
    setSubmitting(true);
    try {
      if (editingLabel) {
        const res = await fetch(`/api/labels/${editingLabel.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), color: formColor }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error ?? "Gagal update label");
        }
      } else {
        const res = await fetch("/api/labels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), color: formColor }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error ?? "Gagal membuat label");
        }
      }
      setModalOpen(false);
      loadLabels();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteLabel(id: string, name: string) {
    if (!window.confirm(`Hapus label "${name}"?`)) return;
    try {
      const res = await fetch(`/api/labels/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal menghapus label");
      loadLabels();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Labels</p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Label Kontak
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            Organisir kontak dengan label untuk segmentasi dan campaign.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink shadow-[0_0_28px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.97]"
        >
          <Plus size={16} weight="bold" />
          Tambah Label
        </button>
      </div>

      {error && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
          {error}
        </p>
      )}

      <div className="mt-8">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-xl bg-surface-2" />
                  <div className="space-y-2">
                    <div className="h-3.5 w-28 animate-pulse rounded bg-surface-2" />
                    <div className="h-2.5 w-20 animate-pulse rounded bg-line-soft" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : labels.length === 0 ? (
          <div className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent-bright">
              <Tag size={28} />
            </div>
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Belum ada label</p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-tight">Buat label pertama</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
              Label membantu mengorganisir kontak untuk campaign dan segmentasi.
            </p>
            <button
              onClick={openCreate}
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-ink"
            >
              <Plus size={16} weight="bold" />
              Tambah Label
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {labels.map((label) => (
              <Spotlight
                key={label.id}
                className="bk-lift group rounded-2xl border border-line bg-surface p-5 hover:border-accent/30"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: label.color + "20", color: label.color }}
                    >
                      <Tag size={18} />
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/labels/${label.id}`}
                        className="truncate font-medium text-fg hover:text-accent-bright transition-colors"
                      >
                        {label.name}
                      </Link>
                      <p className="font-mono text-xs text-fg-faint">
                        {label.contactCount} kontak
                        {label.openwaSynced && <span className="ml-1.5 text-accent-bright">· synced</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(label)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
                      aria-label={`Edit ${label.name}`}
                    >
                      <PencilSimple size={14} />
                    </button>
                    <button
                      onClick={() => deleteLabel(label.id, label.name)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-red-500/10 hover:text-red-400"
                      aria-label={`Hapus ${label.name}`}
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </div>
              </Spotlight>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.3)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
                  {editingLabel ? "Edit Label" : "Label Baru"}
                </p>
                <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
                  {editingLabel ? "Edit Label" : "Tambah Label"}
                </h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="-m-2 flex h-11 w-11 items-center justify-center rounded-xl text-fg-faint hover:bg-surface-2 hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="label-name" className="mb-1.5 block text-sm font-medium text-fg">Nama</label>
                <input
                  id="label-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="mis. VIP Customer, New Lead"
                  maxLength={50}
                  required
                  autoFocus
                  className="min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-fg">Warna</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className={`h-8 w-8 rounded-lg transition-all ${formColor === c ? "ring-2 ring-fg ring-offset-2 ring-offset-surface scale-110" : "hover:scale-105"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.99] disabled:opacity-50"
              >
                {submitting ? "Menyimpan…" : editingLabel ? "Simpan" : "Buat Label"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
