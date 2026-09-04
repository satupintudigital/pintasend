"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  CaretLeft,
  CaretRight,
  MagnifyingGlass,
  Plus,
  Trash,
  UploadSimple,
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
    const parsed = JSON.parse(contact.tags ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Form tambah tunggal
  const [showAdd, setShowAdd] = useState(false);
  const [nomor, setNomor] = useState("");
  const [nama, setNama] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  // Import CSV
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (debouncedQ) p.set("q", debouncedQ);
      const res = await fetch(`/api/campaigns/contacts?${p.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat kontak");
      setContacts(data.contacts ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat kontak");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQ]);

  // Debounce pencarian → reset ke halaman 1 (setLoading di dalam load).
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
        body: JSON.stringify({ nomor, name: nama, tags: parseTags(tags) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan kontak");
      setShowAdd(false);
      setNomor("");
      setNama("");
      setTags("");
      setNotice("Kontak tersimpan.");
      setPage(1); void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan kontak");
    } finally {
      setSaving(false);
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal mengimpor CSV");
      setNotice(`Impor selesai: ${data.inserted} baru, ${data.updated} diperbarui${data.invalid ? `, ${data.invalid} baris tidak valid` : ""}.`);
      setPage(1); void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengimpor CSV");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function toggleOptOut(c: ContactView) {
    await fetch(`/api/campaigns/contacts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optedOut: !c.optedOut }),
    });
    void load();
  }

  async function removeContact(id: string) {
    await fetch(`/api/campaigns/contacts/${id}`, { method: "DELETE" });
    void load();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-fg">Kontak</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Audiens campaign — {total} kontak terdaftar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={() => void load()} disabled={loading}>
            <ArrowClockwise size={16} /> Muat ulang
          </button>
          <label className={btnGhost}>
            <UploadSimple size={16} />
            {importing ? "Mengimpor…" : "Impor CSV"}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={!hasAddon || importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importCsv(f);
              }}
            />
          </label>
          <button className={btnPrimary} onClick={() => setShowAdd((v) => !v)} disabled={!hasAddon}>
            <Plus size={16} /> Tambah Kontak
          </button>
        </div>
      </header>

      {!hasAddon && (
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

      {showAdd && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fg">Tambah Kontak</h2>
            <button onClick={() => setShowAdd(false)} aria-label="Tutup" className="text-fg-faint hover:text-fg">
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <input className={fieldClass} placeholder="6281234567890" value={nomor} onChange={(e) => setNomor(e.target.value)} />
            <input className={fieldClass} placeholder="Nama (opsional)" value={nama} onChange={(e) => setNama(e.target.value)} />
            <input className={fieldClass} placeholder="Tag, pisah ; (mis. vip;pelanggan)" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="mt-4 flex justify-end">
            <button className={btnPrimary} onClick={() => void addContact()} disabled={saving || !nomor.trim()}>
              {saving ? "Menyimpan…" : "Simpan"}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface">
        <div className="border-b border-line-soft p-4">
          <div className="relative max-w-sm">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
            <input
              className={`${fieldClass} pl-9`}
              placeholder="Cari nomor / nama…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-fg-faint">Memuat…</p>
        ) : contacts.length === 0 ? (
          <p className="p-8 text-center text-sm text-fg-faint">
            Belum ada kontak. Tambah manual atau impor CSV (kolom: nomor, nama, tags).
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {contacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">
                    {c.name || <span className="text-fg-faint">(tanpa nama)</span>}
                  </p>
                  <p className="truncate font-mono text-xs text-fg-faint">{c.chatId}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {tagsOf(c).map((t) => (
                    <span key={t} className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent-bright">
                      {t}
                    </span>
                  ))}
                </div>
                {c.optedOut && (
                  <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 font-mono text-[10px] text-red-300">
                    opt-out
                  </span>
                )}
                <div className="flex gap-1.5">
                  <button
                    className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg"
                    onClick={() => void toggleOptOut(c)}
                  >
                    {c.optedOut ? "Aktifkan" : "Opt-out"}
                  </button>
                  <button
                    className="rounded-lg border border-red-500/20 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                    onClick={() => void removeContact(c.id)}
                    aria-label={`Hapus ${c.chatId}`}
                  >
                    <Trash size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-line-soft p-4">
            <button className={btnGhost} onClick={() => setPage((v) => Math.max(1, v - 1))} disabled={page <= 1}>
              <CaretLeft size={14} /> Sebelumnya
            </button>
            <span className="font-mono text-xs text-fg-faint">
              Halaman {page}/{totalPages}
            </span>
            <button className={btnGhost} onClick={() => setPage((v) => Math.min(totalPages, v + 1))} disabled={page >= totalPages}>
              Berikutnya <CaretRight size={14} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
