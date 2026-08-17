"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  CheckCircle,
  Key,
  MagnifyingGlass,
  ShieldCheck,
  UsersThree,
  Warning,
  X,
} from "@phosphor-icons/react";

export interface AdminUserRow {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 350;

const fieldClass =
  "min-h-11 w-full rounded-xl border border-line bg-ink-2 px-4 py-2.5 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function PenggunaList() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // State form reset password (satu baris yang terbuka).
  const [openId, setOpenId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);

  // Debounce pencarian → reset ke halaman 1. setLoading TIDAK di sini:
  // (1) hindari setState-sync-dalam-effect (rule React 19); (2) jika fetch
  // awal selesai < debounce, setLoading(true) di sini akan membuat skeleton
  // macet tanpa fetch lanjutan (debouncedQuery/page tidak berubah).
  // loading di-set di onChange (pemicu fetch yang sah).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch daftar dari API (baca D1, 0 Neon). AbortController utk race guard.
  // loading di-set true oleh pemicu (debounce/pagination), bukan di sini,
  // agar tidak ada setState synchronous dalam effect (rule React 19).
  const abortRef = useRef<AbortController | null>(null);
  const fetchUsers = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (debouncedQuery) params.set("q", debouncedQuery);
      const res = await fetch(`/api/admin/users?${params}`, { signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data.error ?? "Gagal memuat daftar pengguna");
        setUsers([]);
        setTotal(0);
        return;
      }
      setUsers(data.users ?? []);
      setTotal(Number(data.total ?? 0));
      // Clamp: bila data menyusut (mis. hasil pencarian) dan page melebihi
      // totalPages, kembali ke halaman terakhir yang valid (satu fetch ulang).
      const totalPagesNow = Math.max(1, Math.ceil(Number(data.total ?? 0) / PAGE_SIZE));
      if (page > totalPagesNow) {
        setPage(totalPagesNow);
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setLoadError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedQuery]);

  useEffect(() => {
    // setTimeout(0): fetchUsers (dan setState di dalamnya) berjalan di macrotask,
    // bukan synchronous dalam effect — menghindari rule set-state-in-effect React 19.
    const t = setTimeout(() => fetchUsers(), 0);
    return () => {
      clearTimeout(t);
      abortRef.current?.abort();
    };
  }, [fetchUsers]);

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
    setResetLoading(true);
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
      setResetLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          {total} akun
        </span>
      </div>

      {/* Pencarian */}
      <div className="relative mt-6">
        <MagnifyingGlass
          size={16}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-faint"
        />
        <input
          value={query}
          onChange={(e) => {
            setLoading(true);
            setQuery(e.target.value);
          }}
          className="min-h-11 w-full rounded-xl border border-line bg-ink-2 pl-11 pr-12 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          placeholder="Cari nama atau email…"
          aria-label="Cari pengguna"
        />
        {query && (
          <button
            onClick={() => {
              setLoading(true);
              setQuery("");
            }}
            aria-label="Bersihkan pencarian"
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-fg-faint transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X size={15} weight="bold" />
          </button>
        )}
      </div>

      {loadError && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-400">
          <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
          {loadError}
        </p>
      )}

      {loading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-10 w-10 rounded-xl bg-surface-2" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-surface-2" />
                <div className="h-2.5 w-1/2 rounded bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line-soft bg-surface-2/60 px-4 py-6 text-center text-sm text-fg-faint">
          {debouncedQuery ? `Tidak ada pengguna yang cocok dengan "${debouncedQuery}".` : "Belum ada pengguna."}
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
                      className="flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-ink-2 px-3.5 py-2 text-xs font-medium text-fg transition-colors hover:border-accent/40 hover:text-accent-bright"
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
                        className="min-h-11 rounded-full border border-line px-4 py-2 text-xs font-medium text-fg-muted transition-colors hover:text-fg"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => onReset(u.id)}
                        disabled={resetLoading}
                        className="flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.98] disabled:opacity-50"
                      >
                        <Key size={13} weight="bold" />
                        {resetLoading ? "Menyimpan…" : "Simpan password"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5">
          <p className="text-xs text-fg-faint">
            Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} dari {total} akun
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setLoading(true);
                setPage((p) => Math.max(1, p - 1));
              }}
              disabled={page <= 1 || loading}
              className="flex min-h-11 items-center gap-1 rounded-full border border-line bg-ink-2 px-3.5 py-2 text-xs font-medium text-fg transition-colors hover:border-accent/40 hover:text-accent-bright disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg"
            >
              <CaretLeft size={13} weight="bold" /> Sebelumnya
            </button>
            <span className="px-2 font-mono text-xs text-fg-muted">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => {
                setLoading(true);
                setPage((p) => Math.min(totalPages, p + 1));
              }}
              disabled={page >= totalPages || loading}
              className="flex min-h-11 items-center gap-1 rounded-full border border-line bg-ink-2 px-3.5 py-2 text-xs font-medium text-fg transition-colors hover:border-accent/40 hover:text-accent-bright disabled:opacity-40 disabled:hover:border-line disabled:hover:text-fg"
            >
              Berikutnya <CaretRight size={13} weight="bold" />
            </button>
          </div>
        </div>
      )}

      <p className="mt-5 rounded-xl border border-line-soft bg-surface-2/60 px-4 py-3 text-xs leading-relaxed text-fg-faint">
        Password baru berlaku seketika untuk login berikutnya (auth baca D1, tersinkron write-through dari Neon).
        Pengguna yang sedang login tidak akan di-logout otomatis.
      </p>
    </div>
  );
}
