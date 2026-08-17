import { ArrowRight } from "@phosphor-icons/react/ssr";

function CodeCard() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-1 shadow-[0_30px_80px_-30px_rgba(16,185,129,0.25)]">
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-mono text-xs text-fg-faint">kirim-notifikasi.sh</span>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-fg">
        <code>{`curl -X POST https://api.wavio.id/v1/messages \\
  -H "Authorization: Bearer $WAVIO_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"device":"62812xxxxxxx","to":"6281234567890",
       "text":"Pesanan #1234 sudah dikirim"}'

# 201 Created
{ "messageId": "9f2c8a1b7e", "status": "sent" }`}</code>
      </pre>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-24%] h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-accent/10 blur-[130px]" />
      </div>

      <div className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-16 md:grid-cols-2 md:items-center md:pb-28 md:pt-20">
        <div>
          <p className="bk-enter font-mono text-xs uppercase tracking-[0.2em] text-accent-bright" style={{ animationDelay: "0ms" }}>
            WhatsApp API Gateway
          </p>
          <h1 className="bk-enter mt-5 text-4xl font-semibold leading-[1.06] tracking-tight md:text-6xl" style={{ animationDelay: "80ms" }}>
            Kirim pesan WhatsApp, semudah memanggil API.
          </h1>
          <p className="bk-enter mt-6 max-w-[46ch] text-lg leading-relaxed text-fg-muted" style={{ animationDelay: "160ms" }}>
            Sambungkan nomor bisnismu, kirim notifikasi transaksi, dan balas pelanggan langsung dari dashboard atau API.
          </p>
          <div className="bk-enter mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "240ms" }}>
            <a
              href="#harga"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink transition-transform hover:scale-[1.03] active:scale-[0.98]"
            >
              Mulai Sekarang
              <ArrowRight size={16} weight="bold" />
            </a>
            <a
              href="#api"
              className="inline-flex items-center gap-2 rounded-full border border-line px-6 py-3 text-sm font-medium text-fg-muted transition-colors hover:border-accent hover:text-fg"
            >
              Lihat API
            </a>
          </div>
        </div>

        <div className="bk-enter" style={{ animationDelay: "200ms" }}>
          <CodeCard />
        </div>
      </div>
    </section>
  );
}
