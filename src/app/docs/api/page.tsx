import type { Metadata } from "next";
import { Anchor, Callout, CodeBlock, EndpointTable } from "@/components/docs/primitives";
import { ApiToc } from "@/components/docs/ApiToc";

export const metadata: Metadata = {
  title: "Referensi API — Wavio",
  description:
    "Referensi lengkap endpoint API Wavio: base URL, autentikasi Bearer, POST /v1/messages, rate limit, dan daftar kode status.",
};

const endpoints = [
  { method: "POST" as const, path: "/v1/messages", desc: "Kirim pesan teks & media WhatsApp (dukung @mention & reply)" },
  { method: "POST" as const, path: "/v1/messages/send-template", desc: "Kirim template pesan yang disimpan (dengan variabel)" },
  { method: "POST" as const, path: "/v1/contacts/:number/block", desc: "Blokir kontak (moderasi spam)" },
  { method: "DELETE" as const, path: "/v1/contacts/:number/block", desc: "Buka blokir kontak" },
  { method: "POST" as const, path: "/v1/chats/read", desc: "Tandai chat/pesan dibaca (read receipts)" },
  { method: "GET" as const, path: "/v1/contacts/check/:number", desc: "Cek apakah nomor terdaftar di WhatsApp" },
  { method: "GET" as const, path: "/v1/groups", desc: "Daftar grup WhatsApp pada device" },
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

            <h3 className="mt-6 text-sm font-semibold text-fg">Upload file — multipart/form-data</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Untuk file besar (hingga <strong>25 MB</strong>) kirim sebagai{" "}
              <code className="font-mono">multipart/form-data</code> dengan field{" "}
              <code className="font-mono">to</code>, <code className="font-mono">mediaType</code>,{" "}
              <code className="font-mono">text</code> (caption opsional), dan file pada field{" "}
              <code className="font-mono">file</code>. File disimpan di penyimpanan objek R2
              dan dicatat di riwayat pesan.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://wavio.satupintudigital.co.id/v1/messages \\\\
  -H "Authorization: Bearer $WAVIO_KEY" \\\\
  -F "to=6281234567890" \\\\
  -F "mediaType=document" \\\\
  -F "text=Invoice #1234 terlampir" \\\\
  -F "file=@invoice-1234.pdf;type=application/pdf"`}
              />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              Respons sukses menyertakan{" "}
              <code className="font-mono">&quot;stored&quot;: &quot;r2&quot;</code> saat file disimpan ke R2.
            </p>

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
                    <code className="font-mono text-accent-bright">mentions</code>{" "}
                    <span className="text-fg-faint">opsional — @mention di grup</span>
                  </li>
                  <li>
                    <code className="font-mono text-accent-bright">replyTo</code>{" "}
                    <span className="text-fg-faint">opsional — balasan ke pesan</span>
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
                  <li>mediaBase64 ≤ ~15 MB · multipart ≤ 25 MB</li>
                  <li>filename ≤ 255 karakter</li>
                  <li>to: 62… / 08… / 8…</li>
                  <li>60 request/menit/API key</li>
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
                  Status pesan keluar otomatis maju{" "}
                  <code className="font-mono">sent → delivered → read</code> (atau{" "}
                  <code className="font-mono">failed</code>) mengikuti ack dari WhatsApp,
                  dan tampil sebagai badge di riwayat.
                </p>
              </Callout>
            </div>

            <h3 className="mt-8 text-sm font-semibold text-fg">Mention (@) &amp; balasan (reply)</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Untuk <strong>grup WhatsApp</strong> ({" "}
              <code className="font-mono">to</code> berakhiran{" "}
              <code className="font-mono">@g.us</code>), kamu bisa{" "}
              <strong>@mention</strong> peserta dan mengirim sebagai{" "}
              <strong>balasan</strong> ke pesan sebelumnya.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`{
  "to": "120363024123456789@g.us",
  "text": "@6281234567890 silakan cek pesanan baru",
  "mentions": ["6281234567890", "081234567890"],  // nomor yang di-@
  "replyTo": "true_62812…_3EB0ABCD",              // opsional: id pesan yang dibalas
  "deviceId": "01j5…"                              // opsional
}`}
              />
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                <code className="font-mono">mentions</code> — array nomor (format{" "}
                <code className="font-mono">62812…</code> /{" "}
                <code className="font-mono">0812…</code>) yang ditandai. Teks harap memuat{" "}
                <code className="font-mono">@&lt;nomor&gt;</code> yang sesuai. Maksimal 50.
              </li>
              <li>
                <code className="font-mono">replyTo</code> — id pesan (dari webhook atau respons kirim)
                agar pesan menjadi balasan kontekstual. Berfungsi juga untuk media.
              </li>
              <li>
                Kirim ke nomor individu juga bisa memakai{" "}
                <code className="font-mono">replyTo</code>; mention hanya bermakna di grup.
              </li>
            </ul>

            <h3 className="mt-8 text-sm font-semibold text-fg">Idempotency — cegah pesan duplikat</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Kirim header{" "}
              <code className="font-mono text-accent-bright">Idempotency-Key</code> agar
              retry (mis. timeout jaringan) tidak mengirim pesan dua kali. Key harus{" "}
              <strong>8–128 karakter</strong> (huruf, angka, <code className="font-mono">._-</code>),
              unik per operasi — contoh: <code className="font-mono">order-12345</code>.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://wavio.satupintudigital.co.id/v1/messages \\\\
  -H "Authorization: Bearer $WAVIO_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -H "Idempotency-Key: order-12345" \\\\
  -d '{"to":"6281234567890","text":"Pesanan #1234 sudah dikirim"}'`}
              />
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                Respons pertama disimpan <strong>24 jam</strong>. Request berikutnya dengan
                key yang sama + body yang sama mengembalikan respons asli (header{" "}
                <code className="font-mono">x-wavio-idempotent-replay: true</code>){" "}
                <strong>tanpa mengirim ulang</strong> dan tanpa menghabiskan kuota.
              </li>
              <li>
                Key yang sama dengan <strong>payload berbeda</strong> ditolak (400) — jangan
                pakai ulang key untuk operasi yang berbeda.
              </li>
              <li>
                Kirim yang <strong>gagal</strong> (mis. 502 dari gateway) tidak direkam —
                retry dengan key yang sama akan mencoba kirim ulang dengan benar.
              </li>
              <li>
                Header ini opsional; tanpa key, setiap request dianggap operasi baru.
              </li>
            </ul>
          </section>

          {/* Random delay */}
          <section>
            <Anchor id="random-delay">Random delay (anti-spam)</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Fitur <strong>random delay</strong> menunda pengiriman pesan keluar
              secara acak <strong>3–10 detik</strong> sebelum pesan benar-benar
              dikirim — mengurangi risiko deteksi spam oleh Meta/WhatsApp.
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                Termasuk <strong>gratis</strong> di plan <strong>Mocha</strong>{" "}
                (plan tertinggi); plan lain mendapatkannya via{" "}
                <strong>addon Random Delay</strong> (diatur platform admin).
              </li>
              <li>
                Request <code className="font-mono">POST /v1/messages</code> bersifat
                sinkron: menunggu delay, lalu mengirim. Respons sukses menyertakan{" "}
                <code className="font-mono">delayMs</code> (delay aktual dalam
                milidetik).
              </li>
              <li>
                Setiap pesan keluar mencatat <strong>waktu trigger</strong> dan{" "}
                <strong>waktu kirim</strong> — selisihnya adalah delay aktual yang
                disematkan. Keduanya tampil di{" "}
                <strong>Dashboard → Riwayat Pesan</strong> (chip{" "}
                <code className="font-mono">delay X dtk</code>) untuk analitik
                kebiasaan kirim yang aman.
              </li>
            </ul>
          </section>

          {/* GET /v1/contacts/check/:number */}
          <section>
            <Anchor id="cek-nomor">GET /v1/contacts/check/:number — Cek nomor</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Memastikan sebuah nomor <strong>terdaftar di WhatsApp</strong> sebelum kamu mengirim
              pesan. Berguna karena <code className="font-mono">POST /v1/messages</code> tetap
              mengembalikan sukses meski nomor tidak ada di WhatsApp — endpoint ini satu-satunya
              cara memvalidasi nomor baru.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X GET "https://wavio.satupintudigital.co.id/v1/contacts/check/6281234567890" \\\\
  -H "Authorization: Bearer $WAVIO_KEY"`}
              />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              Nomor bisa dikirim dalam format <code className="font-mono">62812…</code>,{" "}
              <code className="font-mono">0812…</code>, atau <code className="font-mono">812…</code>.{" "}
              Pilih device tertentu dengan query{" "}
              <code className="font-mono">?deviceId=…</code>; tanpa itu, device{" "}
              <code className="font-mono">ready</code> pertama yang dipakai.
            </p>
            <h3 className="mt-6 text-sm font-semibold text-fg">Contoh respons</h3>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`HTTP/1.1 200 OK

