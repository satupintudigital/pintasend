import { ArrowRight, CheckCircle, Radio } from "@phosphor-icons/react/ssr";
import { Tokens, type Token } from "@/components/landing/Code";

const stats = [
  { value: "99,97%", label: "uptime rata-rata" },
  { value: "2,4 jt+", label: "pesan terkirim / bulan" },
  { value: "< 300 ms", label: "latensi pengiriman" },
];

const codeTokens: Token[] = [
  ["k", "curl"],
  ["plain", " "],
  ["f", "-X POST"],
  ["plain", " "],
  ["s", "https://api.wavio.id/v1/messages"],
  ["plain", " \\\n  "],
  ["f", "-H"],
  ["plain", " "],
  ["s", '"Authorization: Bearer $WAVIO_KEY"'],
  ["plain", " \\\n  "],
  ["f", "-H"],
  ["plain", " "],
  ["s", '"Content-Type: application/json"'],
  ["plain", " \\\n  "],
  ["f", "-d"],
  ["plain", " "],
  ["s", '{"device":"62812xxxxxxx","to":"6281234567890",'],
  ["plain", "\n       "],
  ["s", '"text":"Pesanan #1234 sudah dikirim"'],
  ["plain", "}"],
  ["plain", "\n\n"],
  ["c", "# 201 Created"],
  ["plain", "\n"],
  ["p", "{ "],
  ["k", '"messageId"'],
  ["p", ": "],
  ["s", '"9f2c8a1b7e"'],
  ["p", ", "],
  ["k", '"status"'],
  ["p", ": "],
  ["s", '"sent"'],
  ["p", " }"],
];

function CodeCard() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-accent/10 blur-3xl"
      />
      <div className="overflow-hidden rounded-2xl border border-line bg-ink-2/90 shadow-[0_40px_100px_-40px_rgba(16,185,129,0.35)] backdrop-blur">
        <div className="flex items-center gap-2 border-b border-line-soft bg-surface/70 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-2 font-mono text-xs text-fg-faint">kirim-notifikasi.sh</span>
          <span className="ml-auto rounded-md border border-accent/25 bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-medium text-accent-bright">
            201 Created
          </span>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed">
          <code>
            <Tokens tokens={codeTokens} />
          </code>
        </pre>
      </div>

      {/* Floating toast: pesan terkirim */}
      <div className="bk-toast absolute -right-3 top-14 hidden items-center gap-2.5 rounded-xl border border-line bg-surface-2/95 px-3.5 py-2.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur sm:flex">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent-bright">
          <CheckCircle size={15} weight="fill" />
        </span>
        <div>
          <p className="text-xs font-semibold text-fg">Pesan terkirim</p>
          <p className="font-mono text-[10px] text-fg-faint">#1234 → 62812…7890</p>
        </div>
      </div>

      {/* Floating toast: webhook event */}
      <div
        className="bk-toast absolute -left-4 bottom-10 hidden items-center gap-2.5 rounded-xl border border-line bg-surface-2/95 px-3.5 py-2.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur sm:flex"
        style={{ animationDelay: "3.2s" }}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent-bright">
          <Radio size={15} />
        </span>
        <div>
          <p className="text-xs font-semibold text-fg">Webhook diterima</p>
          <p className="font-mono text-[10px] text-fg-faint">message.received</p>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-70" />
        <div className="absolute left-1/2 top-[-32%] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-accent/10 blur-[150px]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
      </div>

      <div className="mx-auto grid max-w-7xl gap-14 px-5 pb-16 pt-14 md:grid-cols-[1.05fr_0.95fr] md:items-center md:pb-24 md:pt-20">
        <div>
          <p
            className="bk-enter inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/5 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent-bright"
            style={{ animationDelay: "0ms" }}
          >
            <span className="bk-live-dot h-1.5 w-1.5 rounded-full bg-accent-bright" />
            WhatsApp API Gateway
          </p>

          <h1
            className="bk-enter mt-6 font-display text-5xl font-semibold leading-[1.02] tracking-tight md:text-[4.3rem]"
            style={{ animationDelay: "80ms" }}
          >
            Kirim pesan WhatsApp, semudah memanggil API.
          </h1>

          <p
            className="bk-enter mt-6 max-w-[52ch] text-lg leading-relaxed text-fg-muted"
            style={{ animationDelay: "160ms" }}
          >
            Sambungkan nomor bisnismu, kirim notifikasi transaksi, dan balas pelanggan
            langsung dari dashboard — atau satu baris kode.
          </p>

          <div
            className="bk-enter mt-8 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "240ms" }}
          >
            <a
              href="#harga"
              className="group inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-[0_0_32px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright hover:shadow-[0_0_44px_-8px_rgba(52,211,153,0.8)] active:scale-[0.98]"
            >
              Mulai Sekarang
              <ArrowRight
                size={16}
                weight="bold"
                className="transition-transform group-hover:translate-x-0.5"
              />
            </a>
            <a
              href="#api"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/50 px-6 py-3 text-sm font-medium text-fg-muted transition-colors hover:border-accent/50 hover:text-fg"
            >
              Lihat API
            </a>
          </div>

          <div
            className="bk-enter mt-12 flex flex-wrap items-center gap-x-10 gap-y-6"
            style={{ animationDelay: "320ms" }}
          >
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col">
                <span className="bk-tabular font-display text-2xl font-semibold tracking-tight text-fg">
                  {s.value}
                </span>
                <span className="mt-0.5 text-xs text-fg-faint">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bk-enter" style={{ animationDelay: "200ms" }}>
          <CodeCard />
        </div>
      </div>
    </section>
  );
}
