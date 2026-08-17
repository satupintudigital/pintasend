"use client";

import { useState } from "react";
import {
  CheckCircle,
  Key,
  ShieldCheck,
  UsersThree,
  Warning,
} from "@phosphor-icons/react";

export interface AdminUserRow {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

const fieldClass =
  "min-h-11 w-full rounded-xl border border-line bg-ink-2 px-4 py-2.5 text-sm text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function PenggunaList({
  users,
  loadError,
}: {
  users: AdminUserRow[];
  /** Set bila daftar user gagal dimuat dari D1 (agar tidak tampak "0 akun"). */
  loadError?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);

  async function onReset(id: string) {
    setError("");
    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal mereset password");
        return;
      }
      if (data.d1Ok === false) {
        // Neon ter-update tapi clone D1 gagal → login (baca D1) masih pakai
        // password lama. Jangan klaim sukses; biarkan form terbuka.
        setError(
          "Password terubah di Neon, tapi sinkron ke D1 gagal. Pengguna mungkin belum bisa login dengan password baru — coba lagi.",
        );
        return;
      }
      setDoneId(id);
      setOpenId(null);
      setPassword("");
      setConfirm("");
      setTimeout(() => setDoneId(null), 4000);
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
            <UsersThree size={19} weight="bold" />
          </span>
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">Daftar Pengguna</p>
            <p className="text-xs text-fg-muted">
              Reset password langsung tersinkron ke Neon &amp; D1 (write-through).
            </p>
          </div>
        </div>
        <span className="rounded-full border border-line-soft bg-surface-2 px-3 py-1 font-mono text-xs text-fg-muted">
          {users.length} akun
        </span>
      </div>

      {loadError && (
        <p className="mt-6 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-400">
          <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
          Gagal memuat daftar pengguna ({loadError}). Muat ulang halaman untuk mencoba lagi.
        </p>
      )}

      {users.length === 0 && !loadError ? (
        <p className="mt-6 rounded-xl border border-line-soft bg-surface-2/60 px-4 py-6 text-center text-sm text-fg-faint">
          Belum ada pengguna.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line-soft">
          {users.map((u) => {
            const open = openId === u.id;
            return (
              <li key={u.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-soft bg-ink-2 font-display text-sm font-semibold text-fg">
                    {(u.name ?? "?").charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{u.name}</p>
                    <p className="truncate font-mono text-[11px] text-fg-faint">{u.email}</p>
                  </div>
                  <span
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider ${
                      u.role === "owner"
                        ? "border-accent/25 bg-accent/10 text-accent-bright"
                        : "border-line-soft bg-surface-2 text-fg-muted"
                    }`}
                  >
                    {u.role === "owner" && <ShieldCheck size={11} weight="fill" />}
                    {u.role}
                  </span>
                  <span className="hidden text-xs text-fg-faint sm:block">
                    dibuat {formatDate(u.createdAt)}
                  </span>

                  {doneId === u.id ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-accent-bright">
                      <CheckCircle size={15} weight="fill" /> Terreset
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setOpenId(open ? null : u.id);
                        setError("");
                        setPassword("");
                        setConfirm("");
                      }}
                      className="flex items-center gap-1.5 rounded-full border border-line bg-ink-2 px-3.5 py-2 text-xs font-medium text-fg transition-colors hover:border-accent/40 hover:text-accent-bright"
                    >
                      <Key size={13} weight="bold" />
                      Reset password
                    </button>
                  )}
                </div>

                {open && (
                  <div className="mt-4 rounded-xl border border-line bg-ink-2/60 p-4">
                    <p className="text-sm font-medium text-fg">
                      Password baru untuk <span className="text-accent-bright">{u.name}</span>
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor={`pw-${u.id}`} className="mb-1.5 block text-xs font-medium text-fg-muted">
                          Password baru
                        </label>
                        <input
                          id={`pw-${u.id}`}
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={fieldClass}
                          placeholder="Minimal 8 karakter"
                          autoComplete="new-password"
                          minLength={8}
                        />
                      </div>
                      <div>
                        <label htmlFor={`pw2-${u.id}`} className="mb-1.5 block text-xs font-medium text-fg-muted">
                          Konfirmasi
                        </label>
                        <input
                          id={`pw2-${u.id}`}
                          type="password"
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                          className={fieldClass}
                          placeholder="Ulangi password"
                          autoComplete="new-password"
                          minLength={8}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              onReset(u.id);
                            }
                          }}
                        />
                      </div>
                    </div>

                    {error && (
                      <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
                        <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
                        {error}
                      </p>
                    )}

                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        onClick={() => setOpenId(null)}
                        className="rounded-full border border-line px-4 py-2 text-xs font-medium text-fg-muted transition-colors hover:text-fg"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => onReset(u.id)}
                        disabled={loading}
                        className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.98] disabled:opacity-50"
                      >
                        <Key size={13} weight="bold" />
                        {loading ? "Menyimpan…" : "Simpan password"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-5 rounded-xl border border-line-soft bg-surface-2/60 px-4 py-3 text-xs leading-relaxed text-fg-faint">
        Password baru berlaku seketika untuk login berikutnya (auth baca D1, tersinkron write-through dari Neon).
        Pengguna yang sedang login tidak akan di-logout otomatis.
      </p>
    </div>
  );
}
