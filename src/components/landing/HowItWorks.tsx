import { Lightning, PaperPlaneTilt, QrCode } from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/Reveal";

const steps = [
  {
    icon: QrCode,
    title: "Hubungkan",
    desc: "Scan QR dari dashboard untuk menyambungkan nomor WhatsApp bisnismu. Tidak butuh perangkat tambahan.",
  },
  {
    icon: PaperPlaneTilt,
    title: "Kirim",
    desc: "Panggil API atau kirim langsung dari inbox untuk menjangkau pelanggan dalam hitungan detik.",
  },
  {
    icon: Lightning,
    title: "Otomatiskan",
    desc: "Pasang webhook agar setiap pesan masuk memicu alur di aplikasimu.",
  },
];

export function HowItWorks() {
  return (
    <section id="cara-kerja" className="relative overflow-hidden border-y border-line-soft bg-surface/40">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-40%] h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-accent/5 blur-[130px]" />
      </div>

      <div className="mx-auto max-w-7xl px-5 py-24 md:py-32">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">Cara kerja</p>
          <h2 className="mt-3 max-w-[24ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Tiga langkah sampai pesan pertamamu terkirim.
          </h2>
        </Reveal>

        <div className="relative mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
          {/* Garis penghubung antar langkah */}
          <div
            aria-hidden
            className="absolute left-[22px] top-0 h-full w-px bg-gradient-to-b from-accent/40 via-line to-transparent md:bottom-auto md:left-0 md:right-0 md:top-[22px] md:h-px md:w-full md:bg-gradient-to-r md:from-transparent md:via-line md:to-transparent"
          />

          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 90}>
              <div className="relative flex gap-5 md:block">
                {/* Ikon — mobile: kolom kiri, desktop: baris atas */}
                <div className="relative z-10 flex w-11 shrink-0 items-center justify-center md:w-auto md:justify-start">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-ink text-accent-bright shadow-[0_0_24px_-8px_rgba(16,185,129,0.5)]">
                    <s.icon size={22} />
                  </span>
                </div>

                <div className="md:mt-6">
                  <span className="bk-tabular font-mono text-xs text-fg-faint md:absolute md:left-[60px] md:top-[13px]">
                    0{i + 1}
                  </span>
                  <h3 className="mt-1 font-display text-xl font-semibold tracking-tight md:mt-0">
                    {s.title}
                  </h3>
                  <p className="mt-2.5 max-w-[38ch] text-sm leading-relaxed text-fg-muted">
                    {s.desc}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
