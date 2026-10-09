"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  CaretLeft,
  CaretRight,
  DownloadSimple,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  UploadSimple,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";

export interface ContactView {
  id: string;
  chatId: string;
  name: string | null;
  tags: string;
  optedOut: boolean;
  notes: string | null;
  createdAt: string;
}

const PAGE_SIZE = 20;

const fieldClass =
  "min-h-11 w-full rounded-xl border border-line bg-ink-2 px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50";
const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line px-3.5 py-2.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50";

function parseTags(raw: string): string[] {
  return raw
    .split(/[;,|]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function tagsOf(contact: ContactView): string[] {
  try {
    const p = typeof contact.tags === "string" ? JSON.parse(contact.tags) : contact.tags;
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

export function ContactsPanel({ hasAddon }: { hasAddon: boolean }) {
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [optedOutFilter, setOptedOutFilter] = useState<"all" | "active" | "opted_out">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Form tambah tunggal
  const [showAdd, setShowAdd] = useState(false);
  const [nomor, setNomor] = useState("");
  const [nama, setNama] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Modal edit
  const [editingContact, setEditingContact] = useState<ContactView | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editOptedOut, setEditOptedOut] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Import CSV
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (debouncedQ) p.set("q", debouncedQ);
      if (selectedTag) p.set("tag", selectedTag);
      if (optedOutFilter === "active") p.set("optedOut", "false");
      if (optedOutFilter === "opted_out") p.set("optedOut", "true");

      const res = await fetch(`/api/campaigns/contacts?${p.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat kontak");
      setContacts(data.contacts ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat kontak");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ, selectedTag, optedOutFilter]);

  // Debounce pencarian
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(query.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function addContact() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/campaigns/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomor,
          name: nama.trim() || undefined,
          tags: parseTags(tags),
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan kontak");
      setShowAdd(false);
      setNomor("");
      setNama("");
      setTags("");
      setNotes("");
      setNotice("Kontak berhasil ditambahkan.");
      setPage(1);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan kontak");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(c: ContactView) {
    setEditingContact(c);
    setEditName(c.name ?? "");
    setEditTags(tagsOf(c).join(", "));
    setEditNotes(c.notes ?? "");
    setEditOptedOut(c.optedOut);
  }

  async function updateContact() {
    if (!editingContact) return;
    setUpdating(true);
    setError("");
    try {
      const res = await fetch(`/api/campaigns/contacts/${editingContact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || null,
          tags: parseTags(editTags),
          notes: editNotes.trim() || null,
          optedOut: editOptedOut,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengupdate kontak");
      setEditingContact(null);
      setNotice("Kontak berhasil diperbarui.");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengupdate kontak");
    } finally {
      setUpdating(false);
    }
  }

  async function importCsv(file: File) {
    setImporting(true);
    setError("");
    try {
      const csv = await file.text();
      const res = await fetch("/api/campaigns/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengimpor CSV");
      setNotice(
        `Impor selesai: ${data.inserted ?? 0} baru, ${data.updated ?? 0} diperbarui${
          data.invalid ? `, ${data.invalid} baris tidak valid` : ""
        }.`
      );
      setPage(1);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengimpor CSV");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const p = new URLSearchParams({ page: "1", limit: "10000" });
      if (debouncedQ) p.set("q", debouncedQ);
      if (selectedTag) p.set("tag", selectedTag);
      if (optedOutFilter === "active") p.set("optedOut", "false");
      if (optedOutFilter === "opted_out") p.set("optedOut", "true");

      const res = await fetch(`/api/campaigns/contacts?${p.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengekspor kontak");
      const list = (data.contacts ?? []) as ContactView[];

      const rows = [["Nomor", "Nama", "Tags", "OptOut", "Catatan", "Dibuat"]];
      for (const c of list) {
        rows.push([
          c.chatId.replace(/@c\.us$/, ""),
          c.name ?? "",
          tagsOf(c).join(";"),
          c.optedOut ? "Ya" : "Tidak",
          c.notes ?? "",
          c.createdAt,
        ]);
      }

      const csvContent = rows
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kontak-pintasend-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengekspor kontak");
    } finally {
      setExporting(false);
    }
  }

  async function toggleOptOut(c: ContactView) {
    try {
      await fetch(`/api/campaigns/contacts/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optedOut: !c.optedOut }),
      });
      void load();
    } catch {
      /* noop */
    }
  }

  async function removeContact(id: string, nameOrPhone: string) {
    if (!window.confirm(`Hapus kontak "${nameOrPhone}"?`)) return;
    try {
      await fetch(`/api/campaigns/contacts/${id}`, { method: "DELETE" });
      void load();
    } catch {
      /* noop */
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">Kontak</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Buku kontak & audiens — {total} kontak terdaftar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={() => void load()} disabled={loading}>
            <ArrowClockwise size={16} /> Muat ulang
          </button>
          <button className={btnGhost} onClick={() => void exportCsv()} disabled={exporting || loading}>
            <DownloadSimple size={16} /> {exporting ? "Mengekspor…" : "Ekspor CSV"}
          </button>
          <label className={btnGhost}>
            <UploadSimple size={16} />
            {importing ? "Mengimpor…" : "Impor CSV"}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importCsv(f);
              }}
            />
          </label>
          <button className={btnPrimary} onClick={() => setShowAdd((v) => !v)}>
            <Plus size={16} weight="bold" /> Tambah Kontak
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {notice && !error && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      {showAdd && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Tambah Kontak Baru</h2>
            <button onClick={() => setShowAdd(false)} aria-label="Tutup" className="text-fg-faint hover:text-fg">
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              className={fieldClass}
              placeholder="Nomor WA (0812... / 62812...)"
              value={nomor}
              onChange={(e) => setNomor(e.target.value)}
            />
            <input
              className={fieldClass}
              placeholder="Nama kontak (opsional)"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
            />
            <input
              className={fieldClass}
              placeholder="Tag (vip, lead, pelanggan)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <input
              className={fieldClass}
              placeholder="Catatan (opsional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button className={btnGhost} onClick={() => setShowAdd(false)}>
              Batal
            </button>
            <button className={btnPrimary} onClick={() => void addContact()} disabled={saving || !nomor.trim()}>
              {saving ? "Menyimpan…" : "Simpan Kontak"}
            </button>
          </div>
        </section>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <MagnifyingGlass size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            className={`${fieldClass} pl-10`}
            placeholder="Cari nomor atau nama..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className={`${fieldClass} w-auto min-w-[140px]`}
          value={optedOutFilter}
          onChange={(e) => {
            setOptedOutFilter(e.target.value as "all" | "active" | "opted_out");
            setPage(1);
          }}
        >
          <option value="all">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="opted_out">Opt-Out</option>
        </select>
        {selectedTag && (
          <button
            onClick={() => {
              setSelectedTag("");
              setPage(1);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs font-medium text-accent-bright"
          >
            Tag: {selectedTag} <X size={14} />
          </button>
        )}
      </div>

      {/* Table Section */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {loading && contacts.length === 0 ? (
          <div className="p-8 text-center text-sm text-fg-faint">Memuat data kontak…</div>
        ) : contacts.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-fg">Belum ada kontak ditemukan</p>
            <p className="mt-1 text-xs text-fg-muted">
              Tambahkan kontak manual atau gunakan fitur Impor CSV untuk memasukkan daftar nomor.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-2/60 text-xs uppercase tracking-wider text-fg-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Kontak</th>
                  <th className="px-4 py-3 font-semibold">Tags</th>
                  <th className="px-4 py-3 font-semibold">Catatan</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {contacts.map((c) => {
                  const tagList = tagsOf(c);
                  const cleanPhone = c.chatId.replace(/@c\.us$/, "");
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-surface-2/40">
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-fg">{c.name || cleanPhone}</div>
                        <div className="font-mono text-xs text-fg-faint">{cleanPhone}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {tagList.length > 0 ? (
                            tagList.map((t) => (
                              <button
                                key={t}
                                onClick={() => {
                                  setSelectedTag(t);
                                  setPage(1);
                                }}
                                className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs text-fg-muted hover:border-accent/40 hover:text-accent-bright"
                              >
                                {t}
                              </button>
                            ))
                          ) : (
                            <span className="text-xs text-fg-faint">-</span>
                          )}
                        </div>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3.5 text-xs text-fg-muted">
                        {c.notes || "-"}
                      </td>
                      <td className="px-4 py-3.5">
                        {c.optedOut ? (
                          <span className="inline-flex rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                            Opt-Out
                          </span>
                        ) : (
                          <span className="inline-flex rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                            Aktif
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <a
                            href={`https://wa.me/${cleanPhone}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Chat di WhatsApp"
                            className="rounded-lg p-1.5 text-fg-faint hover:bg-surface-2 hover:text-emerald-400"
                          >
                            <WhatsappLogo size={16} />
                          </a>
                          <button
                            onClick={() => openEdit(c)}
                            title="Edit kontak"
                            className="rounded-lg p-1.5 text-fg-faint hover:bg-surface-2 hover:text-fg"
                          >
                            <PencilSimple size={16} />
                          </button>
                          <button
                            onClick={() => void toggleOptOut(c)}
                            title={c.optedOut ? "Aktifkan kontak" : "Opt-out kontak"}
                            className="rounded-lg px-2 py-1 text-xs text-fg-faint hover:bg-surface-2 hover:text-fg"
                          >
                            {c.optedOut ? "Aktifkan" : "Opt-out"}
                          </button>
                          <button
                            onClick={() => void removeContact(c.id, c.name || cleanPhone)}
                            title="Hapus kontak"
                            className="rounded-lg p-1.5 text-fg-faint hover:bg-surface-2 hover:text-red-400"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-fg-muted">
            <span>
              Halaman {page} dari {totalPages} ({total} total)
            </span>
            <div className="flex gap-1">
              <button
                className={btnGhost}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <CaretLeft size={14} /> Sebelumnya
              </button>
              <button
                className={btnGhost}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Berikutnya <CaretRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Edit Kontak */}
      {editingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-fg">Edit Kontak</h2>
              <button
                onClick={() => setEditingContact(null)}
                className="rounded-lg p-1.5 text-fg-faint hover:bg-surface-2 hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 font-mono text-xs text-fg-faint">
              {editingContact.chatId.replace(/@c\.us$/, "")}
            </p>

            <div className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Nama Kontak</label>
                <input
                  className={fieldClass}
                  placeholder="Nama kontak"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Tags (pisahkan dengan koma)</label>
                <input
                  className={fieldClass}
                  placeholder="vip, pelanggan, jabodetabek"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-fg-muted">Catatan Internal</label>
                <textarea
                  className={`${fieldClass} min-h-[80px] py-2`}
                  placeholder="Catatan mengenai kontak ini..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-fg cursor-pointer">
                <input
                  type="checkbox"
                  checked={editOptedOut}
                  onChange={(e) => setEditOptedOut(e.target.checked)}
                  className="rounded border-line bg-ink-2 text-accent focus:ring-accent"
                />
                <span>Tandai Opt-Out (jangan kirim blast campaign)</span>
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button className={btnGhost} onClick={() => setEditingContact(null)}>
                Batal
              </button>
              <button className={btnPrimary} onClick={() => void updateContact()} disabled={updating}>
                {updating ? "Menyimpan…" : "Simpan Perubahan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
