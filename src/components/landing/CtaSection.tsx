import { ArrowRight } from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/Reveal";
import { AmbientParallax } from "@/components/AmbientParallax";

export function CtaSection() {
  return (
    <section id="mulai" className="mx-auto max-w-7xl px-5 py-24 md:py-32">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-accent/25 bg-surface px-6 py-20 text-center md:py-24">
          {/* Latar: grid + aurora + beam (grid & aurora parallax; beam statis) */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <AmbientParallax className="h-full">
              <div
                data-parallax="0.12"
                className="absolute inset-0 bg-grid bg-grid-fade opacity-40 will-change-transform"
              />
              <div
                data-parallax="0.28"
                className="absolute left-1/2 top-1/2 h-[340px] w-[560px] -ml-[280px] -mt-[170px] rounded-full bg-accent/15 blur-[110px] will-change-transform"
              />
            </AmbientParallax>
            <div className="bk-beam absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-transparent via-accent/10 to-transparent" />
          </div>

          <div className="relative">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent-bright">
              Mulai dalam hitungan menit
            </p>
            <h2 className="mx-auto mt-4 max-w-[22ch] font-display text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
              Siap mengirim pesan pertamamu?
            </h2>
            <p className="mx-auto mt-5 max-w-[48ch] leading-relaxed text-fg-muted">
              Sambungkan nomor WhatsApp dan kirim notifikasi dalam hitungan menit,
              tanpa menunggu persetujuan apa pun.
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#harga"
                className="bk-shimmer group inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-accent-ink shadow-[0_0_36px_-10px_rgba(16,185,129,0.9)] transition-all hover:bg-accent-bright hover:shadow-[0_0_48px_-8px_rgba(52,211,153,0.8)] active:scale-[0.98]"
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
                className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-2/60 px-7 py-3.5 text-sm font-medium text-fg-muted transition-colors hover:border-accent/50 hover:text-fg"
              >
                Baca dokumentasi API
              </a>
            </div>

            <p className="mt-6 text-xs text-fg-faint">
              Tanpa kartu kredit · Setup kurang dari 5 menit
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
