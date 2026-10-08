"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Trash,
  Robot,
  X,
  Warning,
  SpinnerGap,
  PencilSimple,
  Check,
  MagnifyingGlass,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { Spotlight } from "@/components/Spotlight";

interface BotRule {
  id: string;
  name: string;
  keyword: string;
  matchType: "exact" | "contains" | "starts_with";
  response: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function BotRulePanel() {
  const [rules, setRules] = useState<BotRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<BotRule | null>(null);
  const [formName, setFormName] = useState("");
  const [formKeyword, setFormKeyword] = useState("");
  const [formMatchType, setFormMatchType] = useState<"exact" | "contains" | "starts_with">("exact");
  const [formResponse, setFormResponse] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/rules");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat daftar bot rules");
      setRules(data.rules ?? []);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  function openCreate() {
    setEditingRule(null);
    setFormName("");
    setFormKeyword("");
    setFormMatchType("exact");
    setFormResponse("");
    setFormIsActive(true);
    setModalOpen(true);
  }

  function openEdit(rule: BotRule) {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormKeyword(rule.keyword);
    setFormMatchType(rule.matchType);
    setFormResponse(rule.response);
    setFormIsActive(rule.isActive);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !formKeyword.trim() || !formResponse.trim() || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        name: formName.trim(),
        keyword: formKeyword.trim(),
        matchType: formMatchType,
        response: formResponse.trim(),
        isActive: formIsActive,
      };

