import { Callout, CodeBlock, EndpointTable } from "@/components/docs/primitives";

const endpoints = [
  { method: "POST" as const, path: "/v1/messages", desc: "Kirim pesan teks WhatsApp" },
  { method: "GET" as const, path: "/api/health", desc: "Status layanan (publik)" },
];

export default function DocsApi() {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
        Referensi API
      </p>
      <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        Endpoint API
      </h1>

      <div className="mt-8 space-y-12">
        {/* Base URL */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">Base URL</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Semua endpoint publik diakses melalui:
          </p>
          <div className="mt-3">
            <CodeBlock lang="text" code="https://wavio.satupintudigital.co.id" />
          </div>
        </section>

        {/* Auth */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">Autentikasi</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Kirim API key-mu pada header <code className="font-mono text-accent-bright">Authorization</code>{" "}
            dengan skema <code className="font-mono">Bearer</code>. Buat key di{" "}
            <strong>Dashboard → API Key</strong>. Key hanya ditampilkan sekali saat dibuat.
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
                Key setara dengan password. Jangan commit ke repository, kirim lewat chat, atau
                ekspos di kode frontend. Jika bocor, cabut di dashboard dan buat key baru.
              </p>
            </Callout>
          </div>
        </section>

        {/* Daftar endpoint */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">Daftar Endpoint</h2>
          <div className="mt-4">
            <EndpointTable endpoints={endpoints} />
          </div>
          <p className="mt-3 text-xs text-fg-faint">
            Endpoint tambahan (webhook, riwayat pesan, media) sedang dalam pengembangan.
          </p>
        </section>

        {/* POST /v1/messages */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            POST /v1/messages — Kirim pesan
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Mengirim pesan teks dari device yang tersambung ke satu nomor WhatsApp.
            Otomatis memakai device dengan status <code className="font-mono">ready</code>;
            berikan <code className="font-mono">deviceId</code> untuk memilih device tertentu.
          </p>

          <h3 className="mt-6 text-sm font-semibold text-fg">Body request</h3>
          <div className="mt-3">
            <CodeBlock
              lang="json"
              code={`{
  "to": "6281234567890",
  "text": "Pesanan #1234 sudah dikirim 🎉",
  "deviceId": "01j…"   // opsional
}`}
            />
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">Field</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><code className="font-mono text-accent-bright">to</code> <span className="text-fg-faint">wajib</span></li>
                <li><code className="font-mono text-accent-bright">text</code> <span className="text-fg-faint">wajib</span></li>
                <li><code className="font-mono text-accent-bright">deviceId</code> <span className="text-fg-faint">opsional</span></li>
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">Batasan</p>
              <ul className="mt-3 space-y-2 text-sm text-fg-muted">
                <li>text ≤ 4.096 karakter</li>
                <li>to: 62… / 08… / 8…</li>
                <li>60 request/menit/tenant</li>
              </ul>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">Respons</p>
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
        </section>

        {/* GET /api/health */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">
            GET /api/health — Status layanan
          </h2>
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

        {/* Rate limit & error */}
        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">Rate limit</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            API publik dibatasi <strong>60 request per menit</strong> per tenant untuk mencegah
            penyalahgunaan. Respons 429 menyertakan header{" "}
            <code className="font-mono">Retry-After</code> (detik).
          </p>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">Kode status</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-line">
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
                className={`flex items-center gap-4 px-4 py-2.5 text-sm ${i > 0 ? "border-t border-line-soft" : ""}`}
              >
                <code className="w-12 shrink-0 font-mono text-accent-bright">{code}</code>
                <span className="text-fg-muted">{desc}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
