import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-20 md:py-28">
      <Link
        href="/"
        className="inline-block py-2 font-mono text-xs uppercase tracking-[0.18em] text-accent-bright transition-colors hover:text-fg"
      >
        ← Kembali ke beranda
      </Link>
      <h1 className="mt-6 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        Syarat & Ketentuan
      </h1>
      <p className="mt-2 text-sm text-fg-faint">Terakhir diperbarui: Agustus 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-fg-muted">
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">Layanan</h2>
          <p className="mt-3">
            Wavio menyediakan API gateway dan dashboard untuk mengirim serta menerima pesan
            WhatsApp. Penggunaan layanan tunduk pada syarat ini, kebijakan privasi, dan kebijakan
            WhatsApp Business.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-fg">Penggunaan yang wajar</h2>
          <p className="mt-3">
            Dilarang menggunakan layanan untuk spam, phishing, penipuan, atau konten yang
            melanggar hukum Indonesia. Setiap pesan harus dikirim dengan persetujuan penerima.
            Pelanggaran dapat menyebabkan penangguhan akun tanpa pemberitahuan.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-fg">Tagihan & pembatalan</h2>
          <p className="mt-3">
            Paket bulanan ditagih di awal periode dan dapat dibatalkan kapan saja; layanan tetap
            aktif hingga akhir periode berjalan. Paket per-pesan (Espresso) ditagih sesuai
            pemakaian. Biaya aktivasi Rp 350.000 berlaku sekali dan tidak dapat dikembalikan.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-fg">Ketersediaan layanan</h2>
          <p className="mt-3">
            Kami berupaya menjaga ketersediaan layanan tetapi tidak menjamin bebas gangguan.
            Wavio tidak bertanggung jawab atas kerugian tidak langsung akibat keterlambatan atau
            kegagalan pengiriman pesan.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-fg">Kontak</h2>
          <p className="mt-3">
            Pertanyaan tentang syarat ini:{" "}
            <a href="mailto:halo@wavio.id" className="inline-block py-1 text-accent-bright hover:underline">
              halo@wavio.id
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
