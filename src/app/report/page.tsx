"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Nav } from "@/components/landing/Nav";
import { Footer } from "@/components/landing/Footer";
import {
  Warning,
  ShieldCheck,
  ArrowRight,
  CheckCircle,
  EnvelopeSimple,
  LinkSimple,
  User,
  ChatCircleText,
  IdentificationCard,
  Info,
  PaperPlaneTilt,
} from "@phosphor-icons/react/ssr";

const enterSpring = {
  type: "spring",
  stiffness: 280,
  damping: 26,
  mass: 0.9,
} as const;

const categories = [
  { value: "spam", label: "Spam / pesan massal tanpa persetujuan" },
  { value: "phishing", label: "Phishing / penipuan" },
  { value: "konten_ilegal", label: "Konten yang dilarang undang-undang" },
  { value: "terorisme", label: "Terorisme / ancaman keamanan" },
  { value: "pornografi", label: "Pornografi / eksploitasi" },
  { value: "perjudian", label: "Perjudian" },
  { value: "ujaran_kebencian", label: "Ujaran kebencian / SARA" },
  { value: "pelanggaran_privasi", label: "Pelanggaran privasi / data pribadi" },
  {
    value: "pelanggaran_kebijakan",
    label: "Pelanggaran kebijakan WhatsApp Business",
  },
  { value: "lainnya", label: "Lainnya" },
];

