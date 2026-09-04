"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  PaperPlaneTilt,
  SpinnerGap,
  Warning,
  X,
} from "@phosphor-icons/react";
import { placeholdersFromTemplate } from "@/lib/templateVars";

interface Device {
  id: string;
  label: string;
  phone: string | null;
  status: string;
}

interface Template {
  id: string;
  name: string;
  header: string | null;
  body: string;
  footer: string | null;
  version?: number;
  syncStatus?: string;
  syncedAt?: string | null;
}

const fieldClass =
  "min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

export function SendTemplateModal({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  /** Dipanggil setelah kirim sukses — parent me-refresh riwayat pesan. */
  onSent: () => void;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [to, setTo] = useState("");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [loadingDevices, setLoadingDevices] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentMessageId, setSentMessageId] = useState<string | null>(null);

  // Muat device saat modal dibuka. Parent me-remount komponen via `key` setiap
  // dibuka (state reset otomatis); setState di dalam setTimeout (macrotask) agar
  // tidak melanggar react-hooks/set-state-in-effect (pola sama ApiKeysPanel).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      fetch("/api/devices")
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Gagal memuat device");
          const ready = (data.devices ?? []).filter((d: Device) => d.status === "ready");
          setDevices(ready);
          setError("");
        })
        .catch((e) => setError((e as Error).message))
        .finally(() => setLoadingDevices(false));
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  // Muat template saat device dipilih.
  useEffect(() => {
    if (!open || !deviceId) return;
    const t = setTimeout(() => {
      setLoadingTemplates(true);
      setError("");
      fetch(`/api/templates?deviceId=${encodeURIComponent(deviceId)}`)
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "Gagal memuat template");
          setTemplates(data.templates ?? []);
          setTemplateName("");
        })
        .catch((e) => setError((e as Error).message))
        .finally(() => setLoadingTemplates(false));
    }, 0);
    return () => clearTimeout(t);
  }, [open, deviceId]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.name === templateName) ?? null,
    [templates, templateName],
  );

  const placeholders = useMemo(
    () =>
      selectedTemplate
        ? placeholdersFromTemplate(selectedTemplate)
        : [],
    [selectedTemplate],
  );

  function setVar(name: string, value: string) {
    setVars((v) => ({ ...v, [name]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          to: to.trim(),
          templateName,
          ...(Object.keys(vars).length ? { vars } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Gagal mengirim template");
      setSentMessageId(data.messageId ?? null);
      onSent();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-line bg-surface shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
        <div className="p-6 md:p-7">
          {sentMessageId ? (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 shadow-[0_0_40px_-12px_rgba(16,185,129,0.7)]">
                <CheckCircle size={28} weight="fill" className="bk-pop" />
              </div>
              <p className="mt-6 font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
                Terkirim
              </p>
              <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
                Template berhasil dikirim
              </h2>
              <p className="mt-2 text-sm text-fg-muted">
                Pesan dikirim ke <span className="font-medium text-fg">{to.trim()}</span>.
                Statusnya bisa dipantau di riwayat pesan.
              </p>
              <button
                onClick={onClose}
                className="mt-7 w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.99]"
              >
                Selesai
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
                    Kirim pesan
                  </p>
                  <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">
                    Template Pesan
                  </h2>
                  <p className="mt-1 text-sm text-fg-muted">
                    Kirim template standar (mis. pesanan baru, pembayaran lunas) ke satu nomor.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Tutup"
                  className="-m-2 flex h-11 w-11 items-center justify-center rounded-xl text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg active:scale-95"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                {/* Device */}
                <div>
                  <label htmlFor="tpl-device" className="mb-1.5 block text-sm font-medium text-fg">
                    Device
                  </label>
                  {loadingDevices ? (
                    <div className="flex h-12 items-center gap-2 rounded-xl border border-line bg-ink-2 px-4 text-sm text-fg-faint">
                      <SpinnerGap size={15} className="animate-spin text-accent" />
                      Memuat device…
                    </div>
                  ) : devices.length === 0 ? (
                    <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
                      Belum ada device tersambung. Hubungkan device dulu di halaman Device.
                    </p>
                  ) : (
                    <select
                      id="tpl-device"
                      value={deviceId}
                      onChange={(e) => {
                        // Reset pilihan template saat ganti device (template
                        // per-device berbeda-beda).
                        setTemplateName("");
                        setVars({});
                        setDeviceId(e.target.value);
                      }}
                      required
                      className={fieldClass}
                    >
                      <option value="">Pilih device…</option>
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                          {d.phone ? ` · ${d.phone}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Template */}
                <div>
                  <label htmlFor="tpl-name" className="mb-1.5 block text-sm font-medium text-fg">
                    Template
                  </label>
                  {!deviceId ? (
                    <p className="rounded-xl border border-line-soft bg-surface-2/60 px-4 py-3 text-sm text-fg-faint">
                      Pilih device dulu untuk melihat template.
                    </p>
                  ) : loadingTemplates ? (
                    <div className="flex h-12 items-center gap-2 rounded-xl border border-line bg-ink-2 px-4 text-sm text-fg-faint">
                      <SpinnerGap size={15} className="animate-spin text-accent" />
                      Memuat template…
                    </div>
                  ) : templates.length === 0 ? (
                    <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
                      Device ini belum punya template. Hubungi admin untuk menyiapkannya.
                    </p>
                  ) : (
                    <select
                      id="tpl-name"
                      value={templateName}
                      onChange={(e) => {
                        setTemplateName(e.target.value);
                        setVars({});
                      }}
                      required
                      className={fieldClass}
                    >
                      <option value="">Pilih template…</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Preview template */}
                {selectedTemplate && (
                  <div className="rounded-xl border border-line-soft bg-ink-2/60 p-4">
                    {selectedTemplate.header && (
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-bright">
                        {selectedTemplate.header}
                      </p>
                    )}
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-fg">
                      {selectedTemplate.body}
                    </p>
                    {selectedTemplate.footer && (
                      <p className="mt-2 text-xs text-fg-faint">{selectedTemplate.footer}</p>
                    )}
                    {selectedTemplate.syncStatus && selectedTemplate.syncStatus !== "synced" && (
                      <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                        Template belum siap di device ini ({selectedTemplate.syncStatus}). Sinkronisasi akan dicoba otomatis; pesan akan memakai fallback bila tersedia.
                      </p>
                    )}
                    {selectedTemplate.version && (
                      <p className="mt-2 text-[11px] text-fg-faint">Versi canonical v{selectedTemplate.version}</p>
                    )}
                  </div>
                )}

                {/* Nomor tujuan */}
                <div>
                  <label htmlFor="tpl-to" className="mb-1.5 block text-sm font-medium text-fg">
                    Nomor tujuan
                  </label>
                  <input
                    id="tpl-to"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="mis. 081234567890"
                    inputMode="tel"
                    required
                    className={fieldClass}
                  />
                </div>

                {/* Vars dinamis per placeholder */}
                {placeholders.length > 0 && (
                  <div className="space-y-3 rounded-xl border border-line bg-ink-2/40 p-4">
                    <p className="text-xs font-medium text-fg-muted">
                      Isi variabel template:
                    </p>
                    {placeholders.map((name) => (
                      <div key={name}>
                        <label
                          htmlFor={`tpl-var-${name}`}
                          className="mb-1.5 block font-mono text-xs text-fg-faint"
                        >
                          {"{"}
                          {name}
                          {"}"}
                        </label>
                        <input
                          id={`tpl-var-${name}`}
                          value={vars[name] ?? ""}
                          onChange={(e) => setVar(name, e.target.value)}
                          placeholder={`Nilai untuk ${name}`}
                          className={fieldClass}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {error && (
                  <p className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
                    <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting || !deviceId || !templateName}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.99] disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <SpinnerGap size={15} className="animate-spin" />
                      Mengirim…
                    </>
                  ) : (
                    <>
                      <PaperPlaneTilt size={15} weight="bold" />
                      Kirim Template
                    </>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
