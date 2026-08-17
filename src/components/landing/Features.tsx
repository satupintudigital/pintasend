import {
  ChatsCircle,
  Devices,
  PaperPlaneTilt,
  WebhooksLogo,
} from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/Reveal";
import { Spotlight } from "@/components/Spotlight";
import { Tokens, type Token } from "@/components/landing/Code";

const apiTokens: Token[] = [
  ["k", "POST"],
  ["plain", " "],
  ["s", "/v1/messages"],
  ["plain", "\n"],
  ["p", "{ "],
  ["k", '"to"'],
  ["p", ": "],
  ["s", '"62812…"'],
  ["p", ", "],
  ["k", '"text"'],
  ["p", ": "],
  ["s", '"Halo"'],
  ["p", " }"],
  ["plain", "\n\n"],
  ["c", "→ 201"],
  ["plain", " { "],
  ["k", '"messageId"'],
  ["p", ": "],
  ["s", '"9f2c…"'],
  ["p", " }"],
];

const devices = [
  { name: "Toko Utama", phone: "62812…0001", online: true },
  { name: "Customer Service", phone: "62812…0002", online: true },
  { name: "Promo", phone: "62812…0003", online: false },
];

const events = [
  { event: "message.received", time: "baru saja", live: true },
  { event: "delivery.sent", time: "2 dtk lalu", live: false },
  { event: "message.read", time: "14 dtk lalu", live: false },
];

function CardTitle({
  icon: Icon,
  title,
}: {
  icon: React.ElementType;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent-bright">
        <Icon size={20} />
      </span>
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
  );
}

export function Features() {
  return (
    <section id="fitur" className="relative mx-auto max-w-7xl overflow-hidden px-5 py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute right-[-10%] top-[-20%] h-[420px] w-[420px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Fitur</p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <h2 className="max-w-[24ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Semua yang kamu butuhkan untuk mengirim pesan.
          </h2>
          <p className="max-w-[34ch] text-sm leading-relaxed text-fg-faint md:text-right">
            Tanpa perangkat tambahan, tanpa antrean persetujuan — langsung terhubung ke nomor bisnismu.
          </p>
        </div>
      </Reveal>

      <div className="mt-14 grid gap-4 md:grid-cols-6">
        {/* Satu akun, banyak device */}
        <Reveal className="md:col-span-4" delay={0}>
          <Spotlight className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition-colors duration-300 hover:border-accent/30">
            <CardTitle icon={Devices} title="Satu akun, banyak device" />
            <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-fg-muted">
              Hubungkan nomor toko, customer service, dan akun promo sekaligus. Kelola semuanya dari satu dashboard.
            </p>
            <div className="mt-6 space-y-2">
              {devices.map((d) => (
                <div
                  key={d.name}
                  className="flex items-center justify-between rounded-xl border border-line-soft bg-ink-2 px-4 py-3 transition-colors hover:border-line"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        d.online ? "bg-accent-bright" : "bg-fg-faint/50"
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-fg">{d.name}</p>
                      <p className="font-mono text-xs text-fg-faint">{d.phone}</p>
                    </div>
                  </div>
                  <span className={`text-xs ${d.online ? "text-accent-bright" : "text-fg-faint"}`}>
                    {d.online ? "Tersambung" : "Menunggu QR"}
                  </span>
                </div>
              ))}
            </div>
          </Spotlight>
        </Reveal>

        {/* Realtime webhook */}
        <Reveal className="md:col-span-2" delay={80}>
          <Spotlight className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition-colors duration-300 hover:border-accent/30">
            <CardTitle icon={WebhooksLogo} title="Realtime webhook" />
            <p className="mt-3 text-sm leading-relaxed text-fg-muted">
              Pesan masuk dan status pengiriman diteruskan ke aplikasimu seketika.
            </p>
            <div className="mt-6 flex-1 space-y-2.5">
              {events.map((e) => (
                <div
                  key={e.event}
                  className="flex items-center justify-between rounded-lg border border-line-soft bg-ink-2 px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 font-mono text-xs text-fg">
                    {e.live && <span className="bk-live-dot h-1.5 w-1.5 rounded-full bg-accent-bright" />}
                    {e.event}
                  </span>
                  <span className="text-[10px] text-fg-faint">{e.time}</span>
                </div>
              ))}
            </div>
          </Spotlight>
        </Reveal>

        {/* Kirim lewat REST API */}
        <Reveal className="md:col-span-3" delay={0}>
          <Spotlight className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition-colors duration-300 hover:border-accent/30">
            <CardTitle icon={PaperPlaneTilt} title="Kirim lewat REST API" />
            <pre className="mt-5 flex-1 overflow-x-auto rounded-xl border border-line-soft bg-ink-2 p-4 font-mono text-xs leading-relaxed">
              <code>
                <Tokens tokens={apiTokens} />
              </code>
            </pre>
          </Spotlight>
        </Reveal>

        {/* Inbox dua arah */}
        <Reveal className="md:col-span-3" delay={80}>
          <Spotlight className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6 transition-colors duration-300 hover:border-accent/30">
            <CardTitle icon={ChatsCircle} title="Inbox dua arah" />
            <div className="mt-5 flex-1 space-y-3">
              <div>
                <p className="mb-1 flex items-center gap-2 px-1 text-[10px] text-fg-faint">
                  <span className="font-semibold text-fg-muted">Pelanggan</span> · 09:41
                </p>
                <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-line-soft bg-ink-2 px-4 py-2.5 text-sm text-fg">
                  Apakah stok masih ada?
                </div>
              </div>
              <div>
                <p className="mb-1 flex items-center justify-end gap-2 px-1 text-[10px] text-fg-faint">
                  <span className="font-semibold text-accent-bright">Kamu</span> · 09:42
                </p>
                <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-accent px-4 py-2.5 text-sm text-accent-ink">
                  Masih, kak. Mau berapa pcs?
                </div>
              </div>
              <div className="flex items-center gap-2 px-1 pt-1">
                <span className="bk-live-dot h-1.5 w-1.5 rounded-full bg-accent-bright" />
                <span className="text-[10px] text-fg-faint">Balasan otomatis aktif</span>
              </div>
            </div>
          </Spotlight>
        </Reveal>
      </div>
    </section>
  );
}
