"use client";

import { useState } from "react";
import { CheckCircle, Plus, Warning } from "@phosphor-icons/react";

interface PlanRow {
  id: string;
  name: string;
  tagline: string;
  priceDisplay: string;
  priceMonthly: number | null;
  maxDevices: number;
  maxUsers: number;
  maxMessagesPerMonth: number | null;
  includesDelay: boolean;
  isActive: boolean;
  kind: string;
  isPublic: boolean;
  sortOrder: number;
}

interface PlansTableProps {
  initial: PlanRow[];
}

// Edit kuota per plan secara inline (number input) → PUT /api/platform/plans/[id].
export function PlansTable({ initial }: PlansTableProps) {
  const [plans, setPlans] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean; msg: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const emptyDraft = {
    name: "",
    tagline: "",
    priceDisplay: "",
    priceMonthly: "",
    kind: "subscription",
    maxDevices: "1",
    maxUsers: "1",
    maxMessagesPerMonth: "",
    sortOrder: "0",
    includesDelay: false,
  };
  const [draft, setDraft] = useState(emptyDraft);

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
  };

  async function save(p: PlanRow) {
    setSaving(p.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/platform/plans/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: p.name,
          priceDisplay: p.priceDisplay,
          priceMonthly: p.priceMonthly,
          maxDevices: p.maxDevices,
          maxUsers: p.maxUsers,
          maxMessagesPerMonth: p.maxMessagesPerMonth,
          includesDelay: p.includesDelay,
          isActive: p.isActive,
          isPublic: p.isPublic,
          sortOrder: p.sortOrder,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan");
      setFeedback({ id: p.id, ok: true, msg: "Tersimpan" });
    } catch (e) {
      setFeedback({
        id: p.id,
        ok: false,
        msg: e instanceof Error ? e.message : "Gagal menyimpan",
      });
    } finally {
      setSaving(null);
    }
  }

  async function create() {
    setCreating(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/platform/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          tagline: draft.tagline,
          priceDisplay: draft.priceDisplay,
          priceMonthly: draft.priceMonthly === "" ? null : (num(draft.priceMonthly) ?? null),
          kind: draft.kind,
          maxDevices: num(draft.maxDevices) ?? 1,
          maxUsers: num(draft.maxUsers) ?? 1,
          maxMessagesPerMonth:
            draft.maxMessagesPerMonth === "" ? null : (num(draft.maxMessagesPerMonth) ?? null),
          sortOrder: num(draft.sortOrder) ?? 0,
          includesDelay: draft.includesDelay,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        plan?: PlanRow;
      };
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat plan");
      if (data.plan) {
        setPlans((ps) => [...ps, data.plan as PlanRow]);
        setDraft(emptyDraft);
        setShowCreate(false);
        setFeedback({ id: "create", ok: true, msg: `Plan '${data.plan.name}' dibuat` });
      }
    } catch (e) {
      setFeedback({ id: "create", ok: false, msg: e instanceof Error ? e.message : "Gagal membuat plan" });
    } finally {
      setCreating(false);
    }
  }

  const inputCls =
    "rounded-lg border border-line bg-ink-2 px-2 py-1.5 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none";

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">Plan ({plans.length})</h2>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.97]"
        >
          <Plus size={14} weight="bold" />
          {showCreate ? "Tutup" : "Tambah plan"}
        </button>
      </div>

      {feedback?.id === "create" && (
        <p
          className={`flex items-center gap-2 border-b border-line-soft px-4 py-2.5 text-xs ${
            feedback.ok ? "text-accent-bright" : "text-red-600"
          }`}
        >
          {feedback.ok ? <CheckCircle size={14} weight="fill" /> : <Warning size={14} weight="fill" />}
          {feedback.msg}
        </p>
      )}

      {showCreate && (
        <div className="grid grid-cols-2 gap-3 border-b border-line-soft px-4 py-4 sm:grid-cols-4">
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Nama plan *"
            className={inputCls}
          />
          <select
            value={draft.kind}
            onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}
            className={inputCls}
          >
            <option value="subscription">subscription (bulanan)</option>
            <option value="prepaid">prepaid (per pesan)</option>
          </select>
          <input
            value={draft.priceDisplay}
            onChange={(e) => setDraft((d) => ({ ...d, priceDisplay: e.target.value }))}
            placeholder="Teks harga (Rp150rb/bln)"
            className={inputCls}
          />
          <input
            type="number"
            min={0}
            value={draft.priceMonthly}
            onChange={(e) => setDraft((d) => ({ ...d, priceMonthly: e.target.value }))}
            placeholder="Rp/bulan nominal"
            className={inputCls}
          />
          <input
            value={draft.tagline}
            onChange={(e) => setDraft((d) => ({ ...d, tagline: e.target.value }))}
            placeholder="Tagline singkat"
            className={`${inputCls} sm:col-span-2`}
          />
          <input
            type="number"
            min={0}
            value={draft.maxDevices}
            onChange={(e) => setDraft((d) => ({ ...d, maxDevices: e.target.value }))}
            placeholder="Max device"
            className={inputCls}
          />
          <input
            type="number"
            min={0}
            value={draft.maxUsers}
            onChange={(e) => setDraft((d) => ({ ...d, maxUsers: e.target.value }))}
            placeholder="Max user"
            className={inputCls}
          />
          <input
            type="number"
            min={0}
            value={draft.maxMessagesPerMonth}
            onChange={(e) => setDraft((d) => ({ ...d, maxMessagesPerMonth: e.target.value }))}
            placeholder="Pesan/bulan (kosong=∞)"
            className={inputCls}
          />
          <input
            type="number"
            min={0}
            value={draft.sortOrder}
            onChange={(e) => setDraft((d) => ({ ...d, sortOrder: e.target.value }))}
            placeholder="Urutan"
            className={inputCls}
          />
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <input
              type="checkbox"
              checked={draft.includesDelay}
              onChange={(e) => setDraft((d) => ({ ...d, includesDelay: e.target.checked }))}
            />
            Termasuk random delay
          </label>
          <button
            type="button"
            onClick={create}
            disabled={creating || !draft.name.trim()}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.97] disabled:opacity-50"
          >
            {creating ? "Membuat…" : "Buat plan"}
          </button>
        </div>
      )}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line-soft text-xs uppercase tracking-wider text-fg-faint">
            <th className="px-4 py-3">Plan</th>
            <th className="px-4 py-3 text-right">Device</th>
            <th className="px-4 py-3 text-right">User</th>
            <th className="px-4 py-3 text-right">Pesan/bulan</th>
            <th className="px-4 py-3 text-right">Rp/bulan</th>
            <th className="px-4 py-3 text-center">Katalog</th>
            <th className="px-4 py-3 text-right">Urutan</th>
            <th className="px-4 py-3 text-center">Delay</th>
            <th className="px-4 py-3">Aktif</th>
            <th className="px-4 py-3 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id} className="border-b border-line-soft/60 last:border-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <input
                    value={p.name}
                    onChange={(e) =>
                      setPlans((ps) =>
                        ps.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    className="w-24 rounded-lg border border-transparent bg-transparent px-1 py-0.5 font-medium text-fg hover:border-line focus:border-accent focus:bg-ink-2 focus:outline-none"
                  />
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      p.kind === "prepaid" ? "bg-amber-300/10 text-amber-200" : "bg-accent/10 text-accent-bright"
                    }`}
                  >
                    {p.kind === "prepaid" ? "per pesan" : "bulanan"}
                  </span>
                </div>
                <input
                  value={p.priceDisplay}
                  onChange={(e) =>
                    setPlans((ps) =>
                      ps.map((x) => (x.id === p.id ? { ...x, priceDisplay: e.target.value } : x)),
                    )
                  }
                  className="w-40 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs text-fg-faint hover:border-line focus:border-accent focus:bg-ink-2 focus:text-fg focus:outline-none"
                />
              </td>
              <td className="px-4 py-3 text-right">
                <input
                  type="number"
                  min={0}
                  value={p.maxDevices}
                  onChange={(e) =>
                    setPlans((ps) =>
                      ps.map((x) =>
                        x.id === p.id ? { ...x, maxDevices: num(e.target.value) ?? 0 } : x,
                      ),
                    )
                  }
                  className="bk-tabular w-20 rounded-lg border border-line bg-ink-2 px-2 py-1.5 text-right text-sm text-fg focus:border-accent focus:outline-none"
                />
              </td>
              <td className="px-4 py-3 text-right">
                <input
                  type="number"
                  min={0}
                  value={p.maxUsers}
                  onChange={(e) =>
                    setPlans((ps) =>
                      ps.map((x) =>
                        x.id === p.id ? { ...x, maxUsers: num(e.target.value) ?? 0 } : x,
                      ),
                    )
                  }
                  className="bk-tabular w-20 rounded-lg border border-line bg-ink-2 px-2 py-1.5 text-right text-sm text-fg focus:border-accent focus:outline-none"
                />
              </td>
              <td className="px-4 py-3 text-right">
                <input
                  type="number"
                  min={0}
                  value={p.maxMessagesPerMonth ?? ""}
                  placeholder="unlimited"
                  onChange={(e) =>
                    setPlans((ps) =>
                      ps.map((x) =>
                        x.id === p.id
                          ? {
                              ...x,
                              maxMessagesPerMonth:
                                e.target.value === "" ? null : (num(e.target.value) ?? null),
                            }
                          : x,
                      ),
                    )
                  }
                  className="bk-tabular w-24 rounded-lg border border-line bg-ink-2 px-2 py-1.5 text-right text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                />
              </td>
              <td className="px-4 py-3 text-right">
                <input
                  type="number"
                  min={0}
                  step={5000}
                  value={p.priceMonthly ?? ""}
                  placeholder="gratis"
                  onChange={(e) =>
                    setPlans((ps) =>
                      ps.map((x) =>
                        x.id === p.id
                          ? {
                              ...x,
                              priceMonthly:
                                e.target.value === "" ? null : (num(e.target.value) ?? null),
                            }
                          : x,
                      ),
                    )
                  }
                  className="bk-tabular w-24 rounded-lg border border-line bg-ink-2 px-2 py-1.5 text-right text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                />
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.isPublic}
                  onClick={() =>
                    setPlans((ps) =>
                      ps.map((x) => (x.id === p.id ? { ...x, isPublic: !x.isPublic } : x)),
                    )
                  }
                  title="Tampil di katalog publik (halaman harga)"
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    p.isPublic ? "bg-accent" : "bg-line"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      p.isPublic ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </td>
              <td className="px-4 py-3 text-right">
                <input
                  type="number"
                  min={0}
                  value={p.sortOrder}
                  onChange={(e) =>
                    setPlans((ps) =>
                      ps.map((x) =>
                        x.id === p.id ? { ...x, sortOrder: num(e.target.value) ?? 0 } : x,
                      ),
                    )
                  }
                  className="bk-tabular w-16 rounded-lg border border-line bg-ink-2 px-2 py-1.5 text-right text-sm text-fg focus:border-accent focus:outline-none"
                />
              </td>
              <td className="px-4 py-3 text-center">
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.includesDelay}
                  onClick={() =>
                    setPlans((ps) =>
                      ps.map((x) =>
                        x.id === p.id ? { ...x, includesDelay: !x.includesDelay } : x,
                      ),
                    )
                  }
                  title="Fitur random delay (anti-spam) gratis di plan ini"
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    p.includesDelay ? "bg-accent" : "bg-line"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      p.includesDelay ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.isActive}
                  onClick={() =>
                    setPlans((ps) =>
                      ps.map((x) => (x.id === p.id ? { ...x, isActive: !x.isActive } : x)),
                    )
                  }
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    p.isActive ? "bg-accent" : "bg-line"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      p.isActive ? "translate-x-[22px]" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  {feedback?.id === p.id &&
                    (feedback.ok ? (
                      <span className="flex items-center gap-1 text-xs text-accent-bright">
                        <CheckCircle size={13} weight="fill" />
                        {feedback.msg}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-red-600">
                        <Warning size={13} weight="fill" />
                        {feedback.msg}
                      </span>
                    ))}
                  <button
                    type="button"
                    disabled={saving === p.id}
                    onClick={() => save(p)}
                    className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.97] disabled:opacity-50"
                  >
                    {saving === p.id ? "Menyimpan…" : "Simpan"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line-soft px-4 py-3 text-xs text-fg-faint">
        Kuota pesan kosong = unlimited (Espresso per-pesan & Mocha). Tenant tanpa plan
        tidak dikuota. Kolom Delay = plan menyertakan random delay kirim (3–10 dtk) gratis.
      </p>
    </div>
  );
}
