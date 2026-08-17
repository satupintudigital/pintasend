"use client";

import { Suspense, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle, Lock, Warning } from "@phosphor-icons/react";
import { Tokens, type Token } from "@/components/landing/Code";

const fieldClass =
  "min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-sm text-fg placeholder:text-fg-faint transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

// Turnstile: sitekey publik (aman di-bundle), secret hanya di worker siteverify.
const TURNSTILE_SITEKEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? "0x4AAAAAAESpUhXE0d_l2Z_l";
const TURNSTILE_SITEVERIFY_URL =
  process.env.NEXT_PUBLIC_TURNSTILE_SITEVERIFY_URL ??
  "https://turnstile-siteverify-wavio.xolution.workers.dev";

declare global {
  interface Window {
    turnstile?: {
      reset: (widgetId?: string) => void;
      render: (container: HTMLElement | string, opts: Record<string, unknown>) => string;
    };
  }
}

const apiTokens: Token[] = [
  ["k", "POST"],
  ["plain", " "],
  ["s", "/v1/messages"],
  ["plain", "\n"],
  ["p", "{ "],
  ["k", '"to"'],
  ["p", ": "],
  ["s", '"62812…"'],
  ["p", ", "],
  ["k", '"text"'],
  ["p", ": "],
  ["s", '"Pesanan #1234 sudah dikirim"'],
  ["p", " }"],
  ["plain", "\n\n"],
  ["c", "→ 201"],
  ["plain", " { "],
  ["k", '"messageId"'],
  ["p", ": "],
  ["s", '"9f2c…"'],
  ["p", " }"],
];

const bullets = [
  { title: "Satu akun, banyak device", desc: "Kelola semua nomor WhatsApp dari satu dashboard." },
  { title: "Webhook realtime", desc: "Pesan dan status pengiriman diteruskan seketika." },
  { title: "API key aman", desc: "Integrasi tanpa membocorkan kredensial ke aplikasi lain." },
];

function BrandPanel() {
  return (
    <div className="hidden lg:block">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
        WhatsApp API Gateway
      </p>
      <h2 className="mt-4 font-display text-4xl font-semibold leading-[1.05] tracking-tight xl:text-5xl">
        Kelola nomor WhatsApp bisnismu dari satu dashboard.
      </h2>
      <p className="mt-5 max-w-[48ch] leading-relaxed text-fg-muted">
        Kirim notifikasi transaksi, balas pelanggan, dan pantau semua device — tanpa perangkat tambahan.
      </p>

      <ul className="mt-9 space-y-4">
        {bullets.map((b) => (
          <li key={b.title} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-bright">
              <CheckCircle size={13} weight="fill" />
            </span>
            <div>
              <p className="text-sm font-semibold text-fg">{b.title}</p>
              <p className="mt-0.5 text-sm text-fg-faint">{b.desc}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-10 max-w-md">
        <div className="overflow-hidden rounded-2xl border border-line bg-ink-2 shadow-[0_30px_80px_-40px_rgba(16,185,129,0.35)]">
          <div className="flex items-center gap-2 border-b border-line-soft bg-surface/70 px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-2 font-mono text-[10px] text-fg-faint">api.wavio.id</span>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">
            <code>
              <Tokens tokens={apiTokens} />
            </code>
          </pre>
        </div>
      </div>

      <p className="mt-8 flex items-center gap-2 font-mono text-xs text-fg-muted">
        <span className="bk-live-dot h-1.5 w-1.5 rounded-full bg-accent-bright" />
        Semua sistem operasional
      </p>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");

  // Validasi token Turnstile lewat managed siteverify worker (browser → worker → siteverify).
  async function verifyTurnstile(token: string): Promise<boolean> {
    try {
      const res = await fetch(TURNSTILE_SITEVERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      return Boolean(data?.success);
    } catch {
      return false;
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Gate: verifikasi Turnstile dulu — jika belum/gagal, jangan lanjut ke login.
    if (!turnstileToken) {
      setError("Selesaikan verifikasi keamanan dulu.");
      return;
    }
    const human = await verifyTurnstile(turnstileToken);
    if (!human) {
      window.turnstile?.reset();
      setTurnstileToken("");
      setError("Verifikasi keamanan gagal. Coba lagi.");
      return;
    }

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
    <div className="mx-auto w-full max-w-md">
      {/* Brand compact — mobile */}
      <div className="mb-10 text-center lg:hidden">
        <Link href="/" className="inline-flex items-center gap-2.5 font-display font-semibold tracking-tight text-fg">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-ink">
            W
          </span>
          wavio
        </Link>
        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">
          Masuk ke dashboard
        </h1>
        <p className="mt-2 text-sm text-fg-muted">Kelola device dan kirim pesan lewat API.</p>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_40px_100px_-50px_rgba(16,185,129,0.35)] md:p-8">
        <p className="hidden font-mono text-xs uppercase tracking-[0.2em] text-accent-bright lg:block">
          Selamat datang kembali
        </p>
        <h1 className="mt-1 hidden font-display text-2xl font-semibold tracking-tight lg:block">
          Masuk ke dashboard
        </h1>
        <p className="mt-2 hidden text-sm text-fg-muted lg:block">
          Kelola device dan kirim pesan lewat API.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4 lg:mt-8">
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
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-fg">
                Password
              </label>
              <span className="text-xs text-fg-faint">Lupa password? Hubungi admin</span>
            </div>
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

          {error && (
            <p className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
              <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
              {error}
            </p>
          )}

          {/* Turnstile bot check — token dipakai di onSubmit sebelum signIn */}
          <div
            className="cf-turnstile flex justify-center"
            data-sitekey={TURNSTILE_SITEKEY}
            data-action="turnstile-spin-v1"
            data-callback={(token: string) => setTurnstileToken(token)}
            data-expired-callback={() => setTurnstileToken("")}
            data-error-callback={() => setTurnstileToken("")}
          />

          <button
            type="submit"
            disabled={loading}
            className="group flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright hover:shadow-[0_0_44px_-10px_rgba(52,211,153,0.8)] active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              "Memverifikasi…"
            ) : (
              <>
                Masuk
                <ArrowRight size={15} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>
      </div>

      <div className="mt-5 rounded-2xl border border-line-soft bg-surface-2/60 p-4 text-xs text-fg-faint">
        <p className="flex items-center gap-2 font-medium text-fg">
          <Lock size={13} className="text-accent-bright" />
          Akun demo
        </p>
        <p className="mt-1.5 font-mono text-fg-muted">owner@wavio.test / admin123</p>
      </div>
    </div>
  );
}

function LoginPageContent() {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden">
      {/* Turnstile API — widget auto-render pada elemen .cf-turnstile */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        async
        defer
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-70" />
        <div className="absolute left-1/2 top-[-40%] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-accent/10 blur-[150px]" />
      </div>

      <div className="mx-auto grid min-h-[100dvh] max-w-6xl items-center gap-16 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr]">
        <BrandPanel />
        <LoginForm />
      </div>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams (di LoginForm) wajib dibungkus Suspense di Next.js.
  return (
    <Suspense fallback={<div className="min-h-[100dvh]" />}>
      <LoginPageContent />
    </Suspense>
  );
}
