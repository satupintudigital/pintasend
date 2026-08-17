"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  Copy,
  Eye,
  EyeSlash,
  Key,
  Plus,
  ShieldCheck,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";

export interface PublicApiKey {
  id: string;
  tenantId: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const fieldClass =
  "min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function ApiKeysPanel() {
  const [keys, setKeys] = useState<PublicApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ raw: string; label: string } | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/api-keys");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal memuat API key");
      setKeys(data.keys ?? []);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // setTimeout(0): setState di dalam load() berjalan di macrotask, bukan
    // synchronous dalam effect (rule react-hooks/set-state-in-effect).
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || creating) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat API key");
      setCreated({ raw: data.key.raw, label: data.key.label });
      setLabel("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: string) {
    if (!window.confirm("Cabut API key ini? Integrasi yang memakainya akan langsung gagal.")) return;
    setRevoking(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Gagal mencabut API key");
      }
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRevoking(false);
    }
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* clipboard tidak tersedia */
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
            Pengaturan
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            API Key
          </h1>
          <p className="mt-2 max-w-xl text-sm text-fg-muted">
            API key dipakai aplikasi pihak ketiga (mis. toko online, CRM) untuk mengirim pesan
            WhatsApp lewat <code className="font-mono text-accent-bright">POST /v1/messages</code>.
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

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Buat key */}
        <form
          onSubmit={onCreate}
          className="h-fit rounded-2xl border border-line bg-surface p-6 md:p-7"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
              <Key size={19} weight="bold" />
            </span>
            <div>
              <p className="font-display text-lg font-semibold tracking-tight">Buat API Key</p>
              <p className="text-xs text-fg-muted">Key hanya ditampilkan sekali.</p>
            </div>
          </div>
          <div className="mt-5">
            <label htmlFor="api-key-label" className="mb-1.5 block text-sm font-medium text-fg">
              Label
            </label>
            <input
              id="api-key-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={fieldClass}
              placeholder="mis. NalaNiaga, Toko Online, Bot CS"
              maxLength={60}
              required
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.98] disabled:opacity-50"
          >
            <Plus size={15} weight="bold" />
            {creating ? "Membuat…" : "Buat API Key"}
          </button>
          <p className="mt-4 text-xs leading-relaxed text-fg-faint">
            Key disimpan sebagai hash SHA-256. Jika hilang, buat key baru dan cabut yang lama.
          </p>
        </form>

        {/* Daftar key */}
        <div className="rounded-2xl border border-line bg-surface p-6 md:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-lg font-semibold tracking-tight">Daftar API Key</p>
              <p className="text-xs text-fg-muted">Baca dari D1 (auth edge).</p>
            </div>
            <span className="rounded-full border border-line-soft bg-surface-2 px-3 py-1 font-mono text-xs text-fg-muted">
              {keys.length} key
            </span>
          </div>

          {loading ? (
            <div className="mt-5 space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />
              ))}
            </div>
          ) : keys.length === 0 ? (
            <p className="mt-5 rounded-xl border border-line-soft bg-surface-2/60 px-4 py-6 text-center text-sm text-fg-faint">
              Belum ada API key. Buat satu untuk mulai integrasi.
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-line-soft">
              {keys.map((k) => (
                <li key={k.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{k.label}</p>
                      <p className="truncate font-mono text-[11px] text-fg-faint">
                        {k.prefix}…
                        <span className={k.revokedAt ? "text-red-400" : "text-emerald-400"}>
                          {k.revokedAt ? " · dicabut" : " · aktif"}
                        </span>
                      </p>
                    </div>
                    <span className="hidden text-xs text-fg-faint sm:block">
                      dibuat {formatDate(k.createdAt)}
                    </span>
                    <button
                      onClick={() => setRevealed((r) => ({ ...r, [k.id]: !r[k.id] }))}
                      aria-label="Tampilkan detail"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      {revealed[k.id] ? <EyeSlash size={15} /> : <Eye size={15} />}
                    </button>
                    {!k.revokedAt && (
                      <button
                        onClick={() => onRevoke(k.id)}
                        disabled={revoking}
                        aria-label={`Cabut ${k.label}`}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                      >
                        <Trash size={15} />
                      </button>
                    )}
                  </div>
                  {revealed[k.id] && (
                    <div className="mt-3 rounded-xl border border-line bg-ink-2/60 p-3">
                      <dl className="grid gap-2 text-xs sm:grid-cols-2">
                        <div>
                          <dt className="text-fg-faint">ID</dt>
                          <dd className="mt-0.5 break-all font-mono text-fg-muted">{k.id}</dd>
                        </div>
                        <div>
                          <dt className="text-fg-faint">Terakhir dipakai</dt>
                          <dd className="mt-0.5 font-mono text-fg-muted">{formatDate(k.lastUsedAt)}</dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Modal: key baru (sekali saja) */}
      {created && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setCreated(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] md:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
                  <CheckCircle size={19} weight="fill" />
                </span>
                <div>
                  <p className="font-display text-lg font-semibold tracking-tight">Key dibuat</p>
                  <p className="text-xs text-fg-muted">
                    Salin sekarang — tidak akan ditampilkan lagi.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCreated(null)}
                aria-label="Tutup"
                className="-m-2 flex h-10 w-10 items-center justify-center rounded-lg text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <X size={17} />
              </button>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-xl border border-accent/25 bg-ink-2 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-sm text-accent-bright">
                {created.raw}
              </code>
              <button
                onClick={() => copy(created.raw, "new")}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-xs font-medium text-fg transition-colors hover:text-accent-bright"
              >
                {copiedId === "new" ? <CheckCircle size={14} weight="fill" /> : <Copy size={14} />}
                {copiedId === "new" ? "Tersalin" : "Salin"}
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-line-soft bg-surface-2/60 p-4 font-mono text-xs leading-relaxed text-fg-muted">
              <p className="text-fg-faint">Contoh penggunaan:</p>
              <pre className="mt-2 overflow-x-auto">
{`curl -X POST https://wavio.satupintudigital.co.id/v1/messages \\
  -H "Authorization: Bearer ${created.raw.slice(0, 14)}…" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"6281234567890","text":"Halo!"}'`}
              </pre>
            </div>

            <button
              onClick={() => setCreated(null)}
              className="mt-5 w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.99]"
            >
              Selesai
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
