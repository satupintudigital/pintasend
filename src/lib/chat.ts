// Normalisasi nomor telepon Indonesia → chatId WhatsApp (…@c.us).
// Pure function — di-unit-test (lihat chat.test.ts).
//
// Aturan:
//   - buang semua non-digit (spasi, -, tanda kurung, dst.)
//   - 6281234567890        → 6281234567890@c.us (sudah internasional)
//   - 081234567890         → 6281234567890@c.us (0 di depan diganti 62)
//   - 81234567890          → 6281234567890@c.us (tanpa 0/62, ditambah 62)
//   - selain itu (terlalu pendek/panjang, bukan angka) → "" (tidak valid)
// Normalisasi nomor telepon Indonesia → digit internasional (62…) TANPA @c.us.
// Dipakai normalizeChatId (chatId penuh) dan cek nomor contacts/check (OpenWA
// butuh digit saja, tanpa suffix). Pure function — di-unit-test (chat.test.ts).
export function normalizePhoneNumber(to: string): string {
  const digits = to.replace(/\D/g, "");
  if (/^62\d{8,13}$/.test(digits)) return digits;
  if (/^8\d{8,12}$/.test(digits)) return `62${digits}`;
  if (/^0\d{8,12}$/.test(digits)) return `62${digits.slice(1)}`;
  return "";
}

export function normalizeChatId(to: string): string {
  const trimmed = to.trim();
  // JID lengkap (…@c.us / …@g.us / …@lid) dibiarkan apa adanya — dipakai untuk
  // kirim ke grup, balas @lid, dst. Minimal 8 digit sebelum @ dan domain non-kosong
  // (menolak "123@g.us" dll. yang bukan JID wajar).
  if (/^\d{8,}@[a-z0-9.-]+$/i.test(trimmed)) return trimmed;
  const digits = normalizePhoneNumber(trimmed);
  return digits ? `${digits}@c.us` : "";
}
