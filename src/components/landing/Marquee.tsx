import { Sparkle } from "@phosphor-icons/react/ssr";

const items = [
  "Notifikasi transaksi",
  "Customer service",
  "Broadcast promo",
  "Webhook realtime",
  "Integrasi toko online",
  "Multi-device",
  "API key aman",
  "Isolasi per nomor",
];

function Row() {
  return (
    <div className="flex shrink-0 items-center">
      {items.map((item) => (
        <span key={item} className="flex items-center">
          <span className="px-6 font-mono text-xs uppercase tracking-[0.18em] text-fg-faint">
            {item}
          </span>
          <Sparkle size={12} className="text-accent/60" />
        </span>
      ))}
    </div>
  );
}

export function Marquee() {
  return (
    <section
      aria-hidden
      className="bk-marquee relative overflow-hidden border-y border-line-soft bg-surface/40 py-4"
    >
      {/* Fade tepi kiri/kanan */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-ink to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-ink to-transparent" />

      <div className="bk-marquee-track">
        <Row />
        <Row />
      </div>
    </section>
  );
}
