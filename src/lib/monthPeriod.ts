// ─── Periode bulan kalender Asia/Jakarta ────────────────────────────────────
// Dipakai kuota pesan (quota.ts) & invoice bulanan (invoices.ts) agar konsisten:
// bulan dihitung menurut WIB (bukan UTC), sehingga jam 00:00–07:00 WIB masih
// termasuk hari yang sama. Pure functions — mudah di-unit-test.

function wibParts(d: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { year: Number(get("year")), month: Number(get("month")) };
}

/** Awal bulan (WIB) untuk tahun/bulan → ISO `YYYY-MM-01T00:00:00+07:00`. */
export function monthStartIso(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01T00:00:00+07:00`;
}

/** Awal bulan BERJALAN di WIB → ISO offset WIB. */
export function currentMonthStartIso(now = new Date()): string {
  const { year, month } = wibParts(now);
  return monthStartIso(year, month);
}

/**
 * Rentang invoice bulan tsb di WIB: [awal bulan, akhir bulan) sebagai Date.
 * Akhir bulan = tanggal 1 bulan berikutnya (exclusive) — memudahkan query
 * `createdAt >= start AND createdAt < end`.
 */
export function monthPeriodRange(
  year: number,
  month: number,
): { periodStart: Date; periodEnd: Date } {
  // Konstruksi via UTC lalu geser +7 jam — deterministik, tanpa DST.
  const startUtc = Date.UTC(year, month - 1, 1);
  const periodStart = new Date(startUtc - 7 * 3_600_000); // 00:00 WIB
  const endUtc = Date.UTC(year, month, 1);
  const periodEnd = new Date(endUtc - 7 * 3_600_000); // 00:00 WIB bulan berikutnya
  return { periodStart, periodEnd };
}

/** Deteksi tahun/bulan valid (1..12, tahun wajar). */
export function isValidPeriod(year: number, month: number): boolean {
  return Number.isInteger(year) && year >= 2020 && year <= 2100 &&
    Number.isInteger(month) && month >= 1 && month <= 12;
}
