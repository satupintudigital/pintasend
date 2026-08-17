"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle,
  UserPlus,
  UsersThree,
  Warning,
} from "@phosphor-icons/react";

const fieldClass =
  "min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

export function PenggunaForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true); // segera — cegah double-submit selama request berjalan
    try {
      const res = await fetch("/api/admin/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          tenantName: tenantName.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Gagal membuat pengguna");
        return;
      }

      // Auto-login sebagai user baru (jawaban desain: setelah sukses langsung
      // masuk dashboard) — user baru sudah tersedia di D1 via write-through.
      const signInRes = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (signInRes?.error) {
        setError("Akun dibuat, tapi gagal login otomatis. Silakan masuk manual.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
            Admin
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Kelola Pengguna
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            Buat akun baru untuk klien. Tiap pengguna mendapat tenant terpisah dan langsung bisa masuk.
          </p>
        </div>
        <div className="flex h-11 items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-4 text-sm text-accent-bright">
          <UsersThree size={17} weight="bold" />
          Khusus owner
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-line bg-surface p-6 shadow-[0_40px_100px_-60px_rgba(16,185,129,0.4)] md:p-8"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
              <UserPlus size={19} weight="bold" />
            </span>
            <div>
              <p className="font-display text-lg font-semibold tracking-tight">Tambah Pengguna</p>
              <p className="text-xs text-fg-muted">Write-through: Neon → D1, siap login seketika.</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-fg">
                Nama
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
                placeholder="mis. Andi Pratama"
                autoComplete="name"
                required
              />
            </div>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-fg">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
                placeholder="nama@email.com"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-fg">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
                placeholder="Minimal 8 karakter"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div>
              <label htmlFor="tenantName" className="mb-1.5 block text-sm font-medium text-fg">
                Nama tenant <span className="text-fg-faint">(opsional — default: nama)</span>
              </label>
              <input
                id="tenantName"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                className={fieldClass}
                placeholder="mis. Toko Andi"
                maxLength={80}
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
              <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              "Membuat & masuk…"
            ) : (
              <>
                Buat Akun & Masuk
                <ArrowRight size={15} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-surface p-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Alur</p>
            <ul className="mt-4 space-y-3 text-sm text-fg-muted">
              <li className="flex gap-3">
                <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-accent-bright" />
                <span>
                  <span className="font-medium text-fg">Tenant baru dibuat</span> di Neon untuk pengguna ini.
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-accent-bright" />
                <span>
                  <span className="font-medium text-fg">Akun di-clone ke D1</span> (auth edge) — login 0 koneksi Neon.
                </span>
              </li>
              <li className="flex gap-3">
                <CheckCircle size={16} weight="fill" className="mt-0.5 shrink-0 text-accent-bright" />
                <span>
                  Anda <span className="font-medium text-fg">langsung masuk</span> sebagai pengguna baru untuk
                  memulai setup device.
                </span>
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-line-soft bg-surface-2/60 p-5 text-xs leading-relaxed text-fg-faint">
            Saat ini pendaftaran publik dinonaktifkan — hanya owner yang dapat membuat akun. Fitur undangan
            self-service akan menyusul.
          </div>
        </div>
      </div>
    </div>
  );
}
