// Normalisasi nomor telepon Indonesia → chatId WhatsApp (…@c.us).
// Pure function — di-unit-test (lihat chat.test.ts).
//
// Aturan:
//   - buang semua non-digit (spasi, -, tanda kurung, dst.)
//   - 6281234567890        → 6281234567890@c.us (sudah internasional)
//   - 081234567890         → 6281234567890@c.us (0 di depan diganti 62)
//   - 81234567890          → 6281234567890@c.us (tanpa 0/62, ditambah 62)
//   - selain itu (terlalu pendek/panjang, bukan angka) → "" (tidak valid)
export function normalizeChatId(to: string): string {
  const digits = to.replace(/\D/g, "");
  if (/^62\d{8,13}$/.test(digits)) return `${digits}@c.us`;
  if (/^8\d{8,12}$/.test(digits)) return `62${digits}@c.us`;
  if (/^0\d{8,12}$/.test(digits)) return `62${digits.slice(1)}@c.us`;
  return "";
}
