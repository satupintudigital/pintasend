import type { Metadata } from "next";
import { Anchor, Callout, CodeBlock, EndpointTable } from "@/components/docs/primitives";
import { ApiToc } from "@/components/docs/ApiToc";

export const metadata: Metadata = {
  title: "Referensi API — Wavio",
  description:
    "Referensi lengkap endpoint API Wavio: base URL, autentikasi Bearer, POST /v1/messages, rate limit, dan daftar kode status.",
};

const endpoints = [
  { method: "POST" as const, path: "/v1/messages", desc: "Kirim pesan teks & media WhatsApp" },
  { method: "GET" as const, path: "/api/health", desc: "Status layanan (publik)" },
];

export default function DocsApi() {
  return (
    <div>
      {/* Hero */}
      <p className="bk-enter-blur font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
        Referensi API
      </p>
      <h1 className="bk-enter-blur mt-3 max-w-[18ch] font-display text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl">
        Endpoint API
      </h1>
      <p
        className="bk-enter-blur mt-5 max-w-[58ch] leading-relaxed text-fg-muted"
        style={{ animationDelay: "80ms" }}
      >
        Semua endpoint memakai satu API key dan satu format respons JSON. Cukup
        sambungkan device sekali, lalu kirim pesan dari aplikasi mana pun.
      </p>

      <div className="mt-10 lg:grid lg:grid-cols-[minmax(0,1fr)_190px] lg:gap-10">
        <div className="min-w-0 space-y-12">
          {/* Base URL */}
          <section>
            <Anchor id="base-url">Base URL</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Semua endpoint publik diakses melalui:
            </p>
            <div className="mt-3">
              <CodeBlock lang="text" code="https://wavio.satupintudigital.co.id" />
            </div>
          </section>

          {/* Auth */}
          <section>
            <Anchor id="autentikasi">Autentikasi</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Kirim API key-mu pada header{" "}
              <code className="font-mono text-accent-bright">Authorization</code> dengan
              skema <code className="font-mono">Bearer</code>. Buat key di{" "}
              <strong>Dashboard → API Key</strong>. Key hanya ditampilkan sekali saat
              dibuat.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`Authorization: Bearer wavio_2f9c8a1b4d7e0a3c5b8f1d2e4a6c7b9d`}
              />
            </div>
            <div className="mt-4">
              <Callout type="warning" title="Jaga kerahasiaan key">
                <p>
                  Key setara dengan password. Jangan commit ke repository, kirim lewat
                  chat, atau ekspos di kode frontend. Jika bocor, cabut di dashboard dan
                  buat key baru.
                </p>
              </Callout>
            </div>
          </section>

          {/* Daftar endpoint */}
          <section>
            <Anchor id="daftar-endpoint">Daftar Endpoint</Anchor>
            <div className="mt-4">
              <EndpointTable endpoints={endpoints} />
            </div>
          <p className="mt-3 text-xs text-fg-faint">
            Riwayat pesan masuk &amp; keluar bisa dilihat di{" "}
            <a
              href="/dashboard/pesan"
              className="font-medium text-accent-bright underline decoration-accent/30 underline-offset-2 transition-colors hover:decoration-accent"
            >
              Dashboard → Riwayat Pesan
            </a>
            . Endpoint media sedang dalam pengembangan.
          </p>
          </section>

          {/* POST /v1/messages */}
          <section>
            <Anchor id="kirim-pesan">POST /v1/messages — Kirim pesan</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Mengirim <strong>teks</strong> atau <strong>media</strong> (gambar, video,
              audio, dokumen, stiker) dari device yang tersambung. Otomatis memakai
              device dengan status <code className="font-mono">ready</code>; berikan{" "}
              <code className="font-mono">deviceId</code> untuk memilih device tertentu.
            </p>

            <h3 className="mt-6 text-sm font-semibold text-fg">Body request — teks</h3>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`{
  "to": "6281234567890",
  "text": "Pesanan #1234 sudah dikirim",
  "deviceId": "01j5…"   // opsional
}`}
              />
            </div>

            <h3 className="mt-6 text-sm font-semibold text-fg">Body request — media via URL</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              URL publik akan diambil oleh gateway (SSRF-guarded) lalu dikirim.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`{
  "to": "6281234567890",
  "mediaType": "image",              // image | video | audio | document | sticker
  "mediaUrl": "https://cdn.example.com/bukti-pembayaran.jpg",
  "filename": "bukti-pembayaran.jpg", // opsional
  "text": "Bukti pembayaran pesanan #1234", // opsional → caption media
  "deviceId": "01j5…"                  // opsional
}`}
              />
            </div>

            <h3 className="mt-6 text-sm font-semibold text-fg">Body request — media via base64</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Gunakan untuk file yang tidak punya URL publik (mis. PDF hasil generate).
              <code className="font-mono">mimetype</code> wajib pada mode ini.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`{
  "to": "6281234567890",
  "mediaType": "document",
  "mediaBase64": "JVBERi0xLjQK…",       // data base64 (tanpa prefix "data:")
  "mimetype": "application/pdf",
  "filename": "invoice-1234.pdf",
  "text": "Invoice #1234 terlampir"
}`}
              />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/25">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                  Field
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <code className="font-mono text-accent-bright">to</code>{" "}
                    <span className="text-fg-faint">wajib</span>
                  </li>
                  <li>
                    <code className="font-mono text-accent-bright">text</code>{" "}
                    <span className="text-fg-faint">teks WAJIB · media: caption opsional</span>
                  </li>
                  <li>
                    <code className="font-mono text-accent-bright">mediaType</code>{" "}
                    <span className="text-fg-faint">image/video/audio/document/sticker</span>
                  </li>
                  <li>
                    <code className="font-mono text-accent-bright">mediaUrl</code>{" "}
                    <span className="text-fg-faint">atau mediaBase64+mimetype</span>
                  </li>
                  <li>
                    <code className="font-mono text-accent-bright">deviceId</code>{" "}
                    <span className="text-fg-faint">opsional</span>
                  </li>
                </ul>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/25">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                  Batasan
                </p>
                <ul className="mt-3 space-y-2 text-sm text-fg-muted">
                  <li>text ≤ 4.096 · caption media ≤ 1.024</li>
                  <li>mediaBase64 ≤ ~15 MB file</li>
                  <li>filename ≤ 255 karakter</li>
                  <li>to: 62… / 08… / 8…</li>
                  <li>60 request/menit/tenant</li>
                </ul>
              </div>
              <div className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/25">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                  Respons
                </p>
                <ul className="mt-3 space-y-2 text-sm text-fg-muted">
                  <li>200 sukses</li>
                  <li>401 key invalid</li>
                  <li>409 device belum siap</li>
                  <li>429 rate limit</li>
                </ul>
              </div>
            </div>

            <h3 className="mt-6 text-sm font-semibold text-fg">Contoh respons</h3>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`HTTP/1.1 200 OK

{
  "ok": true,
  "deviceId": "01j5…",
  "to": "6281234567890@c.us",
  "messageId": "3EB0F2A1…"
}`}
              />
            </div>

            <h3 className="mt-6 text-sm font-semibold text-fg">Contoh error</h3>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`// 401 — key salah / dicabut
{ "error": "API key tidak valid atau telah dicabut" }

// 409 — belum ada device ready
{ "error": "Belum ada device yang tersambung (status ready)" }

// 429 — melebihi batas
{ "error": "Terlalu banyak permintaan. Coba lagi dalam 12 detik." }`}
              />
            </div>

            <div className="mt-4">
              <Callout type="info" title="Tercatat di riwayat">
                <p>
                  Setiap pengiriman sukses maupun gagal dicatat otomatis dan bisa dilihat
                  di <strong>Dashboard → Riwayat Pesan</strong> bersama pesan masuk dari
                  webhook. Pesan media tercatat dengan tipe media dan caption/nama file.
                </p>
              </Callout>
            </div>
          </section>

          {/* GET /api/health */}
          <section>
            <Anchor id="status-layanan">GET /api/health — Status layanan</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Cek ketersediaan layanan tanpa autentikasi. Berguna untuk monitoring uptime.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`{
  "ok": true,
  "hasUrl": true,
  "host": "ep-silent-block-azloxik2-pooler…",
  "userCount": 2
}`}
              />
            </div>
          </section>

          {/* Webhook */}
          <section>
            <Anchor id="webhook">Webhook — event realtime</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Wavio meneruskan <strong>pesan masuk</strong> dan perubahan{" "}
              <strong>status device</strong> ke URL endpoint milikmu. Konfigurasi di{" "}
              <strong>Dashboard → Webhook</strong>: isi URL, pilih event, lalu Wavio
              langsung meneruskan setiap event yang terjadi.
            </p>

            <h3 className="mt-6 text-sm font-semibold text-fg">Event yang didukung</h3>
            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              {[
                ["message.received", "Pesan masuk dari pelanggan (teks, media, dll.)"],
                ["session.status", "Perubahan status device: ready, disconnected, qr_ready, failed"],
              ].map(([ev, desc], i) => (
                <div
                  key={ev}
                  className={`flex items-start gap-4 px-4 py-3 transition-colors hover:bg-surface/60 ${
                    i > 0 ? "border-t border-line-soft" : ""
                  }`}
                >
                  <code className="w-44 shrink-0 font-mono text-accent-bright">{ev}</code>
                  <span className="text-sm text-fg-muted">{desc}</span>
                </div>
              ))}
            </div>

            <h3 className="mt-6 text-sm font-semibold text-fg">Payload (envelope Wavio)</h3>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`{
  "event": "message.received",
  "deviceId": "01j5…",
  "sessionId": "8f3c2b1a-…",
  "tenantId": "01j4…",
  "timestamp": 1722000000000,
  "data": {
    "id": "true_62812…_3EB0ABCD",
    "chatId": "6281234567890@c.us",
    "from": "6281234567890@c.us",
    "to": "6289876543210@c.us",
    "body": "Halo, pesanan saya sudah sampai?",
    "type": "text",
    "direction": "incoming",
    "timestamp": 1722000000
  }
}`}
              />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              Field <code className="font-mono">data</code> adalah payload asli dari
              gateway WhatsApp. Untuk <code className="font-mono">session.status</code>,{" "}
              <code className="font-mono">data.status</code> berisi status terbaru device.
            </p>

            <h3 className="mt-6 text-sm font-semibold text-fg">Verifikasi keaslian</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Setiap delivery ditandatangani HMAC-SHA256 atas{" "}
              <strong>raw body</strong> memakai secret dari dashboard. Cek header{" "}
              <code className="font-mono">x-wavio-signature</code> (format{" "}
              <code className="font-mono">sha256=&lt;hex&gt;</code>) — tolak request tanpa
              signature yang valid.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`# Header yang dikirim Wavio ke endpoint-mu:
POST /webhooks/wavio HTTP/1.1
Content-Type: application/json
x-wavio-signature: sha256=2f9c8a1b…
x-wavio-event: message.received
User-Agent: Wavio-Webhook/1.0`}
              />
            </div>

            <div className="mt-4">
              <Callout type="warning" title="Balas 2xx secepatnya">
                <p>
                  Balas status 2xx setelah menerima event. Wavio mencoba mengirim sekali;
                  kegagalan dicatat di log layanan. Contoh verifikasi signature ada di{" "}
                  <strong>Panduan Integrasi</strong>.
                </p>
              </Callout>
            </div>
          </section>

          {/* Rate limit */}
          <section>
            <Anchor id="rate-limit">Rate limit</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              API publik dibatasi <strong>60 request per menit</strong> per tenant untuk
              mencegah penyalahgunaan. Respons 429 menyertakan header{" "}
              <code className="font-mono">Retry-After</code> (detik) — baca header ini dan
              tunggu sebelum mencoba lagi.
            </p>
          </section>

          {/* Kode status */}
          <section>
            <Anchor id="kode-status">Kode status</Anchor>
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              {[
                ["200", "Sukses"],
                ["400", "Body tidak valid / nomor tidak valid"],
                ["401", "API key tidak valid atau dicabut"],
                ["404", "deviceId tidak ditemukan"],
                ["409", "Belum ada device ready / device tidak siap"],
                ["429", "Melebihi rate limit"],
                ["500", "Kesalahan server"],
                ["502", "Gateway WhatsApp (OpenWA) error"],
              ].map(([code, desc], i) => (
                <div
                  key={code}
                  className={`flex items-center gap-4 px-4 py-2.5 text-sm transition-all duration-200 hover:translate-x-0.5 hover:bg-surface/60 ${
                    i > 0 ? "border-t border-line-soft" : ""
                  }`}
                >
                  <code className="bk-tabular w-12 shrink-0 font-mono text-accent-bright">
                    {code}
                  </code>
                  <span className="text-fg-muted">{desc}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* TOC kanan (scrollspy) */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <ApiToc />
          </div>
        </aside>
      </div>
    </div>
  );
}
