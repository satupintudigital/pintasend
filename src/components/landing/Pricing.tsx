import { CheckCircle } from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/Reveal";

const plans = [
  {
    name: "Espresso",
    tagline: "Bayar sesuai pakai",
    price: "Rp 400",
    unit: "/pesan",
    features: ["Tanpa biaya bulanan", "Semua fitur inti", "Cocok untuk trial dan toko kecil"],
    highlight: false,
    cta: "Mulai dengan Espresso",
  },
  {
    name: "Latte",
    tagline: "Paling laris",
    price: "Rp 150.000",
    unit: "/bulan",
    features: ["500 pesan per bulan", "Overage Rp 300 per pesan", "Sekitar 125 order transaksional", "Dashboard dan inbox lengkap"],
    highlight: true,
    cta: "Pilih Latte",
  },
  {
    name: "Mocha",
    tagline: "Unlimited",
    price: "Rp 300.000",
    unit: "/bulan",
    features: ["Tanpa batas pesan", "Prioritas support", "Cocok untuk toko ramai"],
    highlight: false,
    cta: "Pilih Mocha",
  },
];

export function Pricing() {
  return (
    <section id="harga" className="border-t border-line-soft bg-surface/40">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <Reveal>
          <div className="text-center">
            <h2 className="mx-auto max-w-[22ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
              Harga sederhana, tanpa hitungan rumit.
            </h2>
            <p className="mx-auto mt-4 max-w-[52ch] text-fg-muted">
              Biaya aktivasi Rp 350.000 sekali, berlaku untuk semua paket. Naik atau turun kelas kapan saja.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid items-stretch gap-4 md:grid-cols-3">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 80}>
              <div
                className={`flex h-full flex-col rounded-2xl border p-6 ${
                  p.highlight ? "border-accent/50 bg-surface" : "border-line bg-surface"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  {p.highlight && (
                    <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink">{p.tagline}</span>
                  )}
                </div>
                {!p.highlight && <p className="text-sm text-fg-faint">{p.tagline}</p>}

                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">{p.price}</span>
                  <span className="text-sm text-fg-faint">{p.unit}</span>
                </div>

                <ul className="mt-6 flex-1 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-fg-muted">
                      <CheckCircle size={18} className="mt-0.5 shrink-0 text-accent-bright" weight="fill" />
                      {f}
                    </li>
                  ))}
                </ul>

                <a
                  href="#mulai"
                  className={`mt-8 rounded-full px-5 py-3 text-center text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-[0.98] ${
                    p.highlight ? "bg-accent text-accent-ink" : "border border-line text-fg hover:border-accent"
                  }`}
                >
                  {p.cta}
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
