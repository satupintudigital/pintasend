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
      <p className="mt-2 text-sm text-fg-faint">Terakhir diperbarui: 21 Agustus 2026</p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-fg-muted">
        {/* 1. Pengantar */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            1. Pengantar &amp; Identitas Pengendali
          </h2>
          <p className="mt-3">
            Kebijakan Privasi ini menjelaskan bagaimana{" "}
            <strong>PT. Satu Pintu Digital</strong> (&quot;Wavio&quot;, &quot;kami&quot;)
            memproses Data Pribadi Anda sehubungan dengan penggunaan layanan Wavio — WhatsApp
            API gateway yang menghubungkan aplikasi bisnis dengan WhatsApp melalui REST API.
          </p>
          <p className="mt-3">
            Dalam konteks Pelindungan Data Pribadi (UU No. 27/2022):
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Tenant (bisnis pelanggan)</strong> = Pengendali Data atas data penerima
              pesannya dan bertanggung jawab atas persetujuan penerima.
            </li>
            <li>
              <strong>Wavio</strong> = Pemroses Data yang memproses data atas instruksi
              tenant, sekaligus Pengendali atas data akun tenant.
            </li>
          </ul>
        </section>

        {/* 2. Data yang Diproses */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            2. Data Pribadi yang Kami Proses
          </h2>
          <p className="mt-3">
            <strong>Data akun tenant:</strong> nama bisnis, email, kata sandi (ter-hash
            bcrypt), pengaturan akun.
          </p>
          <p className="mt-3">
            <strong>Data perangkat:</strong> perangkat WhatsApp yang dihubungkan via QR
            (identitas perangkat, status).
          </p>
          <p className="mt-3">
            <strong>Data pesan</strong> (atas nama tenant): nomor WhatsApp penerima, isi
            pesan, metadata pengiriman (status, waktu, ACK).
          </p>
          <p className="mt-3">
            <strong>Data teknis:</strong> log pengiriman, webhook delivery, API key, riwayat
            request.
          </p>
          <p className="mt-3 text-fg-faint text-xs italic">
            Data penerima pesan adalah Data Pribadi pihak ketiga — Wavio memprosesnya atas
            instruksi tenant (Pengendali).
          </p>
        </section>

        {/* 3. Dasar Hukum */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            3. Dasar Hukum Pemrosesan
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>
              <strong>Perjanjian</strong> — penyediaan layanan berdasarkan kontrak dengan
              tenant
            </li>
            <li>
              <strong>Kepentingan yang sah</strong> — keamanan, anti-spam, pemenuhan kebijakan
              WhatsApp
            </li>
            <li>
              <strong>Kewajiban hukum</strong> — pemenuhan kewajiban perpajakan dan pelaporan
              sesuai peraturan perundang-undangan
            </li>
          </ul>
        </section>

        {/* 4. Tujuan Pemrosesan */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            4. Tujuan Pemrosesan
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>Meneruskan dan mengirim pesan WhatsApp atas instruksi tenant</li>
            <li>Mengirim event realtime (webhook) ke aplikasi tenant</li>
            <li>Mengelola akun, perangkat, dan API key</li>
            <li>Menjaga keamanan, mencegah spam, dan memantau operasional</li>
            <li>Pemenuhan kewajiban hukum terkait data transaksi</li>
          </ul>
        </section>

        {/* 5. Pihak Ketiga / Subprosesor */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            5. Pihak Ketiga &amp; Subprosesor
          </h2>
          <p className="mt-3">
            Kami menggunakan pihak ketiga berikut untuk menjalankan layanan:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Cloudflare</strong> — Workers, CDN/WAF, R2 (infrastruktur)
            </li>
            <li>
              <strong>Neon</strong> — PostgreSQL (basis data, hanya untuk pengembangan/uji)
            </li>
            <li>
              <strong>OpenWA</strong> — infrastruktur gateway WhatsApp (milik kami)
            </li>
            <li>
              <strong>Resend</strong> — email transaksional
            </li>
          </ul>
          <p className="mt-3">
            Kami tidak menjual Data Pribadi. Setiap subprosesor terikat kewajiban
            kerahasiaan dan keamanan sesuai perjanjian/standar layanan yang berlaku.
          </p>
        </section>

        {/* 6. Transfer Lintas Batas */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            6. Transfer Lintas Batas
          </h2>
          <p className="mt-3">
            <strong>Data produksi</strong> (akun, perangkat, log pesan) diproses dan disimpan
            di <strong>Indonesia</strong> (VPS/on-premise). Sebagian infrastruktur pendukung
            berada di luar Indonesia:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Neon PostgreSQL (Singapura) — <em>hanya untuk pengembangan/uji coba</em>, tidak
              memuat data produksi
            </li>
            <li>
              Cloudflare (jaringan global) — komputasi edge &amp; cache sementara (transit),
              bukan penyimpanan utama data pribadi
            </li>
          </ul>
        </section>

        {/* 7. Retensi */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            7. Retensi &amp; Penghapusan
          </h2>
          <p className="mt-3">
            <strong>Pesan &amp; log pengiriman:</strong> maksimal <strong>30 hari</strong>,
            kecuali tenant meminta penyimpanan lebih lama. Penghapusan otomatis diterapkan
            melalui mekanisme purge yang sudah aktif. Tenant dapat meminta perpanjangan retensi
            secara tertulis.
          </p>
          <p className="mt-3">
            <strong>Data akun:</strong> selama akun aktif. Setelah akun dihapus, pesan &amp;
            perangkat yang tersambung ikut dihapus.
          </p>
          <p className="mt-3">
            <strong>Log teknis &amp; API key:</strong> sesuai kebijakan retensi perusahaan.
          </p>
        </section>

        {/* 8. Keamanan */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            8. Keamanan Data
          </h2>
          <p className="mt-3">
            TLS untuk seluruh trafik, kata sandi ter-hash (bcrypt), API key per tenant,
            isolasi device per tenant, rate limit, dan audit log. Detail:{" "}
            <span className="text-fg-faint">SOP Keamanan perusahaan (berlaku umum).</span>
          </p>
        </section>

        {/* 9. Hak Subjek Data */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            9. Hak Subjek Data
          </h2>
          <p className="mt-3">
            Sesuai UU PDP No. 27/2022, Anda berhak: memperoleh informasi, mengoreksi,
            mengakses &amp; memperoleh salinan, menghapus data, menarik persetujuan, dan
            mengajukan keberatan.
          </p>
          <p className="mt-3">
            Pemilik akun: hubungi kanal aduan. Penerima pesan: ajukan melalui tenant
            (Pengendali) atau melalui kanal aduan Wavio.
          </p>
        </section>

        {/* 10. Notifikasi Kegagalan Pelindungan */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            10. Notifikasi Kegagalan Pelindungan Data
          </h2>
          <p className="mt-3">
            Jika terjadi kegagalan pelindungan Data Pribadi, kami memberitahukan tenant
            (Pengendali) dan mendukung pemberitahuan ke subjek data &amp; lembaga paling
            lambat <strong>3×24 jam</strong> (UU PDP Pasal 46).
          </p>
        </section>

        {/* 11. Pejabat PDP & Kanal Aduan */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            11. Pejabat PDP &amp; Kanal Aduan
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>
              <strong>Pejabat Pelindungan Data Pribadi:</strong> Mhd. Iqbal Syahputra, S.
              Kom (Direktur)
            </li>
            <li>
              Email privasi &amp; aduan:{" "}
              <a
                href="mailto:privacy@satupintudigital.co.id"
                className="text-accent-bright hover:underline"
              >
                privacy@satupintudigital.co.id
              </a>
            </li>
            <li>
              Alamat: Komplek Green View Sunggal Blok D No. 38, Deli Serdang, Sumatera Utara
            </li>
          </ul>
          <p className="mt-3">
            Permintaan ditanggapi ≤ 3 hari kerja (konfirmasi) dan diselesaikan ≤ 30 hari.
          </p>
        </section>

        {/* 12. Perubahan & Hukum */}
        <section>
          <h2 className="font-display text-lg font-semibold text-fg">
            12. Perubahan &amp; Hukum yang Berlaku
          </h2>
          <p className="mt-3">
            Kebijakan ini dapat diperbarui; perubahan material akan diberitahukan.
            Tunduk pada hukum Republik Indonesia: UU No. 27/2022, PP No. 71/2019.
          </p>
        </section>
      </div>
    </main>
  );
}
