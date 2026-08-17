import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-20 md:py-28">
      <Link
        href="/"
        className="inline-block py-2 font-mono text-xs uppercase tracking-[0.18em] text-accent-bright transition-colors hover:text-fg"
      >
        ← Kembali ke beranda
      </Link>
      <h1 className="mt-6 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        Kebijakan Privasi
      </h1>
      <p className="mt-2 text-sm text-fg-faint">Terakhir diperbarui: Agustus 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-fg-muted">
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">Data yang kami proses</h2>
          <p className="mt-3">
            Wavio memproses data yang diperlukan untuk mengirim dan menerima pesan WhatsApp atas
            nama bisnismu: nomor WhatsApp, isi pesan, metadata pengiriman, dan data akun (email,
            nama, password terenkripsi). Kami tidak menjual data pribadi kepada pihak mana pun.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-fg">Penyimpanan</h2>
          <p className="mt-3">
            Pesan dan log pengiriman disimpan di server kami selama maksimal 30 hari, kecuali
            diminta lebih lama oleh pemilik akun. Password disimpan dalam bentuk hash
            (bcrypt) dan tidak pernah disimpan sebagai teks biasa.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-fg">Keamanan</h2>
          <p className="mt-3">
            Seluruh trafik dienkripsi dengan TLS. API diakses melalui API key per akun, dan setiap
            device diisolasi per tenant sehingga data satu pelanggan tidak dapat diakses pelanggan
            lain. Sesuai kebijakan WhatsApp, kami tidak mendukung aktivitas spam atau broadcast
            massal tanpa persetujuan penerima.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-fg">Hak Anda</h2>
          <p className="mt-3">
            Anda dapat meminta salinan, perbaikan, atau penghapusan data akun kapan saja dengan
            menghubungi kami. Penghapusan akun menghapus seluruh pesan dan device yang tersambung.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-semibold text-fg">Kontak</h2>
          <p className="mt-3">
            Pertanyaan tentang kebijakan ini:{" "}
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
