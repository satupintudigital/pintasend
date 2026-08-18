"use client";

import { useState } from "react";
import { CheckCircle, Warning } from "@phosphor-icons/react";

interface PlanRow {
  id: string;
  name: string;
  tagline: string;
  priceDisplay: string;
  maxDevices: number;
  maxUsers: number;
  maxMessagesPerMonth: number | null;
  includesDelay: boolean;
  isActive: boolean;
}

interface PlansTableProps {
  initial: PlanRow[];
}

// Edit kuota per plan secara inline (number input) → PUT /api/platform/plans/[id].
export function PlansTable({ initial }: PlansTableProps) {
  const [plans, setPlans] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

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
          maxDevices: p.maxDevices,
          maxUsers: p.maxUsers,
          maxMessagesPerMonth: p.maxMessagesPerMonth,
          includesDelay: p.includesDelay,
          isActive: p.isActive,
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

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line-soft text-xs uppercase tracking-wider text-fg-faint">
            <th className="px-4 py-3">Plan</th>
            <th className="px-4 py-3 text-right">Device</th>
            <th className="px-4 py-3 text-right">User</th>
            <th className="px-4 py-3 text-right">Pesan/bulan</th>
            <th className="px-4 py-3 text-center">Delay</th>
            <th className="px-4 py-3">Aktif</th>
            <th className="px-4 py-3 text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id} className="border-b border-line-soft/60 last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium text-fg">{p.name}</p>
                <p className="text-xs text-fg-faint">{p.priceDisplay}</p>
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
                      <span className="flex items-center gap-1 text-xs text-red-400">
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
