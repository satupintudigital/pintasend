"use client";

import { useEffect, useState } from "react";
import { CheckCircle, WarningCircle } from "@phosphor-icons/react";

interface SettingRow {
  key: string;
  value: string; // JSON string
  updatedBy: string | null;
  updatedAt: string;
}

const FIELDS: {
  key: string;
  label: string;
  desc: string;
  type: "text" | "textarea" | "toggle";
  placeholder?: string;
}[] = [
  {
    key: "platform_name",
    label: "Nama platform",
    desc: "Nama produk yang tampil di email & antarmuka (default: Wavio).",
    type: "text",
    placeholder: "Wavio",
  },
  {
    key: "watermark_footnote",
    label: "Watermark footnote",
    desc: "Footnote iklan di setiap pesan keluar. Kosongkan untuk memakai bawaan platform.",
    type: "textarea",
    placeholder: "via Wavio - https://wavio.satupintudigital.co.id",
  },
  {
    key: "allow_public_registration",
    label: "Izinkan registrasi publik",
    desc: "Aktifkan bila halaman registrasi mandiri diizinkan (default: nonaktif — provisioning via platform admin).",
    type: "toggle",
  },
  {
    key: "message_retention_default_days",
    label: "Retensi pesan default (hari)",
    desc: "Batas simpan pesan bawaan tenant baru (30..365).",
    type: "text",
    placeholder: "30",
  },
];

const EMPTY: Record<string, string | boolean> = {
  platform_name: "",
  watermark_footnote: "",
  allow_public_registration: false,
  message_retention_default_days: "30",
};

export function SettingsForm() {
  const [values, setValues] = useState<Record<string, string | boolean>>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform/settings")
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? "Gagal memuat");
        if (cancelled) return;
        const next = { ...EMPTY };
        for (const row of d.settings as SettingRow[]) {
          try {
            const parsed = JSON.parse(row.value) as string | boolean | number;
            next[row.key] = row.key === "message_retention_default_days"
              ? String(parsed)
              : (parsed as string | boolean);
          } catch {
            // value korup → biarkan default
          }
        }
        setValues(next);
        setLoaded(true);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(key: string, value: string | boolean) {
    setSaving(key);
    setStatus(null);
    try {
      // Key bertipe number dikirim sebagai angka (route memvalidasi tipe).
      const payload = key === "message_retention_default_days" ? Number(value) : value;
      const res = await fetch("/api/platform/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value: payload }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Gagal menyimpan");
      setStatus({ ok: true, msg: `“${key}” tersimpan.` });
    } catch (e) {
      setStatus({ ok: false, msg: e instanceof Error ? e.message : "Gagal menyimpan" });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      {!loaded && <p className="text-sm text-fg-faint">Memuat…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {loaded && (
        <div className="space-y-4">
          {FIELDS.map((f) => (
            <div
              key={f.key}
              className="rounded-2xl border border-line bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0">
                  <label htmlFor={`set-${f.key}`} className="text-sm font-semibold text-fg">
                    {f.label}
                  </label>
                  <p className="mt-1 text-xs text-fg-muted">{f.desc}</p>
                </div>
                <button
                  onClick={() => save(f.key, values[f.key])}
                  disabled={saving !== null}
                  className="shrink-0 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-ink transition-colors hover:bg-accent-bright disabled:opacity-50"
                >
                  {saving === f.key ? "Menyimpan…" : "Simpan"}
                </button>
              </div>

              {f.type === "toggle" ? (
                <button
                  id={`set-${f.key}`}
                  onClick={() => setValues((v) => ({ ...v, [f.key]: !v[f.key] }))}
                  className="mt-4 flex items-center gap-3"
                >
                  <span
                    className={`h-6 w-11 rounded-full p-0.5 transition-colors ${
                      values[f.key] ? "bg-accent" : "bg-surface-2 border border-line"
                    }`}
                  >
                    <span
                      className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        values[f.key] ? "translate-x-5" : ""
                      }`}
                    />
                  </span>
                  <span className="text-sm text-fg">
                    {values[f.key] ? "Aktif" : "Nonaktif"}
                  </span>
                </button>
              ) : (
                <textarea
                  id={`set-${f.key}`}
                  value={String(values[f.key])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  rows={f.type === "textarea" ? 3 : 1}
                  placeholder={f.placeholder}
                  className="mt-4 w-full resize-y rounded-xl border border-line bg-ink-2 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none"
                />
              )}
            </div>
          ))}

          {status && (
            <p
              className={`flex items-center gap-2 text-sm ${
                status.ok ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {status.ok ? <CheckCircle size={16} /> : <WarningCircle size={16} />}
              {status.msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
