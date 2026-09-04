// Template pesan standar NalaNiaga + seeding ke session OpenWA.
//
// Katalog ini adalah cermin `seed-templates.js` di server (NalaNiaga/OpenWA):
// template yang di-provision untuk toko NalaNiaga. Wavio menyalinnya ke sisi
// klien agar seeding otomatis bisa dilakukan saat device dibuat (tanpa harus
// mengeksekusi script di server). Sumber kebenaran pembuatan tetap OpenWA —
// Wavio hanya memanggil POST /api/sessions/:id/templates.

import { openwa } from "./openwa";

export interface OpenwaTemplate {
  id: string;
  name: string;
  header: string | null;
  body: string;
  footer: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NalaTemplate {
  name: string;
  header: string;
  body: string;
  footer: string;
}

/**
 * 7 template standar NalaNiaga (sama dengan seed-templates.js di server).
 *
 * Setiap footer menyertakan placeholder `{{watermark}}` di paling akhir:
 * send-template mengirim `vars.watermark` berisi footnote iklan Wavio (atau
 * string kosong bila tenant punya addon remove_watermark), sehingga placeholder
 * ini terisi footnote — atau hilang bersih tanpa trailing newline saat
 * watermark nonaktif. `renderTemplate` OpenWA mengganti placeholder yang
 * dikenali di vars dan membiarkan yang tidak dikenali literal, jadi Wavio
 * SELALU mengirim kunci watermark (nilai "" sekalipun).
 */
export const NALA_TEMPLATES: readonly NalaTemplate[] = [
  {
    name: "pesanan_baru",
    header: "🛍️ PESANAN BARU",
    body: "Halo {{recipientName}}, pesanan #{{orderNumber}} senilai {{total}} di {{cityName}} telah diterima. Silakan lakukan pembayaran sesuai petunjuk.",
    footer: "NalaNiaga - Belanja Mudah & Cepat{{watermark}}",
  },
  {
    name: "bukti_transfer_diterima",
    header: "💳 BUKTI TRANSFER DITERIMA",
    body: "Terima kasih! Bukti pembayaran untuk pesanan #{{orderNumber}} sudah kami terima dan sedang diverifikasi oleh tim kami.",
    footer: "Proses verifikasi butuh 5-15 menit.{{watermark}}",
  },
  {
    name: "pembayaran_lunas",
    header: "✅ PEMBAYARAN DITERIMA",
    body: "Pembayaran untuk pesanan #{{orderNumber}} telah terverifikasi lunas. Pesanan Anda saat ini sedang disiapkan untuk dikirim.",
    footer: "Terima kasih telah berbelanja!{{watermark}}",
  },
  {
    name: "pesanan_dikirim",
    header: "🚚 PESANAN DIKIRIM",
    body: "Pesanan #{{orderNumber}} telah dikirim menggunakan kurir {{courier}}.\nNomor Resi: {{trackingNumber}}\n\nLacak status pengiriman Anda secara berkala.",
    footer: "Semoga produk favorit Anda cepat sampai!{{watermark}}",
  },
  {
    name: "pesanan_dibatalkan",
    header: "⚠️ PESANAN DIBATALKAN",
    body: "Pesanan #{{orderNumber}} telah dibatalkan. Jika ini adalah kekeliruan atau Anda butuh bantuan, hubungi layanan pelanggan kami.",
    footer: "NalaNiaga Customer Care{{watermark}}",
  },
  {
    name: "pengingat_keranjang",
    header: "🛒 KERANJANG TERTINGGAL",
    body: "Halo {{recipientName}}, stok produk favorit Anda di keranjang hampir habis! Selesaikan pesanan #{{orderNumber}} Anda sekarang sebelum kehabisan.",
    footer: "Klik tautan di website untuk checkout.{{watermark}}",
  },
  {
    name: "sapaan_pelanggan",
    header: "👋 SELAMAT DATANG",
    body: "Halo! Terima kasih telah menghubungi toko kami. Ada yang bisa kami bantu mengenai produk, pesanan, atau konfirmasi pembayaran Anda?",
    footer: "Balas pesan ini untuk terhubung dengan CS.{{watermark}}",
  },
];

/** Status error 409 (konflik — template sudah ada) dari OpenWA. */
function isConflict(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "status" in e &&
    (e as { status: number }).status === 409
  );
}

/**
 * Seed template standar ke sebuah session OpenWA — idempoten: template yang
 * namanya sudah terdaftar dilewati, konflik 409 dianggap sudah ada.
 *
 * Throws bila list atau create gagal karena alasan selain 409 — pemanggil
 * (createDeviceAndStart) memutuskan best-effort / gagal-bersama.
 */
export async function seedTemplatesForSession(sessionId: string): Promise<void> {
  const existing = await openwa.listTemplates(sessionId);
  const existingNames = new Set(
    Array.isArray(existing) ? existing.map((t) => t.name).filter(Boolean) : [],
  );

  for (const tpl of NALA_TEMPLATES) {
    if (existingNames.has(tpl.name)) continue;
    try {
      await openwa.createTemplate(sessionId, {
        name: tpl.name,
        header: tpl.header,
        body: tpl.body,
        footer: tpl.footer,
      });
    } catch (e) {
      // Berlomba dengan session lain / sudah dibuat → skip, lanjut.
      if (isConflict(e)) continue;
      throw e;
    }
  }
}
