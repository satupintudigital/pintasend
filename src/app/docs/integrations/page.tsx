import { Callout, CodeBlock } from "@/components/docs/primitives";

export default function DocsIntegrations() {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
        Integrasi
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        Panduan Integrasi Pihak Ketiga
      </h1>
      <p className="mt-3 max-w-[60ch] leading-relaxed text-fg-muted">
        Wavio dirancang agar mudah diintegrasikan dari aplikasi apa pun: toko online, CRM, sistem
        kasir, atau internal tool. Satu API key, satu endpoint, dan notifikasi WhatsApp langsung
        terkirim ke pelangganmu.
      </p>

      <div className="mt-10 space-y-12">
        {/* NalaNiaga */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Studi kasus: NalaNiaga
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            NalaNiaga (platform manajemen toko) mengintegrasikan Wavio agar notifikasi transaksi
            pelanggan terkirim otomatis ke WhatsApp — misalnya saat pesanan baru masuk atau status
            pesanan berubah. Alurnya:
          </p>
          <ol className="mt-4 space-y-2 text-sm text-fg-muted">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-xs font-semibold text-accent-bright">1</span>
              Pemilik toko membuat akun Wavio, menyambungkan nomor WA (scan QR), dan membuat API key.
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-xs font-semibold text-accent-bright">2</span>
              API key disimpan di pengaturan NalaNiaga untuk toko tersebut.
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-xs font-semibold text-accent-bright">3</span>
              Saat event toko terjadi (order baru, pembayaran, pengiriman), NalaNiaga memanggil{" "}
              <code className="font-mono text-accent-bright">POST /v1/messages</code> dengan nomor
              pelanggan.
            </li>
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
      text: \`Halo \${order.customer.name}! Pesanan #\${order.number} sudah kami terima.\\n` +
            `Total: Rp \${order.total.toLocaleString("id-ID")}\\n` +
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
                Setiap akun Wavio terisolasi. API key toko A tidak bisa mengirim dari device toko
                B, dan nomor pelanggan tidak pernah bocor antar tenant.
              </p>
            </Callout>
          </div>
        </section>

        {/* cURL */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">Contoh cURL</h2>
          <div className="mt-3">
            <CodeBlock
              lang="bash"
              code={`curl -X POST https://wavio.satupintudigital.co.id/v1/messages \\
  -H "Authorization: Bearer $WAVIO_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"6281234567890","text":"Pesanan #1234 sudah dikirim"}'`}
            />
          </div>
        </section>

        {/* Python */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">Contoh Python</h2>
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
print(resp.json())  # {"ok": true, "messageId": "…"}`}
            />
          </div>
        </section>

        {/* PHP */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">Contoh PHP</h2>
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
echo json_encode($result); // {"ok": true, "messageId": "…"}
?>`}
            />
          </div>
        </section>

        {/* Best practices */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">Praktik terbaik</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-fg-muted">
            <li className="flex gap-2.5">
              <span className="text-accent-bright">✓</span>
              Simpan API key di environment variable / secret manager — bukan di kode atau repository.
            </li>
            <li className="flex gap-2.5">
              <span className="text-accent-bright">✓</span>
              Tangani 409 (device belum siap) dengan retry eksponensial beberapa menit kemudian.
            </li>
            <li className="flex gap-2.5">
              <span className="text-accent-bright">✓</span>
              Tangani 429 dengan membaca header <code className="font-mono">Retry-After</code>.
            </li>
            <li className="flex gap-2.5">
              <span className="text-accent-bright">✓</span>
              Kirim pesan hanya dengan persetujuan penerima — patuhi kebijakan anti-spam WhatsApp.
            </li>
            <li className="flex gap-2.5">
              <span className="text-accent-bright">✓</span>
              Gunakan satu device per toko/cabang agar pesan terarah dan tidak tercampur.
            </li>
          </ul>
        </section>

        {/* Roadmap */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">Peta jalan (roadmap)</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            {[
              ["Webhook pesan masuk", "Terima pesan & event (message.received, session.status) ke URL-mu"],
              ["Media & dokumen", "Kirim gambar, video, PDF, dan stiker"],
              ["Riwayat pesan", "Ambil riwayat pesan masuk/keluar per device"],
              ["Template pesan", "Template terstruktur untuk notifikasi yang konsisten"],
            ].map(([title, desc], i) => (
              <div
                key={title}
                className={`flex items-start gap-4 px-4 py-3.5 ${i > 0 ? "border-t border-line-soft" : ""}`}
              >
                <span className="mt-1 rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-accent-bright">
                  Segera
                </span>
                <div>
                  <p className="text-sm font-medium text-fg">{title}</p>
                  <p className="mt-0.5 text-sm text-fg-muted">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
