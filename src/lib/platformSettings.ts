// ─── Platform settings global (key-value JSON, platform admin) ─────────────
// Whitelist key + tipe ketat: setiap key punya tipe & default, PUT hanya bisa
// menulis key yang dikenal (lainnya 400). value disimpan sebagai JSON string
// agar satu kolom TEXT cukup untuk string/bool/int.

import { query } from "@/lib/db";

/** Tipe value per key — sumber kebenaran whitelist. */
export const PLATFORM_SETTING_KEYS: Record<string, "string" | "boolean" | "number"> = {
  platform_name: "string",
  watermark_footnote: "string",
  allow_public_registration: "boolean",
  message_retention_default_days: "number",
  // ── Self-serve billing ────────────────────────────────────────────
  activation_fee_rp: "number", // biaya aktivasi sekali (Rp) utk paket bulanan
  credit_price_per_message: "number", // harga per pesan prepaid (Rp)
  credit_min_topup_rp: "number", // minimum nominal top-up (Rp)
  order_expiry_minutes: "number", // masa berlaku order pembayaran (menit)
};

/** Default bawaan bila belum pernah diset di DB. */
export const PLATFORM_SETTING_DEFAULTS: Record<string, string | boolean | number> = {
  platform_name: "Wavio",
  watermark_footnote: "",
  allow_public_registration: false,
  message_retention_default_days: 30,
  activation_fee_rp: 350000,
  credit_price_per_message: 400,
  credit_min_topup_rp: 20000,
  order_expiry_minutes: 1440,
};

export function platformSettingType(key: string): "string" | "boolean" | "number" | null {
  return PLATFORM_SETTING_KEYS[key] ?? null;
}

export interface PlatformSettingRow {
  key: string;
  value: string; // JSON
  updatedBy: string | null;
  updatedAt: string;
}

/** Semua setting tersimpan (value sudah di-decode JSON sesuai tipe). */
export async function listPlatformSettings(): Promise<PlatformSettingRow[]> {
  return query<PlatformSettingRow>(
    'SELECT key, value, "updatedBy", "updatedAt" FROM "PlatformSetting" ORDER BY key ASC',
  );
}

/**
 * Baca satu setting dengan fallback default. Key tak dikenal → default null
 * (bukan throw) supaya konsumsi di jalur watermark tetap aman.
 */
export async function getPlatformSetting(key: string): Promise<string | boolean | number | null> {
  const type = platformSettingType(key);
  if (!type) return null;
  const rows = await query<{ value: string }>(
    'SELECT value FROM "PlatformSetting" WHERE key = $1',
    [key],
  );
  if (rows.length === 0) {
    return PLATFORM_SETTING_DEFAULTS[key] ?? null;
  }
  return decodeSettingValue(rows[0].value, type);
}

/** Decode JSON string ke nilai JS sesuai tipe key (fail-safe → null). */
export function decodeSettingValue(
  raw: string,
  type: "string" | "boolean" | "number",
): string | boolean | number | null {
  try {
    const parsed = JSON.parse(raw);
    if (type === "string" && typeof parsed === "string") return parsed;
    if (type === "boolean" && typeof parsed === "boolean") return parsed;
    if (type === "number" && typeof parsed === "number" && Number.isFinite(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Validasi nilai mentah dari request → JSON string atau pesan error. */
export function encodeSettingValue(
  key: string,
  raw: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  const type = platformSettingType(key);
  if (!type) return { ok: false, error: "Key setting tidak dikenal" };

  if (type === "string") {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s.length > 500) return { ok: false, error: "Nilai string maks. 500 karakter" };
    return { ok: true, value: JSON.stringify(s) };
  }
  if (type === "boolean") {
    if (typeof raw !== "boolean") return { ok: false, error: "Nilai harus boolean" };
    return { ok: true, value: JSON.stringify(raw) };
  }
  // number
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return { ok: false, error: "Nilai harus bilangan bulat" };
  }
  if (key === "message_retention_default_days" && (raw < 30 || raw > 365)) {
    return { ok: false, error: "Retensi default harus 30..365 hari" };
  }
  if (key === "order_expiry_minutes" && (raw < 15 || raw > 10080)) {
    return { ok: false, error: "Masa berlaku order harus 15..10080 menit" };
  }
  // Nominal harga (tanpa key spesifik) dibatasi 0..10.000.000.
  if (["activation_fee_rp", "credit_price_per_message", "credit_min_topup_rp"].includes(key) &&
    (raw < 0 || raw > 10_000_000)) {
    return { ok: false, error: "Nominal harus 0..10.000.000" };
  }
  return { ok: true, value: JSON.stringify(raw) };
}

/** Upsert satu setting (whitelist di-enforce oleh encodeSettingValue). */
export async function setPlatformSetting(input: {
  key: string;
  value: string; // sudah JSON-encoded
  updatedBy?: string | null;
}): Promise<boolean> {
  const rows = await query<{ key: string }>(
    `INSERT INTO "PlatformSetting" (key, value, "updatedBy", "updatedAt")
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = now()
     RETURNING key`,
    [input.key, input.value, input.updatedBy ?? null],
  );
  return rows.length > 0;
}
