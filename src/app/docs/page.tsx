import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Key,
  Lightning,
  PaperPlaneTilt,
  QrCode,
} from "@phosphor-icons/react/ssr";
import { Callout, CodeBlock } from "@/components/docs/primitives";
import { Reveal } from "@/components/Reveal";
import { AmbientParallax } from "@/components/docs/AmbientParallax";

export const metadata: Metadata = {
  title: "Ringkasan & Mulai Cepat — Wavio",
  description:
    "Mulai pakai Wavio dalam 3 langkah: buat API key, sambungkan device WhatsApp, lalu kirim pesan lewat satu endpoint REST.",
};

/* ── Mock mini UI di dalam kartu langkah (bukan ikon generik semata) ── */

function KeyMock() {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-line-soft bg-ink-2 px-3 py-2 font-mono text-xs">
      <span className="truncate text-fg-muted">wavio_2f9c8a1b4d7e0a3c</span>
      <span className="shrink-0 tracking-widest text-accent-bright">••••</span>
    </div>
  );
}

const qrPattern = "11111011000101101010110001101111101100101101010010";

function QrMock() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line-soft bg-ink-2 p-3">
      <div aria-hidden className="grid shrink-0 grid-cols-7 gap-[3px]">
        {qrPattern.split("").map((c, i) => (
          <span
            key={i}
            className={`h-[7px] w-[7px] rounded-[1.5px] ${
              c === "1" ? "bg-fg/70" : "bg-fg/10"
            }`}
          />
        ))}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-fg">Toko Utama</p>
        <p className="mt-0.5 font-mono text-[10px] text-accent-bright">Menunggu scan</p>
      </div>
    </div>
  );
}

function SendMock() {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-line-soft bg-ink-2 px-3 py-2 font-mono text-xs">
      <span className="truncate">
        <span className="text-accent-bright">POST</span>
        <span className="text-fg-faint"> /v1/messages</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-accent-bright">
        <span className="bk-live-dot h-1.5 w-1.5 rounded-full bg-accent-bright" />
        200 OK
      </span>
    </div>
  );
}

const steps = [
  {
    icon: Key,
    num: "01",
    title: "Buat API key",
    desc: "Login ke dashboard → API Key → Buat. Key hanya muncul sekali.",
    mock: <KeyMock />,
  },
  {
    icon: QrCode,
    num: "02",
    title: "Sambungkan device",
    desc: "Device → Tambah → scan QR dengan WhatsApp di HP.",
    mock: <QrMock />,
  },
  {
    icon: PaperPlaneTilt,
    num: "03",
    title: "Kirim pesan",
    desc: "Panggil POST /v1/messages dengan Authorization Bearer key-mu.",
    mock: <SendMock />,
  },
];

