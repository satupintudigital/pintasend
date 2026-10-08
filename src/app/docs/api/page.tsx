import type { Metadata } from "next";
import { Anchor, Callout, CodeBlock, EndpointTable } from "@/components/docs/primitives";
import { ApiToc } from "@/components/docs/ApiToc";

export const metadata: Metadata = {
  title: "Referensi API — PintaSend",
  description:
    "Referensi lengkap endpoint API PintaSend: base URL, autentikasi Bearer, POST /v1/messages, rate limit, dan daftar kode status.",
};

const endpoints = [
  { method: "POST" as const, path: "/v1/messages", desc: "Kirim pesan teks & media WhatsApp (dukung @mention & reply)" },
  { method: "POST" as const, path: "/v1/messages/location", desc: "Kirim pesan lokasi (koordinat + deskripsi)" },
  { method: "POST" as const, path: "/v1/messages/contact", desc: "Kirim kartu kontak (nama + nomor)" },
  { method: "POST" as const, path: "/v1/messages/poll", desc: "Kirim poll WhatsApp (2–12 pilihan)" },
  { method: "POST" as const, path: "/v1/messages/react", desc: "Beri / hapus reaksi emoji pada pesan" },
  { method: "POST" as const, path: "/v1/messages/send-bulk", desc: "Broadcast ke banyak penerima (async batch, kuota per penerima)" },
  { method: "GET" as const, path: "/v1/messages/batch/:batchId", desc: "Status batch broadcast (progress & hasil)" },
  { method: "GET" as const, path: "/v1/messages/:chatId/history", desc: "Baca riwayat chat langsung dari WhatsApp" },
  { method: "POST" as const, path: "/v1/messages/send-template", desc: "Kirim template pesan yang disimpan (dengan variabel)" },
  { method: "POST" as const, path: "/v1/contacts/:number/block", desc: "Blokir kontak (moderasi spam)" },
  { method: "DELETE" as const, path: "/v1/contacts/:number/block", desc: "Buka blokir kontak" },
  { method: "POST" as const, path: "/v1/chats/read", desc: "Tandai chat/pesan dibaca (read receipts)" },
  { method: "GET" as const, path: "/v1/contacts/check/:number", desc: "Cek apakah nomor terdaftar di WhatsApp" },
  { method: "GET" as const, path: "/v1/groups", desc: "Daftar grup WhatsApp pada device" },
  { method: "GET" as const, path: "/v1/addons/remove-watermark", desc: "Status addon Hapus Watermark (footnote iklan)" },
  { method: "POST" as const, path: "/v1/addons/remove-watermark", desc: "Aktifkan / nonaktifkan sendiri addon Hapus Watermark" },
  { method: "POST" as const, path: "/v1/retention-requests", desc: "Ajukan perpanjangan retensi pesan (menunggu persetujuan platform)" },
  { method: "GET" as const, path: "/v1/retention-requests", desc: "Retensi efektif + riwayat permintaan perpanjangan" },
  { method: "GET" as const, path: "/v1/contacts", desc: "Daftar kontak audiens campaign (modul Campaign)" },
  { method: "POST" as const, path: "/v1/contacts", desc: "Tambah/sunting kontak tunggal atau impor massal CSV" },
  { method: "PATCH" as const, path: "/v1/contacts/:id", desc: "Sunting kontak (nama, tag, opt-out, catatan)" },
  { method: "DELETE" as const, path: "/v1/contacts/:id", desc: "Hapus kontak audiens" },
  { method: "GET" as const, path: "/v1/campaigns", desc: "Daftar campaign + statistik (modul Campaign)" },
  { method: "POST" as const, path: "/v1/campaigns", desc: "Buat draft campaign blast (template + audiens + jadwal)" },
  { method: "GET" as const, path: "/v1/campaigns/:id", desc: "Detail campaign + progress per penerima" },
  { method: "POST" as const, path: "/v1/campaigns/:id/start", desc: "Mulai / lanjutkan campaign (draft/paused)" },
  { method: "POST" as const, path: "/v1/campaigns/:id/pause", desc: "Jeda campaign yang berjalan" },
  { method: "POST" as const, path: "/v1/campaigns/:id/cancel", desc: "Batalkan campaign (sisa pending di-skip)" },
  { method: "GET" as const, path: "/api/health", desc: "Status layanan (publik)" },
  { method: "GET" as const, path: "/api/public/catalog", desc: "Katalog paket & addon (publik, tanpa auth) — dipakai halaman Pricing" },
  { method: "POST" as const, path: "/api/auth/register", desc: "Registrasi publik (Turnstile) — buat tenant + owner baru" },
  { method: "POST" as const, path: "/api/billing/orders", desc: "Buat order pembayaran (aktivasi, top-up, addon, renewal)" },
  { method: "GET" as const, path: "/api/billing/orders/:id", desc: "Detail order + status pembayaran (untuk polling)" },
  { method: "GET" as const, path: "/api/billing/my", desc: "Status langganan & saldo tenant (session)" },
  { method: "POST" as const, path: "/api/billing/sync", desc: "Sinkronkan periode langganan & mirror D1" },
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
              <CodeBlock lang="text" code="https://pintasend.satupintudigital.co.id" />
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
                code={`Authorization: Bearer pintasend_2f9c8a1b4d7e0a3c5b8f1d2e4a6c7b9d`}
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

          {/* Peran & akses (dashboard) */}
          <section>
            <Anchor id="peran-dan-akses">Peran &amp; Akses</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Dokumen ini adalah referensi API publik <code>v1</code> (dipakai
              integrasi via API key). Selain itu PintaSend punya antarmuka dashboard
              dengan hierarki peran — guard terpusat di{" "}
              <code className="font-mono text-accent-bright">src/lib/abac.ts</code>:
            </p>
            <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-ink-2">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line-soft text-xs uppercase tracking-wider text-fg-faint">
                    <th className="px-4 py-2.5">Peran</th>
                    <th className="px-4 py-2.5">Cakupan</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["member", "Kirim pesan / kelola device & kontak tenant sendiri."],
                    ["tenant_admin", "Semua akses member + kelola member tenant (undang, ganti role, reset password, hapus), API key, dan webhook tenant."],
                    ["owner", "Akses penuh tenant: termasuk mengubah owner-invariant member (satu owner per tenant)."],
                    ["platform_admin", "Operator platform: kelola tenant & plan, addon, audit log, global settings, broadcast lintas-tenant, dan invoice bulanan."],
                  ].map(([role, desc]) => (
                    <tr key={role} className="border-b border-line-soft/60 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-accent-bright">
                        {role}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-fg-muted">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-fg-muted">
              Jalur operator platform berada di <code>/platform/*</code> (dashboard
              platform_admin): audit log + export CSV, pengaturan global (termasuk
              footnote watermark), broadcast pengumuman ke pemilik perangkat, dan
              registri invoice bulanan. Jalur ini tidak memakai API key — hanya sesi
              login platform_admin.
            </p>
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
                code={`curl -X POST https://pintasend.satupintudigital.co.id/v1/messages \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
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
  "messageId": "3EB0F2A1…",
  "watermark": true
}`}
              />
            </div>

            <div className="mt-4">
              <Callout type="info" title="Footnote iklan (watermark)">
                <p>
                  Setiap pesan keluar otomatis disisipkan{" "}
                  <strong>footnote iklan platform</strong> di akhir teks/caption
                  (kecuali media <code className="font-mono">sticker</code> yang tidak
                  mendukung caption). Respons sukses menyertakan{" "}
                  <code className="font-mono">&quot;watermark&quot;: true</code> saat footnote
                  aktif. Footnote <strong>dihapus</strong> bila tenant memiliki{" "}
                  <strong>addon Hapus Watermark</strong> (diatur platform admin) —
                  respons saat itu tidak menyertakan field{" "}
                  <code className="font-mono">watermark</code>. Status ini juga{" "}
                  <strong>dicatat di riwayat pesan</strong> (badge{" "}
                  <code className="font-mono">watermark</code> di Dashboard →
                  Riwayat Pesan) agar terlihat pesan mana yang memuat footnote.
                </p>
              </Callout>
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
                code={`curl -X POST https://pintasend.satupintudigital.co.id/v1/messages \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -H "Idempotency-Key: order-12345" \\\\
  -d '{"to":"6281234567890","text":"Pesanan #1234 sudah dikirim"}'`}
              />
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                Respons pertama disimpan <strong>24 jam</strong>. Request berikutnya dengan
                key yang sama + body yang sama mengembalikan respons asli (header{" "}
                <code className="font-mono">x-pintasend-idempotent-replay: true</code>){" "}
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

          {/* Self-service addon Hapus Watermark */}
          <section>
            <Anchor id="hapus-watermark">GET/POST /v1/addons/remove-watermark — Hapus Watermark (self-service)</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Kelola sendiri addon <strong>Hapus Watermark</strong> tanpa perlu
              menghubungi admin. Saat aktif, footnote iklan platform{" "}
              <strong>tidak</strong> disisipkan ke pesan keluar tenant (lihat{" "}
              <a href="#kirim-pesan" className="text-accent-bright underline decoration-accent/30 underline-offset-2">
                POST /v1/messages
              </a>
              ).
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`# Status addon saat ini
curl -X GET "https://pintasend.satupintudigital.co.id/v1/addons/remove-watermark" \\\\
  -H "Authorization: Bearer $PINTSEND_KEY"

# Aktifkan (hapus watermark dari pesan keluar)
curl -X POST "https://pintasend.satupintudigital.co.id/v1/addons/remove-watermark" \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"active": true}'

# Nonaktifkan (footnote kembali aktif)
curl -X POST "https://pintasend.satupintudigital.co.id/v1/addons/remove-watermark" \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"active": false}'`}
              />
            </div>
            <h3 className="mt-6 text-sm font-semibold text-fg">Contoh respons</h3>
            <div className="mt-3">
              <CodeBlock
                lang="json"
                code={`HTTP/1.1 200 OK

{
  "ok": true,
  "addon": "remove_watermark",
  "active": true,
  "watermark": false
}`}
              />
            </div>
            <p className="mt-3 text-sm text-fg-muted">
              <code className="font-mono">active: true</code> → addon aktif, pesan
              keluar <strong>tanpa</strong> footnote ({" "}
              <code className="font-mono">watermark: false</code>).{" "}
              <code className="font-mono">active: false</code> → footnote kembali
              disisipkan. Operasi bersifat idempoten — memanggil dengan nilai yang
              sama tidak menimbulkan efek ganda.
            </p>
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
                code={`curl -X GET "https://pintasend.satupintudigital.co.id/v1/contacts/check/6281234567890" \\\\
  -H "Authorization: Bearer $PINTSEND_KEY"`}
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
                code={`curl -X GET "https://pintasend.satupintudigital.co.id/v1/groups" \\\\
  -H "Authorization: Bearer $PINTSEND_KEY"

# pilih device & paginasi
curl -X GET "https://pintasend.satupintudigital.co.id/v1/groups?deviceId=01j5…&limit=20&offset=0" \\\\
  -H "Authorization: Bearer $PINTSEND_KEY"`}
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
                code={`curl -X POST https://pintasend.satupintudigital.co.id/v1/messages/send-template \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"to":"6281234567890","templateName":"pesanan_baru","vars":{"orderId":"1234"}}'`}
              />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              <code className="font-mono">vars</code> opsional bila template tidak punya
              placeholder. Kirim template menghitung kuota pesan bulanan (1 pesan) dan
              tercatat di riwayat dengan tipe <code className="font-mono">template</code>.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              <strong>Watermark footnote</strong> juga berlaku di jalur template: template
              standar menyimpan placeholder{" "}
              <code className="font-mono">{"{{watermark}}"}</code> di akhir footer, dan PintaSend
              otomatis mengisinya dengan footnote iklan platform (dipisah baris baru) —
              atau string kosong bila tenant punya addon{" "}
              <code className="font-mono">remove_watermark</code>. Respons sukses menyertakan{" "}
              <code className="font-mono">{"\"watermark\": true"}</code> saat footnote disisipkan;
              statusnya juga tercatat di riwayat (kolom watermark). Jangan mengisi{" "}
              <code className="font-mono">vars.watermark</code> sendiri — nilai Anda akan
              ditimpa oleh keputusan watermark platform.
            </p>
          </section>

          {/* Pesan kaya: location/contact/poll */}
          <section>
            <Anchor id="pesan-kaya">Pesan kaya — lokasi, kontak, poll</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Tiga jenis pesan khusus selain teks &amp; media:{" "}
              <strong>lokasi</strong>, <strong>kartu kontak</strong>, dan{" "}
              <strong>poll WhatsApp</strong>. Masing-masing endpoint sendiri dengan
              skema field khusus; semua memakai device{" "}
              <code className="font-mono">ready</code> (atau{" "}
              <code className="font-mono">deviceId</code> eksplisit) dan menghitung
              kuota pesan bulanan (1 pesan per kirim).
            </p>

            <h3 className="mt-6 text-sm font-semibold text-fg">Location</h3>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://pintasend.satupintudigital.co.id/v1/messages/location \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"to":"6281234567890","latitude":-6.2088,"longitude":106.8456,"description":"Toko kami","address":"Jl. Sudirman 1"}'`}
              />
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                <code className="font-mono">latitude</code> /{" "}
                <code className="font-mono">longitude</code> — wajib, angka desimal
                (lintang −90…90, bujur −180…180).
              </li>
              <li>
                <code className="font-mono">description</code> /{" "}
                <code className="font-mono">address</code> — opsional (maks 1.024
                karakter), <code className="font-mono">replyTo</code> juga didukung.
              </li>
            </ul>

            <h3 className="mt-6 text-sm font-semibold text-fg">Contact (kartu kontak)</h3>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://pintasend.satupintudigital.co.id/v1/messages/contact \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"to":"6281234567890","contactName":"CS NalaNiaga","contactNumber":"628111222333"}'`}
              />
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                <code className="font-mono">contactName</code> — wajib, maks 255
                karakter.
              </li>
              <li>
                <code className="font-mono">contactNumber</code> — wajib, maks 30
                karakter.
              </li>
            </ul>

            <h3 className="mt-6 text-sm font-semibold text-fg">Poll</h3>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://pintasend.satupintudigital.co.id/v1/messages/poll \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"to":"120363024123456789@g.us","name":"Pilih menu hari ini?","options":["Nasi Goreng","Mie Ayam","Sate"],"allowMultipleAnswers":false}'`}
              />
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                <code className="font-mono">name</code> — pertanyaan poll, wajib, maks
                255 karakter.
              </li>
              <li>
                <code className="font-mono">options</code> — wajib, 2–12 pilihan, tiap
                pilihan maks 100 karakter.
              </li>
              <li>
                <code className="font-mono">allowMultipleAnswers</code> — opsional
                (default <code className="font-mono">false</code> = pilihan tunggal).
              </li>
            </ul>
          </section>

          {/* Reaksi emoji */}
          <section>
            <Anchor id="reaksi">POST /v1/messages/react — Reaksi emoji</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Memberi <strong>reaksi emoji</strong> pada pesan. Kirim{" "}
              <code className="font-mono">emoji</code> kosong ({""}
              <code className="font-mono">{"\"\""}</code>) untuk <strong>menghapus</strong>{" "}
              reaksi. <code className="font-mono">messageId</code> adalah id pesan dari
              webhook atau respons kirim. Reaksi <strong>tidak</strong> menghitung kuota
              pesan bulanan.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://pintasend.satupintudigital.co.id/v1/messages/react \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"chatId":"6281234567890","messageId":"3EB0F2A1…","emoji":"👍"}'`}
              />
            </div>
          </section>

          {/* Send-bulk */}
          <section>
            <Anchor id="kirim-bulk">POST /v1/messages/send-bulk — Broadcast</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Mengirim pesan ke <strong>banyak penerima</strong> sekaligus. Batch diproses{" "}
              <strong>asinkron</strong> oleh gateway (respons 200 = batch diterima, bukan
              terkirim) dengan jeda antar pesan agar aman dari deteksi spam.{" "}
              <strong>Kuota bulanan dihitung per penerima</strong> — kirim ke 100 nomor =
              100 pesan kuota.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://pintasend.satupintudigital.co.id/v1/messages/send-bulk \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{
  "messages": [
    {"to":"6281234567890","type":"text","content":{"text":"Halo {nama}, pesanan Anda sudah dikirim"},"variables":{"nama":"Budi"}},
    {"to":"6281199998888","type":"text","content":{"text":"Halo {nama}, pesanan Anda sudah dikirim"},"variables":{"nama":"Sari"}}
  ],
  "delayBetweenMessages": 3000,
  "randomizeDelay": true,
  "stopOnError": false
}'`}
              />
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                <code className="font-mono">messages</code> — wajib, 1–100 item. Tiap
                item: <code className="font-mono">to</code> (nomor/JID),{" "}
                <code className="font-mono">type</code> ({" "}
                <code className="font-mono">text|image|video|audio|document</code>),{" "}
                <code className="font-mono">content</code> (sesuai tipe; untuk text ={" "}
                <code className="font-mono">{"{\"text\":…}"}</code>), dan{" "}
                <code className="font-mono">variables</code> opsional untuk substitusi
                <code className="font-mono">{"{{placeholder}}"}</code>.
              </li>
              <li>
                <code className="font-mono">delayBetweenMessages</code> — 1000–60000 ms
                (default 3000). <code className="font-mono">randomizeDelay</code> (default
                true) menambah 0–2 dtk acak; <code className="font-mono">stopOnError</code>{" "}
                (default false) menghentikan batch saat ada error.
              </li>
              <li>
                Respons sukses menyertakan{" "}
                <code className="font-mono">batchId</code> — lacak progres via{" "}
                <code className="font-mono">GET /v1/messages/batch/:batchId</code>.
              </li>
            </ul>

            <h3 className="mt-6 text-sm font-semibold text-fg">Status batch</h3>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X GET "https://pintasend.satupintudigital.co.id/v1/messages/batch/batch-1" \\\\
  -H "Authorization: Bearer $PINTSEND_KEY"`}
              />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              Respons: <code className="font-mono">{"{\"batch\": {\"batchId\", \"status\", \"progress\", \"results\"}}"}</code>
              — <code className="font-mono">status</code> berubah dari{" "}
              <code className="font-mono">processing</code> →{" "}
              <code className="font-mono">completed</code> /{" "}
              <code className="font-mono">failed</code> /{" "}
              <code className="font-mono">cancelled</code>.
            </p>
          </section>

          {/* Modul Campaign */}
          <section>
            <Anchor id="modul-campaign">Modul Campaign — Blast Massal Bertahap</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Campaign adalah broadcast skala besar (ratusan–ribuan penerima) yang
              dieksekusi <strong>bertahap oleh dispatcher</strong> dengan jeda acak
              antar pesan. Berbeda dengan <code className="font-mono">send-bulk</code>{" "}
              (satu batch ≤100), campaign menyimpan audiens sebagai kontak dan
              menghormati <strong>opt-out</strong>. Fitur berbayar — butuh addon{" "}
              <code className="font-mono">campaign</code>.
            </p>

            <h3 className="mt-6 text-sm font-semibold text-fg">1. Kelola kontak</h3>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`# Impor massal dari CSV (kolom: nomor, nama, tags)
