import Link from "next/link";
import { ArrowRight, Lightning, QrCode, Key, PaperPlaneTilt } from "@phosphor-icons/react/ssr";
import { Callout, CodeBlock } from "@/components/docs/primitives";

const steps = [
  {
    icon: Key,
    title: "1. Buat API key",
    desc: "Login ke dashboard → API Key → Buat. Key hanya muncul sekali.",
  },
  {
    icon: QrCode,
    title: "2. Sambungkan device",
    desc: "Device → Tambah → scan QR dengan WhatsApp di HP.",
  },
  {
    icon: PaperPlaneTilt,
    title: "3. Kirim pesan",
    desc: "Panggil POST /v1/messages dengan Authorization Bearer key-mu.",
  },
];

export default function DocsIndex() {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
        Dokumentasi
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        WhatsApp API untuk bisnismu
      </h1>
      <p className="mt-3 max-w-[60ch] leading-relaxed text-fg-muted">
        Wavio menghubungkan nomor WhatsApp ke aplikasi apa pun lewat satu API sederhana.
        Kirim notifikasi transaksi, konfirmasi pesanan, atau pesan otomatis — dalam hitungan menit.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/docs/api"
          className="group inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink transition-all hover:bg-accent-bright active:scale-[0.98]"
        >
          Referensi API
          <ArrowRight size={15} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/docs/integrations"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-2/60 px-5 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:border-accent/50 hover:text-fg"
        >
          Panduan Integrasi
        </Link>
      </div>

      {/* Alur */}
      <div className="mt-14">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-faint">
          Mulai dalam 3 langkah
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className="rounded-2xl border border-line bg-surface p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
                <s.icon size={19} />
              </span>
              <p className="mt-4 font-display text-base font-semibold tracking-tight">{s.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quickstart */}
      <div className="mt-14">
        <div className="flex items-center gap-2">
          <Lightning size={18} className="text-accent-bright" weight="fill" />
          <h2 className="font-display text-2xl font-semibold tracking-tight">Mulai Cepat</h2>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-fg">Kirim pesan pertama</h3>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`# Ganti dengan API key milikmu (dashboard → API Key)
WAVIO_KEY="wavio_…"

curl -X POST https://wavio.satupintudigital.co.id/v1/messages \\
  -H "Authorization: Bearer $WAVIO_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "6281234567890",
    "text": "Pesanan #1234 sudah dikirim 🎉"
  }'`}
              />
            </div>
          </div>

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
    text: "Pesanan #1234 sudah dikirim 🎉",
  }),
});

const data = await res.json();
console.log(data); // { ok: true, messageId: "…" }`}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-fg">Respons sukses</h3>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`{
  "ok": true,
  "deviceId": "01j…",
  "to": "6281234567890@c.us",
  "messageId": "3EB0…"
}`}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12 space-y-4">
        <Callout type="info" title="Nomor yang didukung">
          <p>
            Gunakan format internasional <code className="font-mono">62812…</code> atau lokal{" "}
            <code className="font-mono">0812…</code> — Wavio menormalisasi otomatis. Nomor{" "}
            <strong>harus</strong> terdaftar di WhatsApp.
          </p>
        </Callout>
        <Callout type="warning" title="Kebijakan anti-spam">
          <p>
            Kirim pesan hanya ke pelanggan yang memberikan persetujuan. Penyalahgunaan dapat
            menyebabkan nomor diblokir WhatsApp dan akun ditangguhkan.
          </p>
        </Callout>
      </div>
    </div>
  );
}