      if (editingRule) {
        const res = await fetch(`/api/bot/rules/${editingRule.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Gagal memperbarui bot rule");
      } else {
        const res = await fetch("/api/bot/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Gagal membuat bot rule");
      }

      setModalOpen(false);
      loadRules();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(rule: BotRule) {
    try {
      const res = await fetch(`/api/bot/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Gagal mengubah status rule");
      }
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, isActive: !r.isActive } : r))
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete(rule: BotRule) {
    if (!window.confirm(`Hapus aturan bot "${rule.name}"?`)) return;
    try {
      const res = await fetch(`/api/bot/rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Gagal menghapus bot rule");
      }
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const filteredRules = rules.filter(
    (r) =>
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.keyword.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.response.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header action bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-faint text-base" />
          <input
            type="text"
            placeholder="Cari berdasarkan nama, keyword, atau response..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-surface-2/60 border border-border pl-10 pr-4 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
          />
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-fg px-4 py-2 text-sm font-medium transition-colors shadow-sm"
        >
          <Plus className="text-base" />
          <span>Tambah Bot Rule</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-500 flex items-center gap-3">
          <Warning className="text-lg shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} className="hover:opacity-70">
            <X className="text-base" />
          </button>
        </div>
      )}

      {/* Table Section */}
      <div className="rounded-2xl bg-surface border border-border overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-fg-muted gap-3 text-sm">
            <SpinnerGap className="animate-spin text-xl text-accent" />
            <span>Memuat aturan auto-reply...</span>
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center text-fg-muted mb-3">
              <Robot className="text-xl" />
            </div>
            <h3 className="font-medium text-fg">Belum ada aturan bot</h3>
            <p className="text-sm text-fg-muted mt-1 max-w-sm mx-auto">
              {searchQuery
                ? "Tidak ada aturan bot yang cocok dengan pencarian Anda."
                : "Buat aturan auto-reply pertama untuk merespon pesan masuk secara otomatis berdasarkan keyword."}
            </p>
            {!searchQuery && (
              <button
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-fg px-4 py-2 text-sm font-medium transition-colors border border-border"
              >
                <Plus className="text-base" />
                <span>Buat Rule</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-2/40 text-xs font-mono uppercase tracking-wider text-fg-muted">
                  <th className="py-3 px-4">Nama</th>
                  <th className="py-3 px-4">Keyword</th>
                  <th className="py-3 px-4">Match Type</th>
                  <th className="py-3 px-4">Preview Response</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {filteredRules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-surface-2/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-fg">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                          <Robot className="text-base" />
                        </div>
                        <span className="truncate max-w-[180px]" title={rule.name}>
                          {rule.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">
                      <span className="inline-block bg-surface-2 border border-border px-2 py-1 rounded-md text-fg">
                        {rule.keyword}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={`inline-px px-2.5 py-1 rounded-full font-medium ${
                          rule.matchType === "exact"
                            ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                            : rule.matchType === "starts_with"
                            ? "bg-purple-500/10 text-purple-500 border border-purple-500/20"
                            : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                        }`}
                      >
                        {rule.matchType === "exact"
                          ? "Exact (Persis)"
                          : rule.matchType === "starts_with"
                          ? "Starts With"
                          : "Contains (Mengandung)"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-fg-muted max-w-xs truncate" title={rule.response}>
                      {rule.response}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => toggleActive(rule)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          rule.isActive
                            ? "bg-green-500/10 text-green-500 border border-green-500/25 hover:bg-green-500/20"
                            : "bg-surface-2 text-fg-muted border border-border hover:bg-surface-3"
                        }`}
                        title="Klik untuk ubah status aktif/nonaktif"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            rule.isActive ? "bg-green-500" : "bg-fg-faint"
                          }`}
                        />
                        <span>{rule.isActive ? "Aktif" : "Nonaktif"}</span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEdit(rule)}
                          className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
                          title="Edit rule"
                        >
                          <PencilSimple className="text-base" />
                        </button>
                        <button
                          onClick={() => handleDelete(rule)}
                          className="p-1.5 rounded-lg text-fg-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          title="Hapus rule"
                        >
                          <Trash className="text-base" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialog Form Tambah / Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-surface border border-border p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
                  <Robot className="text-xl" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-fg">
                    {editingRule ? "Edit Bot Rule" : "Tambah Bot Rule Baru"}
                  </h3>
                  <p className="text-xs text-fg-muted">
                    Atur keyword otomatis dan pesan balasan untuk WhatsApp.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
              >
                <X className="text-lg" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-1.5">
                  Nama Rule <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Info Jam Buka"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-xl bg-surface-2/60 border border-border px-3.5 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-1.5">
                    Keyword / Kata Kunci <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: jam buka"
                    value={formKeyword}
                    onChange={(e) => setFormKeyword(e.target.value)}
                    className="w-full rounded-xl bg-surface-2/60 border border-border px-3.5 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-1.5">
                    Match Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formMatchType}
                    onChange={(e) =>
                      setFormMatchType(
                        e.target.value as "exact" | "contains" | "starts_with"
                      )
                    }
                    className="w-full rounded-xl bg-surface-2/60 border border-border px-3.5 py-2 text-sm text-fg focus:outline-none focus:border-accent"
                  >
                    <option value="exact">Exact (Persis sama)</option>
                    <option value="contains">Contains (Mengandung keyword)</option>
                    <option value="starts_with">Starts With (Diawali keyword)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-fg-muted mb-1.5">
                  Response / Pesan Balasan <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Tulis pesan balasan otomatis di sini..."
                  value={formResponse}
                  onChange={(e) => setFormResponse(e.target.value)}
                  className="w-full rounded-xl bg-surface-2/60 border border-border px-3.5 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:border-accent resize-y"
                />
              </div>

              <div className="flex items-center gap-3 pt-1">
                <input
                  type="checkbox"
                  id="formIsActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent accent-accent"
                />
                <label htmlFor="formIsActive" className="text-sm text-fg font-medium cursor-pointer">
                  Aktifkan rule ini sekarang
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent hover:bg-accent-hover text-accent-fg px-5 py-2 text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
                >
                  {submitting && <SpinnerGap className="animate-spin text-base" />}
                  <span>{editingRule ? "Simpan Perubahan" : "Buat Rule"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