curl -X POST https://pintasend.satupintudigital.co.id/v1/contacts \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  --data-binary '{"csv":"nomor,nama,tags\\\\n081234567890,Budi,vip;pelanggan"}'

# Daftar kontak (filter q, tag, optedOut + pagination)
curl -X GET "https://pintasend.satupintudigital.co.id/v1/contacts?tag=vip&page=1" \\\\
  -H "Authorization: Bearer $PINTSEND_KEY"`}
              />
            </div>

            <h3 className="mt-6 text-sm font-semibold text-fg">2. Buat & jalankan campaign</h3>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://pintasend.satupintudigital.co.id/v1/campaigns \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{
  "name": "Promo Agustus",
  "messageBody": "Hai {{nama}}! Promo spesial untukmu hari ini.",
  "audienceTag": "vip",
  "mediaType": "image",
  "mediaUrl": "https://cdn.example.com/promo.jpg",
  "minDelaySec": 5,
  "maxDelaySec": 15,
  "scheduledAt": "2026-08-22T09:00:00+07:00"
}'

# Mulai (draft → running/scheduled), jeda, lanjutkan, atau batalkan
curl -X POST https://pintasend.satupintudigital.co.id/v1/campaigns/<id>/start \\\\
  -H "Authorization: Bearer $PINTSEND_KEY"`}
              />
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                Variabel template: <code className="font-mono">{"{{nama}}"}</code>,{" "}
                <code className="font-mono">{"{{nomor}}"}</code>,{" "}
                <code className="font-mono">{"{{tanggal}}"}</code> — token tanpa nilai
                dibiarkan apa adanya.
              </li>
              <li>
                Dispatcher mengirim batch kecil per menit dengan jeda acak{" "}
                <code className="font-mono">[minDelaySec..maxDelaySec]</code>; ada cap
                harian per device & auto-pause bila device dibatasi WhatsApp.
              </li>
              <li>
                Kuota bulanan dihitung <strong>per penerima</strong>; kuota habis di
                tengah jalan → sisa penerima berstatus <code className="font-mono">skipped</code>.
              </li>
              <li>
                Selesai → event webhook{" "}
                <code className="font-mono">campaign.completed</code> dikirim ke URL
                webhook tenant (subscribe via Dashboard → Webhook).
              </li>
            </ul>
          </section>

          {/* Baca riwayat chat */}
          <section>
            <Anchor id="baca-riwayat">GET /v1/messages/:chatId/history — Baca riwayat chat</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Membaca <strong>riwayat pesan</strong> sebuah chat dari penyimpanan
              gateway — berguna untuk mengambil pesan yang tiba sebelum device
              terhubung atau menyinkronkan percakapan penuh.{" "}
              <code className="font-mono">chatId</code> di path bisa nomor atau JID
              (URL-encoded: <code className="font-mono">62812…%40c.us</code>).
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X GET "https://pintasend.satupintudigital.co.id/v1/messages/6281234567890/history?limit=50&offset=0" \\\\
  -H "Authorization: Bearer $PINTSEND_KEY"`}
              />
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                <code className="font-mono">limit</code> — 1–100 (default 50);{" "}
                <code className="font-mono">offset</code> — lompati N pesan pertama
                (paginasi).
              </li>
              <li>
                Ini operasi <strong>baca</strong> — tidak menghitung kuota pesan.
              </li>
            </ul>
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
curl -X POST "https://pintasend.satupintudigital.co.id/v1/contacts/6281234567890/block" \\\\
  -H "Authorization: Bearer $PINTSEND_KEY"

# Buka blokir
curl -X DELETE "https://pintasend.satupintudigital.co.id/v1/contacts/6281234567890/block" \\\\
  -H "Authorization: Bearer $PINTSEND_KEY"`}
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
                code={`curl -X POST https://pintasend.satupintudigital.co.id/v1/chats/read \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
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
              PintaSend meneruskan <strong>pesan masuk</strong>, perubahan{" "}
              <strong>status device</strong>, dan <strong>status kirim pesan keluar</strong>{" "}
              ke URL endpoint milikmu. Konfigurasi di{" "}
              <strong>Dashboard → Webhook</strong>: isi URL, pilih event, lalu PintaSend
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

            <h3 className="mt-6 text-sm font-semibold text-fg">Payload (envelope PintaSend)</h3>
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
              <code className="font-mono">x-pintasend-signature</code> (format{" "}
              <code className="font-mono">sha256=&lt;hex&gt;</code>) — tolak request tanpa
              signature yang valid.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`# Header yang dikirim PintaSend ke endpoint-mu:
POST /webhooks/pintasend HTTP/1.1
Content-Type: application/json
x-pintasend-signature: sha256=2f9c8a1b…
x-pintasend-event: message.received
User-Agent: PintaSend-Webhook/1.0`}
              />
            </div>

            <div className="mt-4">
              <Callout type="warning" title="Balas 2xx secepatnya">
                <p>
                  Balas status 2xx setelah menerima event. Kalau endpoint-mu tidak
              merespons dalam <strong>5 detik</strong>, PintaSend mencoba ulang secara{" "}
                  <strong>otomatis</strong>: +30 detik, lalu +5 menit (maksimal 3
                  percobaan). Setelah itu event masuk <em>dead-letter</em> — hubungi
                  dukungan jika ini sering terjadi. Contoh verifikasi signature ada di{" "}
                  <strong>Panduan Integrasi</strong>.
                </p>
              </Callout>
            </div>
          </section>

          {/* Permintaan perpanjangan retensi */}
          <section>
            <Anchor id="retensi-pesan">POST /v1/retention-requests — Perpanjangan retensi</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Secara default, pesan dan log pengiriman disimpan maksimal{" "}
              <strong>30 hari</strong> (sesuai kebijakan retensi PintaSend). Jika bisnismu
              membutuhkan penyimpanan lebih lama (mis. karena kewajiban arsip atau
              kontrak layanan), ajukan permintaan melalui endpoint ini — permintaan
              tercatat sebagai <strong>instruksi tertulis</strong> dan menunggu
              persetujuan platform sebelum diterapkan.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://pintasend.satupintudigital.co.id/v1/retention-requests \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
  -H "Content-Type: application/json" \\\\
  -d '{"reason":"Arsip layanan pelanggan 6 bulan sesuai kontrak No. 123","retentionDays":180}'`}
              />
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                <code className="font-mono">reason</code> — wajib; instruksi
                tertulis/alasan perpanjangan (maks 1.000 karakter).
              </li>
              <li>
                <code className="font-mono">retentionDays</code> — wajib; angka{" "}
                <strong>30–365</strong>.
              </li>
              <li>
                Hanya <strong>satu permintaan pending</strong> per tenant — ajukan lagi
                setelah permintaan sebelumnya diproses (409 bila masih ada yang
                menunggu).
              </li>
            </ul>
            <h3 className="mt-6 text-sm font-semibold text-fg">Cek status</h3>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X GET https://pintasend.satupintudigital.co.id/v1/retention-requests \\\\
  -H "Authorization: Bearer $PINTSEND_KEY"`}
              />
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              Respons:{" "}
              <code className="font-mono">{"{\"retentionDays\", \"defaultRetentionDays\", \"requests\": [{\"status\": \"pending|approved|rejected\"}]}"}</code>
              — <code className="font-mono">retentionDays</code> adalah nilai yang
              berlaku saat ini (berubah hanya setelah permintaan disetujui platform).
            </p>
          </section>

          {/* Self-serve billing */}
          <section>
            <Anchor id="self-serve-billing">Self-serve billing — registrasi &amp; pembayaran</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Alur jual paket mandiri (tanpa intervensi admin platform): registrasi
              publik → checkout → bayar via Tripay → tenant aktif. Endpoint publik &
              billing di bawah memakai session login (kecuali dicatat publik).
            </p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
              <li>
                <strong>GET /api/public/catalog</strong> (publik) — katalog paket
                (kind <code className="font-mono">subscription</code> |{" "}
                <code className="font-mono">prepaid</code>) dan addon, harga dari{" "}
                <code className="font-mono">PlatformSetting</code>. Dipakai halaman landing Pricing.
              </li>
              <li>
                <strong>POST /api/auth/register</strong> — buat tenant baru (status{" "}
                <code className="font-mono">pending</code>) + user owner + saldo awal. Wajib token Turnstile.
                Login/API key ditolak sampai order pertama lunas (aktivasi).
              </li>
              <li>
                <strong>POST /api/billing/orders</strong> — buat order: aktivasi paket
                bulanan (Latte/Mocha), <em>top-up Espresso</em> (top-up pertama = aktivasi
                prepaid), addon berbayar, atau renewal. Respons menyertakan{" "}
                <code className="font-mono">checkoutUrl</code> /{" "}
                <code className="font-mono">payCode</code> Tripay.
              </li>
              <li>
                <strong>GET /api/billing/orders/:id</strong> — status order untuk polling;
                setelah lunas tenant otomatis aktif / saldo bertambah.
              </li>
              <li>
                <strong>GET /api/billing/my</strong> — ringkasan langganan tenant:
                plan aktif, <code className="font-mono">planPeriodEnd</code>, saldo pesan
                prepaid, dan order terakhir.
              </li>
              <li>
                <strong>POST /api/billing/sync</strong> — sinkronkan periode langganan
                (renewal lazy saat periode habis) dan mirror D1{" "}
                (<code className="font-mono">activatedAt</code>).
              </li>
            </ul>
            <h3 className="mt-6 text-sm font-semibold text-fg">Webhook pembayaran</h3>
            <p className="mt-2 text-sm text-fg-muted">
              Tripay mengirim callback ke <code className="font-mono">POST /api/billing/tripay/callback</code>{" "}
              (divalidasi HMAC, idempoten; didaftarkan di dashboard Tripay). Tenang —
              endpoint ini internal, bukan untuk dipanggil manual.
            </p>
          </section>

          {/* X-Request-Id */}
          <section>
            <Anchor id="x-request-id">X-Request-Id — tracing</Anchor>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">
              Setiap respons menyertakan header{" "}
              <code className="font-mono">X-Request-Id</code> untuk korelasi. Kirim
              header ini dari sisi-mu (opsional) agar request bisa dilacak lintas
              layanan; jika tidak dikirim, PintaSend membuatkan UUID v7. Sertakan id ini
              saat menghubungi dukungan agar request-mu bisa ditemukan di log internal.
            </p>
            <div className="mt-3">
              <CodeBlock
                lang="bash"
                code={`curl -X POST https://pintasend.satupintudigital.co.id/v1/messages \\\\
  -H "Authorization: Bearer $PINTSEND_KEY" \\\\
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