export default function DocsIndex() {
  return (
    <div>
      {/* Hero */}
      <div className="relative overflow-hidden">
        {/* Glow hero dengan parallax sendiri — faktor 0.5, lebih cepat dari
            ambient layout (0.12/0.28) → lapisan ketiga yang terasa paling
            dekat dan "ditinggalkan" saat halaman discroll. */}
        <AmbientParallax className="h-[420px]">
          <div
            data-parallax="0.5"
            className="absolute -right-24 -top-20 h-[360px] w-[360px] rounded-full bg-accent/5 blur-[120px] will-change-transform"
          />
        </AmbientParallax>
        <div className="relative">
          <p className="bk-enter-blur font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
            Dokumentasi
          </p>
          <h1 className="bk-enter-blur mt-3 max-w-[16ch] font-display text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
            WhatsApp API untuk bisnismu
          </h1>
          <p
            className="bk-enter-blur mt-5 max-w-[58ch] leading-relaxed text-fg-muted"
            style={{ animationDelay: "80ms" }}
          >
            Wavio menghubungkan nomor WhatsApp ke aplikasi apa pun lewat satu API
            sederhana. Kirim notifikasi transaksi, konfirmasi pesanan, atau pesan
            otomatis — dalam hitungan menit.
          </p>

          <div
            className="bk-enter-blur mt-8 flex flex-wrap gap-3"
            style={{ animationDelay: "160ms" }}
          >
            <Link
              href="/docs/api"
              className="bk-shimmer group inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink shadow-[0_0_28px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright active:scale-[0.98]"
            >
              Referensi API
              <ArrowRight
                size={15}
                weight="bold"
                className="transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <Link
              href="/docs/integrations"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-2/60 px-5 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:border-accent/50 hover:text-fg"
            >
              Panduan Integrasi
            </Link>
          </div>

          <div
            className="bk-enter-blur mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs text-fg-faint"
            style={{ animationDelay: "240ms" }}
          >
            <span className="flex items-center gap-2">
              <span className="bk-live-dot h-1.5 w-1.5 rounded-full bg-accent-bright" />
              Semua sistem operasional
            </span>
            <span aria-hidden className="hidden h-3 w-px bg-line sm:block" />
            <span>REST · JSON · Auth Bearer</span>
            <span aria-hidden className="hidden h-3 w-px bg-line sm:block" />
            <span>Rate limit 60/menit</span>
          </div>
        </div>
      </div>

      {/* Alur: 3 langkah dengan mock mini UI */}
      <div className="mt-16 md:mt-20">
        <Reveal>
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-faint">
              Mulai dalam 3 langkah
            </p>
            <span className="hidden font-mono text-[10px] text-fg-faint sm:block">
              Rata-rata 5 menit
            </span>
          </div>

          <div className="relative mt-5">
            {/* Garis penghubung (desktop) */}
            <div
              aria-hidden
              className="absolute left-10 right-10 top-10 hidden h-px bg-[repeating-linear-gradient(90deg,var(--color-line)_0_8px,transparent_8px_16px)] md:block"
            />
            <div className="relative grid gap-4 md:grid-cols-3">
              {steps.map((s, i) => (
                <div
                  key={s.title}
                  className={`bk-lift relative flex flex-col rounded-2xl border border-line bg-surface p-5 hover:border-accent/30 ${
                    i === 1 ? "md:mt-6" : ""
                  }`}
                >
                  <span className="absolute right-4 top-4 font-mono text-[10px] text-fg-faint">
                    {s.num}
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
                    <s.icon size={19} />
                  </span>
                  <h3 className="mt-4 font-display text-base font-semibold tracking-tight">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{s.desc}</p>
                  <div className="mt-auto pt-4">{s.mock}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>

      {/* Quickstart */}
      <div className="mt-16 md:mt-20">
        <Reveal>
          <div className="flex items-center gap-2">
            <Lightning size={18} weight="fill" className="text-accent-bright" />
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Mulai Cepat
            </h2>
          </div>

          <div className="mt-6 space-y-6">
            <Reveal delay={80}>
            <div>
              <h3 className="text-sm font-semibold text-fg">Kirim pesan pertama</h3>
              <div className="mt-3">
                <CodeBlock
                  lang="bash"
                  code={`# Ganti dengan API key milikmu (dashboard → API Key)
WAVIO_KEY="wavio_2f9c8a1b4d7e0a3c"

curl -X POST https://wavio.satupintudigital.co.id/v1/messages \\\\
  -H "Authorization: Bearer $WAVIO_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{
    "to": "6281234567890",
    "text": "Pesanan #1234 sudah dikirim"
  }'`}
                />
              </div>
            </div>
            </Reveal>

            <Reveal delay={160}>
            <div>
              <h3 className="text-sm font-semibold text-fg">Node.js</h3>
              <div className="mt-3">
                <CodeBlock
                  lang="js"
                  code={`const res = await fetch("https://wavio.satupintudigital.co.id/v1/messages", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.WAVIO_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    to: "6281234567890",
    text: "Pesanan #1234 sudah dikirim",
  }),
});

const data = await res.json();
console.log(data); // { ok: true, messageId: "3EB0F2A1…" }`}
                />
              </div>
            </div>
            </Reveal>

            <Reveal delay={240}>
            <div>
              <h3 className="text-sm font-semibold text-fg">Respons sukses</h3>
              <div className="mt-3">
                <CodeBlock
                  lang="json"
                  code={`{
  "ok": true,
  "deviceId": "01j5…",
  "to": "6281234567890@c.us",
  "messageId": "3EB0F2A1…"
}`}
                />
              </div>
            </div>
            </Reveal>
          </div>
        </Reveal>

        <div className="mt-10 space-y-4">
          <Callout type="info" title="Nomor yang didukung">
            <p>
              Gunakan format internasional <code className="font-mono">62812…</code> atau
              lokal <code className="font-mono">0812…</code> — Wavio menormalisasi
              otomatis. Nomor <strong>harus</strong> terdaftar di WhatsApp.
            </p>
          </Callout>
          <Callout type="warning" title="Kebijakan anti-spam">
            <p>
              Kirim pesan hanya ke pelanggan yang memberikan persetujuan.
              Penyalahgunaan dapat menyebabkan nomor diblokir WhatsApp dan akun
              ditangguhkan.
            </p>
          </Callout>
        </div>
      </div>
    </div>
  );
}
