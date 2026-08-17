"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

const fieldClass =
  "min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (!res) {
        setError("Terjadi kesalahan. Coba lagi.");
        return;
      }
      if (res.error) {
        // 429 dari rate limiter → pesan spesifik dari body.
        const detail = (res as unknown as { response?: { status?: number } }).response?.status;
        if (detail === 429) setError("Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.");
        else setError("Email atau password salah");
        return;
      }
      const rawCb = searchParams.get("callbackUrl") || "/dashboard";
      const safe = rawCb.startsWith("/") && !rawCb.startsWith("//") ? rawCb : "/dashboard";
      router.push(safe);
      router.refresh();
    } catch {
      setError("Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2.5 font-semibold tracking-tight text-fg">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-ink">
              W
            </span>
            wavio
          </Link>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight">Masuk ke dashboard</h1>
          <p className="mt-2 text-sm text-fg-muted">Kelola device dan kirim pesan lewat API.</p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl border border-line bg-surface p-6">
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
              placeholder="Masukkan password"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Memproses..." : "Masuk"}
          </button>
        </form>

        <div className="mt-5 rounded-2xl border border-line-soft bg-surface-2 p-4 text-xs text-fg-faint">
          <p className="font-medium text-fg">Akun demo</p>
          <p className="mt-1">owner@wavio.test / admin123</p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[60dvh]" />}>
      <LoginForm />
    </Suspense>
  );
}