export default function ReportPage() {
  const reduced = useReducedMotion();
  const [submitted, setSubmitted] = useState(false);
  const [refId, setRefId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = e.currentTarget;
    const fd = new FormData(form);

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reporterName: fd.get("reporterName"),
          reporterEmail: fd.get("reporterEmail"),
          category: fd.get("category"),
          description: fd.get("description"),
          evidenceUrl: fd.get("evidenceUrl") || undefined,
          tenantRef: fd.get("tenantRef") || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setRefId(data.refId || "—");
        setSubmitted(true);
      } else {
        throw new Error(data.error || "Gagal mengirim laporan");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <>
        <Nav />
        <main id="main" className="relative min-h-screen">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" />
            <div className="bk-breath absolute left-1/2 top-[-10%] h-[400px] w-[700px] -ml-[350px] rounded-full bg-accent/8 blur-[140px]" />
          </div>

          <div className="mx-auto max-w-lg px-5 py-24 text-center md:py-32">
            <motion.div
              initial={reduced ? false : { opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ ...enterSpring, delay: 0 }}
            >
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 text-accent-bright">
                <CheckCircle size={32} weight="fill" />
              </div>
              <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
                Laporan berhasil dikirim
              </h1>
              <p className="mt-3 text-fg-muted">
                Nomor referensi Anda:
              </p>
              <p className="mt-2 inline-block rounded-xl border border-line bg-surface/70 px-5 py-2.5 font-mono text-lg font-medium tracking-wide text-fg">
                {refId}
              </p>
              <p className="mt-6 max-w-[48ch] text-sm leading-relaxed text-fg-muted">
                Tim kami akan meninjau laporan ini dan menindaklanjuti sesuai
                kebijakan takedown yang berlaku. Anda akan menerima konfirmasi
                melalui email yang telah didaftarkan.
              </p>
              <Link
                href="/"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.98]"
              >
                Kembali ke beranda
                <ArrowRight size={15} weight="bold" />
              </Link>
            </motion.div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Nav />
      <main id="main" className="relative min-h-screen">
        {/* Ambient backdrop */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" />
          <div className="bk-breath absolute left-1/2 top-[-8%] h-[360px] w-[600px] -ml-[300px] rounded-full bg-accent/8 blur-[140px]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        </div>

        {/* Hero section */}
        <div className="mx-auto max-w-3xl px-5 pt-24 pb-12 md:pt-32 md:pb-16">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 18, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ ...enterSpring, delay: 0 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/5 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-red-400">
              <Warning size={13} weight="fill" />
              Pelaporan Konten Ilegal
            </div>
          </motion.div>

          <motion.h1
            className="mt-6 font-display text-3xl font-semibold leading-[1.1] tracking-tight md:text-[2.8rem]"
            initial={reduced ? false : { opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ ...enterSpring, delay: 0.08 }}
          >
            Lapor konten atau aktivitas ilegal
          </motion.h1>

          <motion.p
            className="mt-4 max-w-[54ch] text-base leading-relaxed text-fg-muted"
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...enterSpring, delay: 0.16 }}
          >
            Formulir ini untuk melaporkan Informasi Elektronik dan/atau Dokumen
            Elektronik yang dilarang sebagaimana dimaksud dalam Peraturan Menteri
            Komunikasi dan Informatika Nomor 5 Tahun 2020.
          </motion.p>
        </div>

        {/* Form sections */}
        <div className="mx-auto max-w-3xl px-5 pb-24">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Error banner */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-400"
              >
                {error}
              </motion.div>
            )}

            {/* Section: Identitas Pelapor */}
            <motion.div
              className="rounded-2xl border border-line bg-surface/60 p-6 backdrop-blur md:p-8"
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...enterSpring, delay: 0.2 }}
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent-bright">
                  <User size={18} />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    Identitas Pelapor
                  </h2>
                  <p className="text-xs text-fg-faint">
                    Data Anda dilindungi dan hanya digunakan untuk penanganan
                    laporan.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="reporterName"
                    className="mb-1.5 block text-sm font-medium text-fg"
                  >
                    Nama Lengkap{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="reporterName"
                      name="reporterName"
                      required
                      maxLength={200}
                      placeholder="Nama lengkap Anda"
                      className="w-full rounded-xl border border-line-soft bg-ink-2/80 px-4 py-2.5 text-sm text-fg placeholder:text-fg-faint/40 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reporterEmail"
                    className="mb-1.5 block text-sm font-medium text-fg"
                  >
                    Email Pelapor{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-faint/50">
                      <EnvelopeSimple size={15} />
                    </span>
                    <input
                      id="reporterEmail"
                      name="reporterEmail"
                      type="email"
                      required
                      maxLength={200}
                      placeholder="email@contoh.com"
                      className="w-full rounded-xl border border-line-soft bg-ink-2/80 py-2.5 pl-10 pr-4 text-sm text-fg placeholder:text-fg-faint/40 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Section: Detail Laporan */}
            <motion.div
              className="rounded-2xl border border-line bg-surface/60 p-6 backdrop-blur md:p-8"
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...enterSpring, delay: 0.28 }}
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent-bright">
                  <ChatCircleText size={18} />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    Detail Laporan
                  </h2>
                  <p className="text-xs text-fg-faint">
                    Jelaskan konten atau aktivitas yang ingin Anda laporkan.
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Kategori */}
                <div>
                  <label
                    htmlFor="category"
                    className="mb-1.5 block text-sm font-medium text-fg"
                  >
                    Kategori Pelanggaran{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="category"
                    name="category"
                    required
                    className="w-full appearance-none rounded-xl border border-line-soft bg-ink-2/80 px-4 py-2.5 text-sm text-fg transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
                  >
                    <option value="">— Pilih kategori —</option>
                    {categories.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Deskripsi */}
                <div>
                  <label
                    htmlFor="description"
                    className="mb-1.5 block text-sm font-medium text-fg"
                  >
                    Deskripsi Konten / Aktivitas yang Dilaporkan{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    required
                    rows={5}
                    maxLength={5000}
                    placeholder="Jelaskan konten atau aktivitas yang Anda laporkan, termasuk data pendukung jika ada (misal: nomor pengirim, waktu kejadian, cuplikan layar)."
                    className="w-full rounded-xl border border-line-soft bg-ink-2/80 px-4 py-3 text-sm text-fg placeholder:text-fg-faint/40 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
                  />
                  <p className="mt-1.5 text-right text-[11px] text-fg-faint/50">
                    Maks. 5.000 karakter
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Section: Bukti & Referensi */}
            <motion.div
              className="rounded-2xl border border-line bg-surface/60 p-6 backdrop-blur md:p-8"
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...enterSpring, delay: 0.36 }}
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent-bright">
                  <IdentificationCard size={18} />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    Bukti & Referensi
                  </h2>
                  <p className="text-xs text-fg-faint">
                    Sertakan bukti pendukung untuk mempercepat penanganan.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="evidenceUrl"
                    className="mb-1.5 block text-sm font-medium text-fg"
                  >
                    Tautan / Bukti Pendukung{" "}
                    <span className="text-fg-faint text-xs">(opsional)</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-faint/50">
                      <LinkSimple size={15} />
                    </span>
                    <input
                      id="evidenceUrl"
                      name="evidenceUrl"
                      type="url"
                      maxLength={500}
                      placeholder="https://…"
                      className="w-full rounded-xl border border-line-soft bg-ink-2/80 py-2.5 pl-10 pr-4 text-sm text-fg placeholder:text-fg-faint/40 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="tenantRef"
                    className="mb-1.5 block text-sm font-medium text-fg"
                  >
                    Email / ID Akun PintaSend Terkait{" "}
                    <span className="text-fg-faint text-xs">(opsional)</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-faint/50">
                      <ShieldCheck size={15} />
                    </span>
                    <input
                      id="tenantRef"
                      name="tenantRef"
                      maxLength={200}
                      placeholder="email atau nama akun PintaSend"
                      className="w-full rounded-xl border border-line-soft bg-ink-2/80 py-2.5 pl-10 pr-4 text-sm text-fg placeholder:text-fg-faint/40 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/20"
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Info box */}
            <motion.div
              className="flex gap-3 rounded-2xl border border-line bg-surface/40 p-4"
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...enterSpring, delay: 0.42 }}
            >
              <Info
                size={18}
                className="mt-0.5 shrink-0 text-accent-bright"
              />
              <div className="text-xs leading-relaxed text-fg-faint">
                <span className="font-medium text-fg-muted">
                  Kebijakan takedown
                </span>{" "}
                — Laporan ditanggapi sesuai Permenkominfo 5/2020:{" "}
                <span className="font-medium text-fg-muted">
                  biasa ≤ 1×24 jam
                </span>
                ,{" "}
                <span className="font-medium text-fg-muted">
                  mendesak ≤ 4 jam
                </span>
                . Anda akan menerima konfirmasi melalui email.
              </div>
            </motion.div>

            {/* Submit */}
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...enterSpring, delay: 0.48 }}
            >
              <button
                type="submit"
                disabled={loading}
                className="bk-shimmer group flex w-full items-center justify-center gap-2.5 rounded-full bg-accent px-6 py-3.5 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright hover:shadow-[0_0_44px_-8px_rgba(52,211,153,0.8)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
                    Mengirim…
                  </>
                ) : (
                  <>
                    Kirim Laporan
                    <PaperPlaneTilt
                      size={16}
                      weight="bold"
                      className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </>
                )}
              </button>
            </motion.div>
          </form>
        </div>
      </main>
      <Footer />
    </>
  );
}
