import { Lightning, PaperPlaneTilt, QrCode } from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/Reveal";

const steps = [
  {
    icon: QrCode,
    title: "Hubungkan",
    desc: "Scan QR dari dashboard untuk menyambungkan nomor WhatsApp bisnismu.",
  },
  {
    icon: PaperPlaneTilt,
    title: "Kirim",
    desc: "Panggil API atau kirim langsung dari inbox untuk menjangkau pelanggan.",
  },
  {
    icon: Lightning,
    title: "Otomatiskan",
    desc: "Pasang webhook agar setiap pesan masuk memicu alur di aplikasimu.",
  },
];

export function HowItWorks() {
  return (
    <section id="cara-kerja" className="border-y border-line-soft bg-surface/40">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <Reveal>
          <h2 className="max-w-[22ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            Tiga langkah sampai pesan pertamamu terkirim.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 80}>
              <div className="relative border-t border-line pt-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-accent-bright">
                  <s.icon size={22} />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-fg-muted">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
