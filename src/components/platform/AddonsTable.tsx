"use client";

import { useState } from "react";
import { CheckCircle, Plus, Warning } from "@phosphor-icons/react";

interface AddonRow {
  key: string;
  name: string;
  tagline: string;
  priceMonthly: number | null;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  initial: AddonRow[];
}

// Kelola katalog addon: buat baru, edit nama/tagline/harga, arsip (nonaktif).
// Addon non-aktif otomatis hilang dari katalog publik & checkout (catalog.ts
// memfilter isActive) — tenant yang sudah punya tidak terpengaruh.
export function AddonsTable({ initial }: Props) {
  const [addons, setAddons] = useState(initial);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [form, setForm] = useState({ key: "", name: "", tagline: "", price: "" });

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
  };

  async function save(a: AddonRow) {
    setSavingKey(a.key);
    setFeedback(null);
    try {
      const res = await fetch(`/api/platform/addons/${a.key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: a.name,
          tagline: a.tagline,
          priceMonthly: a.priceMonthly,
          isActive: a.isActive,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan");
      setFeedback({ ok: true, msg: `Addon '${a.name}' tersimpan` });
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Gagal menyimpan" });
    } finally {
      setSavingKey(null);
    }
  }

  async function create() {
    setCreating(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/platform/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: form.key,
          name: form.name,
          tagline: form.tagline,
          priceMonthly: form.price === "" ? null : (num(form.price) ?? null),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        addon?: AddonRow;
      };
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat addon");
      if (data.addon) {
        setAddons((xs) => [...xs, data.addon as AddonRow]);
        setForm({ key: "", name: "", tagline: "", price: "" });
        setShowCreate(false);
        setFeedback({ ok: true, msg: `Addon '${data.addon.name}' dibuat` });
      }
    } catch (e) {
      setFeedback({ ok: false, msg: e instanceof Error ? e.message : "Gagal membuat addon" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">Addon katalog ({addons.length})</h2>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.97]"
        >
          <Plus size={14} weight="bold" />
          {showCreate ? "Tutup" : "Tambah addon"}
        </button>
      </div>

      {showCreate && (
        <div className="grid grid-cols-1 gap-3 border-b border-line-soft px-4 py-4 sm:grid-cols-6">
          <input
            value={form.key}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
            placeholder="key (remove_watermark)"
            className="rounded-lg border border-line bg-ink-2 px-2.5 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none sm:col-span-1"
          />
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nama addon"
            className="rounded-lg border border-line bg-ink-2 px-2.5 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none sm:col-span-1"
          />
          <input
            value={form.tagline}
            onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
            placeholder="Tagline singkat"
            className="rounded-lg border border-line bg-ink-2 px-2.5 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none sm:col-span-2"
          />
          <input
            type="number"
            min={0}
            step={5000}
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="Rp/bulan (kosong = tak dijual)"
            className="rounded-lg border border-line bg-ink-2 px-2.5 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none sm:col-span-1"
          />
          <button
            type="button"
            onClick={create}
            disabled={creating || !form.key.trim() || !form.name.trim()}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.97] disabled:opacity-50 sm:col-span-1"
          >
            {creating ? "Membuat…" : "Buat"}
          </button>
        </div>
      )}

      {feedback && (
        <p
          className={`flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-xs ${
            feedback.ok ? "text-accent-bright" : "text-red-600"
          }`}
        >
          {feedback.ok ? <CheckCircle size={14} weight="fill" /> : <Warning size={14} weight="fill" />}
          {feedback.msg}
        </p>
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line-soft text-xs uppercase tracking-wider text-fg-faint">
            <th className="px-4 py-3">Key</th>
            <th className="px-4 py-3">Nama</th>
            <th className="px-4 py-3">Tagline</th>
            <th className="px-4 py-3 text-right">Rp/bulan</th>
            <th className="px-4 py-3 text-center">Aktif</th>
            <th className="px-4 py-3 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {addons.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-fg-faint">
                Belum ada addon di katalog.
              </td>
            </tr>
          ) : (
            addons.map((a) => (
              <tr key={a.key} className="border-b border-line-soft/60 last:border-0">
                <td className="px-4 py-3">
                  <code className="rounded bg-ink-2 px-1.5 py-0.5 font-mono text-xs text-fg-muted">
                    {a.key}
                  </code>
                </td>
                <td className="px-4 py-3">
                  <input
                    value={a.name}
                    onChange={(e) =>
                      setAddons((xs) =>
                        xs.map((x) => (x.key === a.key ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    className="w-36 rounded-lg border border-line bg-ink-2 px-2 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    value={a.tagline}
                    onChange={(e) =>
                      setAddons((xs) =>
                        xs.map((x) => (x.key === a.key ? { ...x, tagline: e.target.value } : x)),
                      )
                    }
                    className="w-56 rounded-lg border border-line bg-ink-2 px-2 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    value={a.priceMonthly ?? ""}
                    placeholder="gratis"
                    onChange={(e) =>
                      setAddons((xs) =>
                        xs.map((x) =>
                          x.key === a.key
                            ? {
                                ...x,
                                priceMonthly:
                                  e.target.value === "" ? null : (num(e.target.value) ?? null),
                              }
                            : x,
                        ),
                      )
                    }
                    className="bk-tabular w-28 rounded-lg border border-line bg-ink-2 px-2 py-1.5 text-right text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={a.isActive}
                    title={a.isActive ? "Arsip (sembunyikan dari katalog)" : "Aktifkan kembali"}
                    onClick={() =>
                      setAddons((xs) =>
                        xs.map((x) => (x.key === a.key ? { ...x, isActive: !x.isActive } : x)),
                      )
                    }
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      a.isActive ? "bg-accent" : "bg-line"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        a.isActive ? "translate-x-[22px]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={savingKey === a.key}
                    onClick={() => save(a)}
                    className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.97] disabled:opacity-50"
                  >
                    {savingKey === a.key ? "Menyimpan…" : "Simpan"}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="border-t border-line-soft px-4 py-3 text-xs text-fg-faint">
        Harga kosong = tidak dijual mandiri (grant manual platform). Addon non-aktif tidak muncul di
        halaman harga/checkout tapi tidak mencabut addon tenant yang sudah aktif. Key baru yang belum
        di-wire ke perilaku kode hanya tercatat sebagai pembelian — perilaku menyusul saat fitur
        dikembangkan.
      </p>
    </div>
  );
}
