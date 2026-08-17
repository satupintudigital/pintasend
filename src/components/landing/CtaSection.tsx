import { ArrowRight } from "@phosphor-icons/react/ssr";
import { Reveal } from "@/components/Reveal";

export function CtaSection() {
  return (
    <section id="mulai" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <Reveal>
        <div className="relative overflow-hidden rounded-2xl border border-accent/25 bg-surface px-6 py-16 text-center md:py-20">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-1/2 h-[300px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[100px]" />
          </div>
          <h2 className="mx-auto max-w-[22ch] text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            Siap mengirim pesan pertamamu?
          </h2>
          <p className="mx-auto mt-4 max-w-[48ch] text-fg-muted">
            Sambungkan nomor WhatsApp dan kirim notifikasi dalam hitungan menit, tanpa menunggu persetujuan apa pun.
          </p>
          <a
            href="#harga"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-accent-ink transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Mulai Sekarang
            <ArrowRight size={16} weight="bold" />
          </a>
        </div>
      </Reveal>
    </section>
  );
}
