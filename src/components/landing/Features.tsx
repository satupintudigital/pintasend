import { Broadcast, ChatsCircle, Devices, PaperPlaneTilt } from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/Reveal";

const devices = [
  { name: "Toko Utama", phone: "62812…0001", online: true },
  { name: "Customer Service", phone: "62812…0002", online: true },
  { name: "Promo", phone: "62812…0003", online: false },
];

export function Features() {
  return (
    <section id="fitur" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Fitur</p>
        <h2 className="mt-3 max-w-[20ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          Semua yang kamu butuhkan untuk mengirim pesan.
        </h2>
      </Reveal>

      <div className="mt-12 grid gap-4 md:grid-cols-6">
        <Reveal className="md:col-span-4" delay={0}>
          <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-bright">
                <Devices size={20} />
              </span>
              <h3 className="text-lg font-semibold">Satu akun, banyak device</h3>
            </div>
            <p className="mt-3 max-w-[52ch] text-sm text-fg-muted">
              Hubungkan nomor toko, customer service, dan akun promo sekaligus. Kelola semuanya dari satu dashboard.
            </p>
            <div className="mt-6 space-y-2">
              {devices.map((d) => (
                <div key={d.name} className="flex items-center justify-between rounded-xl border border-line-soft bg-surface-2 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-fg">{d.name}</p>
                    <p className="font-mono text-xs text-fg-faint">{d.phone}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      d.online ? "bg-accent/10 text-accent-bright" : "bg-line text-fg-muted"
                    }`}
                  >
                    {d.online ? "Tersambung" : "Menunggu QR"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal className="md:col-span-2" delay={80}>
          <div className="flex h-full flex-col rounded-2xl border border-line bg-surface-2 p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-bright">
                <Broadcast size={20} />
              </span>
              <h3 className="text-lg font-semibold">Realtime webhook</h3>
            </div>
            <p className="mt-3 text-sm text-fg-muted">Pesan masuk dan status pengiriman diteruskan ke aplikasimu seketika.</p>
            <div className="mt-6 flex items-center gap-2.5">
              <span className="bk-live-dot h-2.5 w-2.5 rounded-full bg-accent-bright" />
              <span className="font-mono text-xs text-fg-faint">message.received</span>
            </div>
          </div>
        </Reveal>

        <Reveal className="md:col-span-3" delay={0}>
          <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-bright">
                <PaperPlaneTilt size={20} />
              </span>
              <h3 className="text-lg font-semibold">Kirim lewat REST API</h3>
            </div>
            <pre className="mt-5 overflow-x-auto rounded-xl border border-line-soft bg-ink p-4 font-mono text-xs leading-relaxed text-fg">
              <code>{`POST /v1/messages
{ "to": "62812…", "text": "Halo" }

→ 201 { "messageId": "9f2c…" }`}</code>
            </pre>
          </div>
        </Reveal>

        <Reveal className="md:col-span-3" delay={80}>
          <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent-bright">
                <ChatsCircle size={20} />
              </span>
              <h3 className="text-lg font-semibold">Inbox dua arah</h3>
            </div>
            <div className="mt-5 space-y-3">
              <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-line-soft bg-surface-2 px-4 py-2.5 text-sm text-fg">
                Apakah stok masih ada?
              </div>
              <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-accent px-4 py-2.5 text-sm text-accent-ink">
                Masih, kak. Mau berapa pcs?
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
