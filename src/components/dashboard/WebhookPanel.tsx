"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwise,
  CheckCircle,
  DotsThree,
  PaperPlaneTilt,
  ShieldCheck,
  Trash,
  Warning,
  XCircle,
} from "@phosphor-icons/react";

export interface WebhookView {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  active: boolean;
  secretMasked: string;
  hasSecret: boolean;
  createdAt: string;
  updatedAt: string;
}

const EVENT_OPTIONS = [
  { value: "message.received", label: "message.received", desc: "Pesan masuk dari pelanggan" },
  { value: "session.status", label: "session.status", desc: "Perubahan status device (ready, disconnected, …)" },
];

const fieldClass =
  "min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

export function WebhookPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; status: number; durationMs: number; error?: string } | null>(null);

  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([...EVENT_OPTIONS.map((o) => o.value)]);
  const [secret, setSecret] = useState(""); // kosong = pertahankan / generate
  const [active, setActive] = useState(true);
  const [hasConfig, setHasConfig] = useState(false);
  const [secretMasked, setSecretMasked] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/webhooks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat konfigurasi webhook");
      const wh: WebhookView | null = data.webhook;
      if (wh) {
        setUrl(wh.url);
        setEvents(wh.events);
        setActive(wh.active);
        setHasConfig(true);
        setSecretMasked(wh.secretMasked);
        setUpdatedAt(wh.updatedAt);
      } else {
        setHasConfig(false);
      }
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  function toggleEvent(value: string) {
    setEvents((prev) =>
      prev.includes(value) ? prev.filter((e) => e !== value) : [...prev, value],
    );
  }

  async function onSave(regenerateSecret = false) {
    if (!url.trim() || events.length === 0 || saving) return;
    setSaving(true);
    setError("");
    setTestResult(null);
    try {
      // secret: "" = pertahankan lama; "__REGENERATE__" = buat baru (eksplisit).
      const res = await fetch("/api/admin/webhooks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          events,
          active,
          secret: regenerateSecret ? "__REGENERATE__" : secret,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal menyimpan konfigurasi webhook");
      setSecret("");
      setHasConfig(true);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    if (testing) return;
    setTesting(true);
    setTestResult(null);
    setError("");
    try {
      const res = await fetch("/api/admin/webhooks/test", { method: "POST" });
      const data = await res.json();
      setTestResult({ ok: data.ok, status: data.status, durationMs: data.durationMs, error: data.error });
    } catch (e) {
      setTestResult({ ok: false, status: 0, durationMs: 0, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function onDelete() {
    if (!window.confirm("Hapus konfigurasi webhook? Event tidak akan diteruskan lagi.")) return;
    setError("");
    try {
      const res = await fetch("/api/admin/webhooks", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Gagal menghapus webhook");
      }
      setUrl("");
      setEvents(EVENT_OPTIONS.map((o) => o.value));
      setActive(true);
      setHasConfig(false);
      setSecretMasked("");
      setUpdatedAt("");
      setTestResult(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
            Integrasi
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Webhook
          </h1>
          <p className="mt-2 max-w-xl text-sm text-fg-muted">
            Terima <strong>pesan masuk</strong> dan perubahan{" "}
            <strong>status device</strong> secara realtime. Wavio meneruskan event ke URL-mu
            dengan tanda tangan <code className="font-mono text-accent-bright">x-wavio-signature</code>{" "}
            (HMAC-SHA256) agar bisa diverifikasi.
          </p>
        </div>
        <div className="flex h-11 items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-4 text-sm text-accent-bright">
          <ShieldCheck size={17} weight="bold" />
          Khusus owner
        </div>
      </div>

      {error && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
          <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-8 space-y-4">
          <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
          <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          {/* Form */}
          <div className="rounded-2xl border border-line bg-surface p-6 md:p-7">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
                <PaperPlaneTilt size={19} weight="bold" />
              </span>
              <div>
                <p className="font-display text-lg font-semibold tracking-tight">
                  {hasConfig ? "Konfigurasi Webhook" : "Aktifkan Webhook"}
                </p>
                <p className="text-xs text-fg-muted">
                  {hasConfig ? `Terakhir disimpan ${new Date(updatedAt).toLocaleString("id-ID")}` : "Belum ada konfigurasi."}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <label htmlFor="wh-url" className="mb-1.5 block text-sm font-medium text-fg">
                URL endpoint (milikmu)
              </label>
              <input
                id="wh-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={fieldClass}
                placeholder="https://api.tokomu.com/webhooks/wavio"
                maxLength={500}
                required
              />
              <p className="mt-1.5 text-xs text-fg-faint">
                Wavio akan mem-POST event ke URL ini. Pastikan menerima method POST.
              </p>
            </div>

            <div className="mt-5">
              <p className="mb-1.5 text-sm font-medium text-fg">Event yang diteruskan</p>
              <div className="space-y-2.5">
                {EVENT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                      events.includes(opt.value)
                        ? "border-accent/40 bg-accent/5"
                        : "border-line bg-ink-2/50 hover:border-line-soft"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={events.includes(opt.value)}
                      onChange={() => toggleEvent(opt.value)}
                      className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block font-mono text-sm text-fg">{opt.label}</span>
                      <span className="mt-0.5 block text-xs text-fg-muted">{opt.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <label htmlFor="wh-secret" className="mb-1.5 block text-sm font-medium text-fg">
                Secret (opsional)
              </label>
              <div className="flex gap-2">
                <input
                  id="wh-secret"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className={`${fieldClass} font-mono`}
                  placeholder={
                    hasConfig
                      ? `${secretMasked} — biarkan kosong untuk mempertahankan`
                      : "Kosongkan untuk generate otomatis"
                  }
                  maxLength={128}
                />
                {hasConfig && (
                  <button
                    type="button"
                    onClick={() => onSave(true)}
                    disabled={saving}
                    className="shrink-0 rounded-xl border border-line px-4 text-xs font-medium text-fg-muted transition-colors hover:border-accent/40 hover:text-accent-bright disabled:opacity-40"
                  >
                    Regenerasi
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-fg-faint">
                Dipakai Wavio untuk menandatangani delivery (
                <code className="font-mono">x-wavio-signature</code>). Mengganti secret akan
                memutus verifikasi lama di endpoint-mu — perbarui di sisi client.
              </p>
            </div>

            <label className="mt-5 flex cursor-pointer items-center justify-between rounded-xl border border-line bg-ink-2/50 px-4 py-3.5">
              <span>
                <span className="block text-sm font-medium text-fg">Aktifkan pengiriman</span>
                <span className="block text-xs text-fg-muted">
                  Nonaktif sementara tanpa menghapus konfigurasi.
                </span>
              </span>
              <span className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors" style={{ background: active ? "var(--color-accent)" : "var(--color-line)" }}>
                <span
                  className="inline-block h-5 w-5 transform rounded-full bg-ink shadow transition-transform"
                  style={{ transform: active ? "translateX(22px)" : "translateX(2px)" }}
                />
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="sr-only"
                  aria-label="Aktifkan webhook"
                />
              </span>
            </label>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => onSave()}
                disabled={saving || !url.trim() || events.length === 0}
                className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? <DotsThree size={16} className="animate-pulse" /> : <CheckCircle size={16} weight="bold" />}
                {saving ? "Menyimpan…" : "Simpan Konfigurasi"}
              </button>
              {hasConfig && (
                <button
                  onClick={onDelete}
                  className="flex items-center gap-2 rounded-full border border-red-500/25 px-5 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
                >
                  <Trash size={15} />
                  Hapus
                </button>
              )}
            </div>
          </div>

          {/* Status / test */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-line bg-surface p-6">
              <p className="font-display text-lg font-semibold tracking-tight">Uji Kirim</p>
              <p className="mt-1 text-sm text-fg-muted">
                Kirim event uji <code className="font-mono">message.received</code> ke endpoint-mu
                untuk memastikan integrasi bekerja.
              </p>
              <button
                onClick={onTest}
                disabled={testing || !hasConfig}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-5 py-3 text-sm font-semibold text-accent-bright transition-all hover:bg-accent/20 active:scale-[0.98] disabled:opacity-40"
              >
                <ArrowClockwise size={15} className={testing ? "animate-spin" : undefined} weight="bold" />
                {testing ? "Mengirim…" : "Kirim Event Uji"}
              </button>

              {testResult && (
                <div
                  className={`mt-4 flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${
                    testResult.ok
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                      : "border-red-500/20 bg-red-500/10 text-red-400"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle size={16} className="mt-0.5 shrink-0" weight="fill" />
                  ) : (
                    <XCircle size={16} className="mt-0.5 shrink-0" weight="fill" />
                  )}
                  <span>
                    {testResult.ok
                      ? `Terkirim (HTTP ${testResult.status}) dalam ${testResult.durationMs} ms.`
                      : `Gagal — ${testResult.error ?? `HTTP ${testResult.status}`} (${testResult.durationMs} ms).`}
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-surface p-6">
              <p className="font-display text-lg font-semibold tracking-tight">Catatan</p>
              <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-fg-muted">
                <li className="flex gap-2.5">
                  <span className="text-accent-bright">✓</span>
                  Event masuk dari OpenWA diverifikasi HMAC sebelum diteruskan.
                </li>
                <li className="flex gap-2.5">
                  <span className="text-accent-bright">✓</span>
                  Delivery keluar ditandatangani <code className="font-mono">x-wavio-signature</code> —
                  verifikasi di sisi-mu agar aman dari pemalsuan.
                </li>
                <li className="flex gap-2.5">
                  <span className="text-accent-bright">✓</span>
                  Jika endpoint-mu down, Wavio mencoba mengirim sekali dan mencatat kegagalan.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