{
  "ok": true,
  "deviceId": "01j5…",
  "number": "6281234567890",
  "exists": true,
  "whatsappId": "6281234567890@c.us"
}`}
              />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              Bila nomor tidak terdaftar,{" "}
              <code className="font-mono">exists</code> bernilai{" "}
              <code className="font-mono">false</code> dan{" "}
              <code className="font-mono">whatsappId</code> bernilai{" "}
              <code className="font-mono">null</code> — tetap HTTP 200 (bukan error).
            </p>
          </section>

          {/* GET /v1/groups */}
          <section>
            <Anchor id="daftar-grup">GET /v1/groups — Daftar grup</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Mengambil daftar grup WhatsApp tempat device menjadi anggota. Memakai{" "}
              device <code className="font-mono">ready</code>; berikan{" "}
              <code className="font-mono">deviceId</code> untuk memilih device tertentu.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X GET "https://wavio.satupintudigital.co.id/v1/groups" \\\\
  -H "Authorization: Bearer $WAVIO_KEY"

# pilih device & paginasi
curl -X GET "https://wavio.satupintudigital.co.id/v1/groups?deviceId=01j5…&limit=20&offset=0" \\\\
  -H "Authorization: Bearer $WAVIO_KEY"`}
              />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              Paginasi opsional: <code className="font-mono">limit</code> (1–1000, default{" "}
              1000) dan <code className="font-mono">offset</code> (default 0).
            </p>
            <h3 className="mt-6 text-sm font-semibold text-fg">Contoh respons</h3>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`HTTP/1.1 200 OK

{
  "ok": true,
  "deviceId": "01j5…",
  "count": 2,
  "groups": [
    {
      "id": "120363024…@g.us",
      "name": "Tim Engineering",
      "participantsCount": 42,
      "isAdmin": true,
      "linkedParentJID": null
    },
    {
      "id": "120363099…@g.us",
      "name": "Komunitas Pelanggan",
      "linkedParentJID": null
    }
  ]
}`}
              />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              <code className="font-mono">id</code> adalah JID grup (berakhiran{" "}
              <code className="font-mono">@g.us</code>) yang bisa langsung dipakai sebagai{" "}
              <code className="font-mono">to</code> di{" "}
              <code className="font-mono">POST /v1/messages</code>. Field{" "}
              <code className="font-mono">participantsCount</code> dan{" "}
              <code className="font-mono">isAdmin</code> opsional — hanya ada bila gateway
              melaporkannya.
            </p>
          </section>

          {/* POST /v1/messages/send-template */}
          <section>
            <Anchor id="kirim-template">POST /v1/messages/send-template — Kirim template</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Mengirim <strong>template pesan</strong> yang sudah disimpan di gateway
              (dikelola via Dashboard → Templates / provisioning). Variabel dalam template
              ({" "}
              <code className="font-mono">{"{{placeholder}}"}</code>) diisi dari{" "}
              <code className="font-mono">vars</code>.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://wavio.satupintudigital.co.id/v1/messages/send-template \\\\
  -H "Authorization: Bearer $WAVIO_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"to":"6281234567890","templateName":"pesanan_baru","vars":{"orderId":"1234"}}'`}
              />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              <code className="font-mono">vars</code> opsional bila template tidak punya
              placeholder. Kirim template menghitung kuota pesan bulanan (1 pesan) dan
              tercatat di riwayat dengan tipe <code className="font-mono">template</code>.
            </p>
          </section>

          {/* Block/unblock kontak */}
          <section>
            <Anchor id="blokir-kontak">Blokir / buka blokir kontak</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Memblokir nomor agar tidak bisa menghubungi device (moderasi spam).{" "}
              <code className="font-mono">POST</code> untuk blokir,{" "}
              <code className="font-mono">DELETE</code> untuk membuka blokir.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`# Blokir
curl -X POST "https://wavio.satupintudigital.co.id/v1/contacts/6281234567890/block" \\\\
  -H "Authorization: Bearer $WAVIO_KEY"

# Buka blokir
curl -X DELETE "https://wavio.satupintudigital.co.id/v1/contacts/6281234567890/block" \\\\
  -H "Authorization: Bearer $WAVIO_KEY"`}
              />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              Nomor bisa format <code className="font-mono">62812…</code> /{" "}
              <code className="font-mono">0812…</code> atau JID lengkap. Pilih device dengan{" "}
              <code className="font-mono">?deviceId=…</code>. Respons sukses:{" "}
              <code className="font-mono">{"{\"ok\":true,\"blocked\":true}"}</code>.
            </p>
          </section>

          {/* Mark read */}
          <section>
            <Anchor id="tandai-dibaca">POST /v1/chats/read — Tandai dibaca</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Menandai chat (atau pesan tertentu) sebagai <strong>dibaca</strong> —
              menghilangkan badge unread di perangkat.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://wavio.satupintudigital.co.id/v1/chats/read \\\\
  -H "Authorization: Bearer $WAVIO_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"chatId":"6281234567890","messageIds":["true_1_ABC","true_1_DEF"]}'`}
              />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              <code className="font-mono">messageIds</code> opsional (maks 100) — tanpa itu
              hanya pesan terbaru yang ditandai.{" "}
              <code className="font-mono">chatId</code> bisa nomor atau JID grup.
            </p>
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
  "userCount": 2
}`}
              />
            </div>
            <p className="mt-2 text-xs text-fg-faint">
              Endpoint publik — tidak menampilkan host database atau detail error internal.
            </p>
          </section>

          {/* Webhook */}
          <section>
            <Anchor id="webhook">Webhook — event realtime</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Wavio meneruskan <strong>pesan masuk</strong>, perubahan{" "}
              <strong>status device</strong>, dan <strong>status kirim pesan keluar</strong>{" "}
              ke URL endpoint milikmu. Konfigurasi di{" "}
              <strong>Dashboard → Webhook</strong>: isi URL, pilih event, lalu Wavio
              langsung meneruskan setiap event yang terjadi.
            </p>

            <h3 className="mt-6 text-sm font-semibold text-fg">Event yang didukung</h3>
            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              {[
                ["message.received", "Pesan masuk dari pelanggan (teks, media, dll.)"],
                ["session.status", "Perubahan status device: ready, disconnected, qr_ready, failed"],
                ["message.ack", "Status kirim pesan keluar: sent, delivered, read"],
                ["message.failed", "Pesan keluar gagal terkirim (status failed)"],
                ["message.edited", "Pesan diedit (masuk atau keluar) — isi/data terbaru"],
                ["message.reaction", "Reaksi emoji ditambahkan/dihapus pada sebuah pesan"],
                ["session.restriction", "Akun dibatasi WhatsApp: reachout_timelock / tos_block / proxy_block"],
                ["message.sent", "Pesan keluar berhasil terkirim dari device"],
                ["message.revoked", "Pesan dihapus/ditarik (unsend) oleh pengirim"],
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
              Untuk <code className="font-mono">message.edited</code>,{" "}
              <code className="font-mono">data</code> memuat isi pesan terbaru (skema sama
              dengan <code className="font-mono">message.received</code>). Untuk{" "}
              <code className="font-mono">message.ack</code> /{" "}
              <code className="font-mono">message.failed</code>,{" "}
              <code className="font-mono">data</code> memuat{" "}
              <code className="font-mono">messageId</code> dan{" "}
              <code className="font-mono">status</code> ({" "}
              <code className="font-mono">sent</code> |{" "}
              <code className="font-mono">delivered</code> |{" "}
              <code className="font-mono">read</code> |{" "}
              <code className="font-mono">failed</code>) — cocokkan{" "}
              <code className="font-mono">messageId</code> dengan respons{" "}
              <code className="font-mono">POST /v1/messages</code> untuk melacak status
              kirim.
            </p>

            <h3 className="mt-6 text-sm font-semibold text-fg">Smart filters (opsional)</h3>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Atur di <strong>Dashboard → Webhook</strong> untuk hanya menerima event{" "}
              <code className="font-mono">message.received</code> /{" "}
              <code className="font-mono">message.edited</code> yang cocok dengan kondisimu.
              Semua kondisi digabung dengan <strong>AND</strong>; filter kosong = semua event
              diteruskan. Event non-konten ({" "}
              <code className="font-mono">session.status</code>,{" "}
              <code className="font-mono">message.ack</code>,{" "}
              <code className="font-mono">message.failed</code>) selalu diteruskan.
            </p>
            <div className="mt-3 overflow-hidden rounded-xl border border-line">
              {[
                ["sender", "ID pengirim (di grup = author, bukan JID grup)", "is / isNot"],
                ["recipient", "ID penerima (to)", "is / isNot"],
                ["body", "Isi pesan / caption", "contains / equals"],
                ["type", "Tipe pesan: text, image, video, audio, document, sticker, …", "is / isNot"],
                ["isGroup", "Apakah pesan dari grup", "is (true/false)"],
                ["fromMe", "Apakah pesan dari nomormu sendiri", "is (true/false)"],
                ["hasMedia", "Apakah pesan membawa media", "is (true/false)"],
              ].map(([field, desc, ops], i) => (
                <div
                  key={field}
                  className={`flex items-start gap-4 px-4 py-2.5 text-sm transition-colors hover:bg-surface/60 ${
                    i > 0 ? "border-t border-line-soft" : ""
                  }`}
                >
                  <code className="w-24 shrink-0 font-mono text-accent-bright">{field}</code>
                  <span className="min-w-0 flex-1 text-fg-muted">{desc}</span>
                  <code className="shrink-0 font-mono text-fg-faint">{ops}</code>
                </div>
              ))}
            </div>

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
                  Balas status 2xx setelah menerima event. Kalau endpoint-mu tidak
                  merespons dalam <strong>5 detik</strong>, Wavio mencoba ulang secara{" "}
                  <strong>otomatis</strong>: +30 detik, lalu +5 menit (maksimal 3
                  percobaan). Setelah itu event masuk <em>dead-letter</em> — hubungi
                  dukungan jika ini sering terjadi. Contoh verifikasi signature ada di{" "}
                  <strong>Panduan Integrasi</strong>.
                </p>
              </Callout>
            </div>
          </section>

          {/* X-Request-Id */}
          <section>
            <Anchor id="x-request-id">X-Request-Id — tracing</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Setiap respons menyertakan header{" "}
              <code className="font-mono">X-Request-Id</code> untuk korelasi. Kirim
              header ini dari sisi-mu (opsional) agar request bisa dilacak lintas
              layanan; jika tidak dikirim, Wavio membuatkan UUID v7. Sertakan id ini
              saat menghubungi dukungan agar request-mu bisa ditemukan di log internal.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://wavio.satupintudigital.co.id/v1/messages \\\\
  -H "Authorization: Bearer $WAVIO_KEY" \\\\
  -H "X-Request-Id: order-12345-trace" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"to":"6281234567890","text":"Halo"}'`}
              />
            </div>
          </section>

          {/* Rate limit */}
          <section>
            <Anchor id="rate-limit">Rate limit</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              API publik dibatasi <strong>60 request per menit per API key</strong> untuk
              mencegah penyalahgunaan — satu key yang boros tidak memblokir key lain di
              tenant yang sama. Respons 429 menyertakan header{" "}
              <code className="font-mono">Retry-After</code> (detik) — baca header ini dan
              tunggu sebelum mencoba lagi.
            </p>
          </section>

          {/* Kode status */}
          <section>
            <Anchor id="kode-status">Kode status</Anchor>
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              {[
                ["200", "Sukses (atau replay idempotent)"],
                ["400", "Body tidak valid / nomor tidak valid / Idempotency-Key dipakai dengan payload beda"],
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
