import type { Metadata } from "next";
import { CheckCircle } from "@phosphor-icons/react/ssr";
import { Callout, CodeBlock } from "@/components/docs/primitives";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Integrasi Pihak Ketiga — Wavio",
  description:
    "Panduan mengintegrasikan Wavio dari toko online, CRM, kasir, atau internal tool — dengan contoh Node.js, cURL, Python, dan PHP.",
};

export default function DocsIntegrations() {
  return (
    <div>
      {/* Hero */}
      <p className="bk-enter-blur font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
        Integrasi
      </p>
      <h1 className="bk-enter-blur mt-3 max-w-[20ch] font-display text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
        Panduan Integrasi Pihak Ketiga
      </h1>
      <p
        className="bk-enter-blur mt-5 max-w-[58ch] leading-relaxed text-fg-muted"
        style={{ animationDelay: "80ms" }}
      >
        Wavio dirancang agar mudah diintegrasikan dari aplikasi apa pun: toko online, CRM,
        sistem kasir, atau internal tool. Satu API key, satu endpoint, dan notifikasi
        WhatsApp langsung terkirim ke pelangganmu.
      </p>

      <div className="mt-12 space-y-14">
        {/* NalaNiaga */}
        <section>
          <Reveal>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Studi kasus: NalaNiaga
            </h2>
            <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-fg-muted">
              NalaNiaga (platform manajemen toko) mengintegrasikan Wavio agar notifikasi
              transaksi pelanggan terkirim otomatis ke WhatsApp — misalnya saat pesanan
              baru masuk atau status pesanan berubah. Alurnya:
            </p>
            <ol className="relative mt-5 space-y-3">
              {[
                "Pemilik toko membuat akun Wavio, menyambungkan nomor WA (scan QR), dan membuat API key.",
                "API key disimpan di pengaturan NalaNiaga untuk toko tersebut.",
                "Saat event toko terjadi (order baru, pembayaran, pengiriman), NalaNiaga memanggil POST /v1/messages dengan nomor pelanggan.",
              ].map((item, i) => (
                <li key={i} className="relative flex gap-3.5">
                  <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-accent/20 bg-surface-2 font-mono text-xs font-semibold text-accent-bright">
                    {i + 1}
                  </span>
                  <p className="pt-0.5 text-sm leading-relaxed text-fg-muted">{item}</p>
                </li>
              ))}
            </ol>
            <div className="mt-4">
              <CodeBlock
                lang="js"
                code={`// Contoh: kirim notifikasi order dari NalaNiaga (Node.js)
async function sendOrderNotification(order) {
  const res = await fetch("https://wavio.satupintudigital.co.id/v1/messages", {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${store.wavioApiKey}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: order.customer.phone,          // "6281234567890"
      text: \`Halo \${order.customer.name}! Pesanan #\${order.number} sudah kami terima.\n` +
            `Total: Rp \${order.total.toLocaleString("id-ID")}\n` +
            `Status: Diproses\`,
    }),
  });

  if (!res.ok) {
    // 409 = device belum siap, 429 = rate limit — catat & retry
    console.error("WA gagal:", await res.text());
  }
}`}
              />
            </div>
            <div className="mt-4">
              <Callout type="info" title="Isolasi per tenant">
                <p>
                  Setiap akun Wavio terisolasi. API key toko A tidak bisa mengirim dari
                  device toko B, dan nomor pelanggan tidak pernah bocor antar tenant.
                </p>
              </Callout>
            </div>
          </Reveal>
        </section>

        {/* Contoh bahasa */}
        <section>
          <Reveal>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Contoh per bahasa
            </h2>
            <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-fg-muted">
              Pola yang sama di semua bahasa: kirim POST dengan header Authorization, lalu
              cek kode status respons.
            </p>

            <div className="mt-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-fg">cURL</h3>
                <div className="mt-3">
                  <CodeBlock
                    lang="bash"
                    code={`curl -X POST https://wavio.satupintudigital.co.id/v1/messages \\\\
  -H "Authorization: Bearer $WAVIO_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"to":"6281234567890","text":"Pesanan #1234 sudah dikirim"}'`}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-fg">Python</h3>
                <div className="mt-3">
                  <CodeBlock
                    lang="python"
                    code={`import os
import requests

resp = requests.post(
    "https://wavio.satupintudigital.co.id/v1/messages",
    headers={
        "Authorization": f"Bearer {os.environ['WAVIO_KEY']}",
        "Content-Type": "application/json",
    },
    json={"to": "6281234567890", "text": "Pesanan #1234 sudah dikirim"},
)
print(resp.json())  # {"ok": true, "messageId": "3EB0F2A1…"}`}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-fg">PHP</h3>
                <div className="mt-3">
                  <CodeBlock
                    lang="php"
                    code={`<?php
$ch = curl_init("https://wavio.satupintudigital.co.id/v1/messages");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer " . getenv("WAVIO_KEY"),
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "to" => "6281234567890",
        "text" => "Pesanan #1234 sudah dikirim",
    ]),
]);
$result = json_decode(curl_exec($ch), true);
echo json_encode($result); // {"ok": true, "messageId": "3EB0F2A1…"}
?>`}
                  />
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Webhook receiver */}
        <section>
          <Reveal>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Menerima webhook (pesan masuk & status device)
            </h2>
            <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-fg-muted">
              Aktifkan di <strong>Dashboard → Webhook</strong>: isi URL endpoint-mu dan
              pilih event. Setiap kali pelanggan mengirim pesan atau status device
              berubah, Wavio mem-POST event ke URL tersebut. Contoh verifikasi signature
              di Node.js:
            </p>
            <div className="mt-4">
              <CodeBlock
                lang="js"
                code={`const crypto = require("crypto");
const express = require("express");
const app = express();

// Raw body WAJIB (bukan JSON yang sudah di-parse) — signature dihitung atas
// body mentah. Pakai express.raw({ type: "application/json" }).
app.post("/webhooks/wavio", express.raw({ type: "application/json" }), (req, res) => {
  const secret = process.env.WAVIO_WEBHOOK_SECRET; // dari Dashboard → Webhook
  const sig = req.headers["x-wavio-signature"];    // format: sha256=<hex>
  const expected = "sha256=" +
    crypto.createHmac("sha256", secret).update(req.body).digest("hex");

  if (sig !== expected) {
    return res.status(401).json({ error: "bad signature" });
  }

  const event = JSON.parse(req.body);
  if (event.event === "message.received") {
    console.log("Pesan dari", event.data.from, ":", event.data.body);
    // → trigger alur bisnismu (reply otomatis, update CRM, dsb.)
  }
  if (event.event === "session.status") {
    console.log("Device", event.deviceId, "status:", event.data.status);
  }

  res.status(200).json({ ok: true }); // balas 2xx secepatnya
});`}
              />
            </div>
            <div className="mt-4">
              <Callout type="warning" title="Signature atas raw body">
                <p>
                  Jangan mem-verifikasi signature terhadap JSON yang sudah di-stringify
                  ulang — spasi/urutan key yang berubah akan membuat signature gagal.
                  Gunakan raw body persis seperti yang diterima.
                </p>
              </Callout>
            </div>
          </Reveal>
        </section>

        {/* Best practices */}
        <section>
          <Reveal>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Praktik terbaik
            </h2>
            <ul className="mt-5 grid gap-3 md:grid-cols-2">
              {[
                "Simpan API key di environment variable / secret manager — bukan di kode atau repository.",
                "Tangani 409 (device belum siap) dengan retry eksponensial beberapa menit kemudian.",
                "Tangani 429 dengan membaca header Retry-After.",
                "Kirim pesan hanya dengan persetujuan penerima — patuhi kebijakan anti-spam WhatsApp.",
                "Gunakan satu device per toko/cabang agar pesan terarah dan tidak tercampur.",
              ].map((item) => (
                <li
                  key={item}
                  className="flex gap-3 rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-fg-muted transition-colors hover:border-accent/25"
                >
                  <CheckCircle
                    size={18}
                    weight="fill"
                    className="mt-0.5 shrink-0 text-accent-bright"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* Roadmap */}
        <section>
          <Reveal>
            <h2 className="font-display text-xl font-semibold tracking-tight">
              Peta jalan (roadmap)
            </h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
            {[
              ["Media & dokumen", "Kirim gambar, video, PDF, dan stiker"],
                ["Riwayat pesan", "Ambil riwayat pesan masuk/keluar per device"],
                ["Template pesan", "Template terstruktur untuk notifikasi yang konsisten"],
              ].map(([title, desc], i) => (
                <div
                  key={title}
                  className={`flex items-start gap-4 px-4 py-3.5 transition-colors hover:bg-surface/60 ${
                    i > 0 ? "border-t border-line-soft" : ""
                  }`}
                >
                  <span className="mt-1 shrink-0 rounded-md border border-accent/20 bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-bright">
                    Segera
                  </span>
                  <div>
                    <p className="text-sm font-medium text-fg">{title}</p>
                    <p className="mt-0.5 text-sm text-fg-muted">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>
      </div>
    </div>
  );
}
