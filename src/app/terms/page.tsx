import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-20 md:py-28">
      <Link
        href="/"
        className="inline-block py-2 font-mono text-xs uppercase tracking-[0.18em] text-accent-bright transition-color-colors hover:text-fg"
      >
        ← Kembali ke beranda
      </Link>
      <h1 className="mt-6 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
        Syarat &amp; Ketentuan
      </h1>
      <p className="mt-2 text-sm text-fg-faint">Terakhir diperbarui: 21 Agustus 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-fg-muted">
        {/* 1. Penerimaan */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            1. Penerimaan Ketentuan
          </h2>
          <p className="mt-3">
            Dengan membuat akun atau menggunakan layanan PintaSend, Anda menyetujui seluruh
            ketentuan ini, Kebijakan Privasi, dan Kebijakan Penggunaan WhatsApp Business.
            Jika Anda tidak setuju, jangan gunakan layanan.
          </p>
        </section>

        {/* 2. Deskripsi Layanan */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            2. Deskripsi Layanan
          </h2>
          <p className="mt-3">
            PintaSend menyediakan AI gateway multi-kanal — antarmuka REST API dan dashboard untuk
            bisnis mengirim serta menerima pesan WhatsApp. Setiap pengguna (tenant) memiliki
            perangkat WhatsApp yang diisolasi dan dihubungkan melalui pemindaian QR.
          </p>
        </section>

        {/* 3. Kewajiban dan Hak Pengguna */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            3. Kewajiban dan Hak Pengguna
          </h2>
          <p className="mt-3">
            <strong>Hak Pengguna:</strong> mengakses dan menggunakan layanan sesuai paket yang
            berlangganan; mendapatkan dukungan teknis; mengekspor data pengiriman dan
            perangkat.
          </p>
          <p className="mt-3">
            <strong>Kewajiban Pengguna:</strong>
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Memastikan setiap pesan yang dikirim melalui PintaSend memiliki <strong>persetujuan
              penerima</strong> sesuai kebijakan WhatsApp Business dan peraturan perundang-undangan.
            </li>
            <li>
              Tidak menggunakan layanan untuk mengirim konten yang <strong>dilarang</strong> oleh
              hukum Indonesia atau kebijakan WhatsApp, termasuk namun tidak terbatas pada:
              spam, phishing, penipuan, terorisme, pornografi, perjudian, ujaran kebencian,
              atau konten yang meresahkan masyarakat.
            </li>
            <li>
              Menjaga kerahasiaan API key dan kredensial akunnya masing-masing.
            </li>
            <li>
              Mematuhi seluruh ketentuan hukum yang berlaku terkait pengiriman pesan dan
              pelindungan data pribadi.
            </li>
          </ul>
        </section>

        {/* 4. Pertanggungjawaban Konten */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            4. Pertanggungjawaban terhadap Konten
          </h2>
          <p className="mt-3">
            Pengguna bertanggung jawab penuh atas seluruh Informasi Elektronik dan/atau
            Dokumen Elektronik (termasuk pesan, media, dan broadcast) yang dikirim atau
            diteruskan melalui layanan PintaSend. PintaSend hanya bertindak sebagai perantara
            pengiriman dan tidak bertanggung jawab atas isi pesan yang dikirim oleh Pengguna.
          </p>
          <p className="mt-3">
            Namun, PintaSend berhak melakukan tindakan yang diperlukan terhadap pesan atau akun
            yang terindikasi melanggar hukum atau ketentuan ini, termasuk penangguhan atau
            penghentian akses tanpa pemberitahuan sebelumnya dalam hal mendesak.
          </p>
        </section>

        {/* 5. Penggunaan yang Wajar */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            5. Penggunaan yang Wajar
          </h2>
          <p className="mt-3">
            Dilarang menggunakan layanan untuk aktivitas berikut:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Pengiriman spam atau pesan massal tanpa persetujuan penerima</li>
            <li>Phishing, penipuan, atau aktivitas kriminal lainnya</li>
            <li>Distribusi konten yang dilarang peraturan perundang-undangan</li>
            <li>Upaya peretasan, pemindaian keamanan, atau aktivitas yang merusak sistem</li>
            <li>Pelanggaran terhadap kebijakan WhatsApp Business Policy</li>
          </ul>
          <p className="mt-3">
            Pelanggaran dapat menyebabkan penangguhan atau penghentian akun tanpa
            pemberitahuan dan tanpa pengembalian biaya.
          </p>
        </section>

        {/* 6. Mekanisme Pelaporan Konten Ilegal */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            6. Mekanisme Pelaporan dan Penanganan Konten yang Dilarang
          </h2>
          <p className="mt-3">
            Sesuai Peraturan Menteri Komunikasi dan Informatika Nomor 5 Tahun 2020 tentang
            Penyelenggara Sistem Elektronik Lingkup Privat, PintaSend menyediakan mekanisme
            pelaporan untuk setiap Informasi Elektronik dan/atau Dokumen Elektronik yang
            dilarang.
          </p>
          <p className="mt-3">
            <strong>Sarana pelaporan</strong> dapat diakses oleh publik melalui:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Email:{" "}
              <a
                href="mailto:report@pintasend.id"
                className="text-accent-bright hover:underline"
              >
                report@pintasend.id
              </a>{" "}
              — untuk pelaporan konten/aktivitas ilegal
            </li>
            <li>
              Form pelaporan online:{" "}
              <a href="/report" className="text-accent-bright hover:underline">
                pintasend.satupintudigital.co.id/report
              </a>
            </li>
          </ul>
          <p className="mt-3">
            Pelaporan minimal memuat: identitas pelapor, deskripsi konten/aktivitas yang
            dilaporkan, tautan atau data pendukung, dan alasan pelaporan.
          </p>
        </section>

        {/* 7. Kebijakan Takedown */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            7. Kebijakan Penghentian Akses terhadap Konten yang Dilarang (Take Down)
          </h2>
          <p className="mt-3">
            Berdasarkan Peraturan Menteri Komunikasi dan Informatika Nomor 5 Tahun 2020:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Atas perintah dari Menteri atau instansi berwenang, PintaSend wajib melakukan take
              down terhadap konten yang dilarang <strong>paling lambat 1×24 jam</strong> sejak
              perintah diterima.
            </li>
            <li>
              Untuk konten yang bersifat <strong>mendesak</strong> (terorisme, pornografi anak,
              atau konten yang meresahkan masyarakat), take down dilakukan{" "}
              <strong>paling lambat 4 jam</strong> sejak peringatan diterima.
            </li>
            <li>
              PintaSend dapat melakukan tindakan serupa atas inisiatif sendiri terhadap akun atau
              aktivitas yang terindikasi melanggar hukum, dengan pemberitahuan kepada pengguna
              terdampak.
            </li>
          </ul>
        </section>

        {/* 8. Tagihan & Pembatalan */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            8. Tagihan &amp; Pembatalan
          </h2>
          <p className="mt-3">
            Paket bulanan ditagih di awal periode dan dapat dibatalkan kapan saja; layanan
            tetap aktif hingga akhir periode berjalan. Paket per-pesan (Espresso) ditagih
            sesuai pemakaian. Biaya aktivasi berlaku sekali dan tidak dapat dikembalikan.
          </p>
        </section>

        {/* 9. Ketersediaan Layanan */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            9. Ketersediaan Layanan
          </h2>
          <p className="mt-3">
            Kami berupaya menjaga ketersediaan layanan tetapi tidak menjamin bebas gangguan.
            PintaSend tidak bertanggung jawab atas kerugian tidak langsung akibat keterlambatan
            atau kegagalan pengiriman pesan.
          </p>
        </section>

        {/* 10. Perubahan Ketentuan */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            10. Perubahan Ketentuan
          </h2>
          <p className="mt-3">
            PintaSend berhak mengubah ketentuan ini sewaktu-waktu. Perubahan material akan
            diberitahukan melalui email atau notifikasi di dashboard setidaknya 7 hari sebelum
            berlaku efektif. Penggunaan layanan setelah perubahan berlaku merupakan
            penerimaan atas ketentuan yang diperbarui.
          </p>
        </section>

        {/* 11. Hukum yang Berlaku */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            11. Hukum yang Berlaku &amp; Penyelesaian Sengketa
          </h2>
          <p className="mt-3">
            Ketentuan ini tunduk pada hukum Republik Indonesia (UU No. 11/2008 tentang ITE
            sebagaimana diubah, PP No. 71/2019 tentang PSTE, Permenkominfo No. 5/2020, dan
            UU No. 27/2022 tentang Pelindungan Data Pribadi). Sengketa diselesaikan melalui
            musyawarah; bila gagal, melalui pengadilan negeri yang berwenang.
          </p>
        </section>

        {/* 12. Kontak */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">12. Kontak</h2>
          <p className="mt-3">
            Pertanyaan, laporan pelanggaran, atau permintaan terkait ketentuan ini:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Umum:{" "}
              <a
                href="mailto:halo@pintasend.id"
                className="text-accent-bright hover:underline"
              >
                halo@pintasend.id
              </a>
            </li>
            <li>
              Pelaporan konten ilegal:{" "}
              <a
                href="mailto:report@pintasend.id"
                className="text-accent-bright hover:underline"
              >
                report@pintasend.id
              </a>
            </li>
            <li>
              Privasi &amp; Data Pribadi:{" "}
              <a
                href="mailto:privacy@satupintudigital.co.id"
                className="text-accent-bright hover:underline"
              >
                privacy@satupintudigital.co.id
              </a>
            </li>
          </ul>
        </section>
      </div>
    </main>
  );
}
