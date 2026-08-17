import { Reveal } from "@/components/Reveal";

const endpoints = [
  { method: "POST", path: "/v1/messages", desc: "Kirim pesan teks atau media" },
  { method: "GET", path: "/v1/devices", desc: "Daftar device yang tersambung" },
  { method: "GET", path: "/v1/messages", desc: "Riwayat pesan masuk dan keluar" },
  { method: "POST", path: "/v1/webhooks", desc: "Daftarkan webhook untuk event realtime" },
];

export function ApiSection() {
  return (
    <section id="api" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <div className="grid gap-12 md:grid-cols-2 md:items-center">
        <Reveal>
          <h2 className="max-w-[20ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Satu API yang rapi untuk semua integrasi.
          </h2>
          <p className="mt-4 max-w-[52ch] text-fg-muted">
            Autentikasi pakai API key, isolasi per device, dan dokumentasi yang jelas. Integrasikan dengan toko online, CRM, atau sistem internal apa pun.
          </p>
          <ul className="mt-8 space-y-1">
            {endpoints.map((e) => (
              <li key={e.method + e.path} className="flex items-center gap-3 border-b border-line-soft py-3 last:border-b-0">
                <span className="w-14 shrink-0 rounded-lg bg-surface-2 px-2 py-1 text-center font-mono text-[11px] font-semibold text-accent-bright">
                  {e.method}
                </span>
                <code className="font-mono text-sm text-fg">{e.path}</code>
                <span className="ml-auto hidden text-sm text-fg-faint sm:block">{e.desc}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={100}>
          <div className="rounded-2xl border border-line bg-surface p-1">
            <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
              <span className="font-mono text-xs text-fg-faint">webhook event masuk</span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-fg">
              <code>{`{
  "event": "message.received",
  "device": "62812xxxxxxx",
  "from": "6281234567890",
  "text": "Apakah stok masih ada?",
  "at": "2026-08-17T09:41:00Z"
}`}</code>
            </pre>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
