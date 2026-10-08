"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle, Warning } from "@phosphor-icons/react";
import { Logo } from "@/components/Logo";
import type { PublicCatalog } from "@/lib/catalog";

// text-base (16px) wajib di mobile: font < 16px memicu auto-zoom iOS saat fokus.
const fieldClass =
  "min-h-12 w-full rounded-xl border border-line bg-ink-2 px-4 py-3 text-base text-fg placeholder:text-fg-faint transition-all focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

const TURNSTILE_SITEKEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? "0x4AAAAAAESpUhXE0d_l2Z_l";
// Bila env siteverify belum diset (dev/sandbox), server tidak memverifikasi —
// widget & token tidak wajib.
const TURNSTILE_REQUIRED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITEVERIFY_URL);

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetPlan = searchParams.get("plan") ?? undefined;
  const presetAddon = searchParams.get("addon") ?? undefined;

  const [catalog, setCatalog] = useState<PublicCatalog | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [planId, setPlanId] = useState<string>("");
  const [addonKeys, setAddonKeys] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    // Sudah login (mis. klik harga dari dashboard) → langsung ke checkout,
    // jangan buat akun duplikat.
    fetch("/api/billing/my")
      .then((r) => {
        if (r.ok && mounted) {
          const q = new URLSearchParams();
          if (presetPlan) q.set("plan", presetPlan);
          if (presetAddon) q.set("addon", presetAddon);
          const qs = q.toString();
          router.replace(qs ? `/checkout?${qs}` : "/checkout");
        }
        return r;
      })
      .catch(() => undefined);
    fetch("/api/public/catalog")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: { catalog: PublicCatalog }) => {
        if (!mounted) return;
        setCatalog(data.catalog);
        const plans = data.catalog.plans;
        // Preselect: query plan bila valid; else plan berlangganan pertama (Latte).
        const pref = plans.find((p) => p.id === presetPlan) ?? plans.find((p) => p.kind === "subscription");
        if (pref) setPlanId(pref.id);
        if (presetAddon && data.catalog.addons.some((a) => a.key === presetAddon && a.priceMonthly != null)) {
          setAddonKeys([presetAddon]);
        }
      })
      .catch(() => {
        if (mounted) setError("Katalog harga gagal dimuat. Muat ulang halaman.");
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetPlan, presetAddon]);

  // Render widget Turnstile secara eksplisit (callback fungsi tidak bisa via
  // atribut data-*). Hanya bila server akan memverifikasi (env siteverify ada).
  useEffect(() => {
    if (!TURNSTILE_REQUIRED) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const render = () => {
      const el = turnstileRef.current;
      if (!el || !window.turnstile) return false;
      window.turnstile.render(el, {
        sitekey: TURNSTILE_SITEKEY,
        callback: (token: string) => setTurnstileToken(token),
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => setTurnstileToken(""),
      });
      return true;
    };
    if (!render()) {
      interval = setInterval(() => {
        if (cancelled || render()) {
          if (interval) clearInterval(interval);
        }
      }, 200);
    }
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  const toggleAddon = (key: string) => {
    setAddonKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const token =
      turnstileToken ||
      (turnstileRef.current && window.turnstile ? (window.turnstile.getResponse(turnstileRef.current) as string) : "") ||
      "";
    if (TURNSTILE_REQUIRED && !token) {
      setError("Selesaikan verifikasi keamanan dulu.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          tenantName,
          plan: planId || undefined,
          addon: addonKeys[0] || undefined,
          turnstileToken: token || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; redirectTo?: string };
      if (!res.ok) {
        setError(data.error ?? "Pendaftaran gagal. Coba lagi.");
        window.turnstile?.reset();
        setTurnstileToken("");
        return;
      }
      const target = data.redirectTo && data.redirectTo.startsWith("/") ? data.redirectTo : "/checkout";
      router.push(target);
      router.refresh();
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  const plans = catalog?.plans ?? [];
  const purchasableAddons = (catalog?.addons ?? []).filter((a) => a.priceMonthly != null);
  const selectedPlan = plans.find((p) => p.id === planId);

  return (
    <main className="relative min-h-[100dvh] overflow-hidden">
      {TURNSTILE_REQUIRED && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer />
      )}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-70" />
        <div className="bk-breath absolute left-1/2 top-[-40%] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-accent/10 blur-[150px]" />
      </div>

      <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col justify-center px-5 py-12">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Logo />
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight md:text-3xl">Buat akun PintaSend</h1>
          <p className="max-w-[46ch] text-sm leading-relaxed text-fg-muted">
            Setelah daftar kamu langsung diarahkan ke pembayaran untuk mengaktifkan paket.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_40px_100px_-50px_rgba(16,185,129,0.35)] md:p-8">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-fg">Nama lengkap</label>
                <input id="name" value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Nama kamu" autoComplete="name" required />
              </div>
              <div>
                <label htmlFor="tenantName" className="mb-1.5 block text-sm font-medium text-fg">Nama tenant / bisnis</label>
                <input id="tenantName" value={tenantName} onChange={(e) => setTenantName(e.target.value)} className={fieldClass} placeholder="PT Contoh" autoComplete="organization" required />
              </div>
            </div>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-fg">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} placeholder="nama@email.com" autoComplete="email" required />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-fg">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClass} placeholder="Minimal 8 karakter" autoComplete="new-password" minLength={8} required />
            </div>

            {/* Pilihan paket — dinamis dari katalog */}
            <div>
              <p className="mb-2 text-sm font-medium text-fg">Pilih paket</p>
              {!catalog ? (
                <div className="h-24 animate-pulse rounded-xl border border-line bg-ink-2" />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {plans.map((p) => {
                    const checked = planId === p.id;
                    const price =
                      p.kind === "prepaid" && p.pricePerMessage != null
                        ? `Rp ${p.pricePerMessage.toLocaleString("id-ID")}/pesan`
                        : p.priceMonthly != null
                          ? `${rupiah(p.priceMonthly)}/bulan`
                          : "";
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPlanId(p.id)}
                        aria-pressed={checked}
                        className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                          checked ? "border-accent/60 bg-accent/5" : "border-line bg-ink-2 hover:border-line"
                        }`}
                      >
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${checked ? "border-accent" : "border-line"}`}>
                          {checked && <span className="h-2 w-2 rounded-full bg-accent" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-fg">{p.name}</span>
                          <span className="block text-xs text-fg-faint">{p.tagline}</span>
                          <span className="mt-0.5 block text-xs font-medium text-accent-bright">{price}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-xs text-fg-faint">
                {selectedPlan?.kind === "prepaid"
                  ? "Espresso = pulsa pesan (top-up pertama mengaktifkan tenant, tanpa biaya aktivasi)."
                  : `Paket bulanan dikenakan biaya aktivasi ${catalog ? rupiah(catalog.settings.activationFeeRp) : ""} sekali.`}
              </p>
            </div>

            {/* Add-on berbayar (opsional, di-bundle order pertama) */}
            {purchasableAddons.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-fg">Add-on (opsional)</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {purchasableAddons.map((a) => {
                    const checked = addonKeys.includes(a.key);
                    return (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() => toggleAddon(a.key)}
                        aria-pressed={checked}
                        className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                          checked ? "border-accent/60 bg-accent/5" : "border-line bg-ink-2 hover:border-line"
                        }`}
                      >
                        <CheckCircle size={18} className={`mt-0.5 shrink-0 ${checked ? "text-accent-bright" : "text-fg-faint"}`} weight={checked ? "fill" : "regular"} />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-fg">{a.name}</span>
                          <span className="block text-xs text-fg-faint">{a.tagline}</span>
                          <span className="mt-0.5 block text-xs font-medium text-accent-bright">{rupiah(a.priceMonthly!)}/bulan</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {TURNSTILE_REQUIRED && (
              <div className="flex justify-center">
                <div ref={turnstileRef} />
              </div>
            )}

            {error && (
              <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-600">
                <Warning size={16} className="mt-0.5 shrink-0" weight="fill" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !catalog}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-12px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? "Membuat akun…" : (
                <>
                  Lanjut ke pembayaran
                  <ArrowRight size={15} weight="bold" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-fg-muted">
          Sudah punya akun?{" "}
          <Link href="/login" className="font-semibold text-accent-bright hover:underline">
            Masuk
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh]" />}>
      <RegisterContent />
    </Suspense>
  );
}
