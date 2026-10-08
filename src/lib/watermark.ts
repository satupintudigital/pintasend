// Watermark footnote pesan keluar — media iklan platform.
//
// Setiap pesan yang dikirim melalui POST /v1/messages (termasuk yang berasal
// dari integrasi NalaNiaga via gateway PintaSend) otomatis disisipkan footnote
// iklan di akhir teks/caption. Footnote DIHAPUS bila tenant memiliki addon
// "remove_watermark" aktif (TenantAddon) — fitur berbayar yang di-grant
// platform admin.
//
// Teks footnote bisa di-override per lingkungan via env PINTSEND_WATERMARK_FOOTNOTE
// (mis. kampanye promosi berbeda). Kosong/tidak diset → default bawaan.

import { query } from "@/lib/db";
import { getPlatformSetting } from "@/lib/platformSettings";
import { REMOVE_WATERMARK_ADDON_KEY } from "@/lib/addonKeys";
import { tenantAddonActiveWhere } from "@/lib/tenantConfig";

/** Key addon TenantAddon yang menghapus footnote dari pesan keluar. */
export const WATERMARK_ADDON_KEY: string = REMOVE_WATERMARK_ADDON_KEY;

/** Footnote default (media iklan) - dipakai bila env tidak diset. */
export const DEFAULT_WATERMARK_FOOTNOTE = "via PintaSend - https://pintasend.satupintudigital.co.id";

// Cache footnote global (per proses) — setting platform jarang berubah; TTL
// pendek menjaga hot path kirim pesan tetap 0 Neon query (query hanya sekali
// per jendela TTL, bukan per pesan). Invalidate saat settings di-PUT.
let footnoteCache: { value: string; at: number } | null = null;
const FOOTNOTE_CACHE_TTL_MS = 60_000;

/** Kosongkan cache footnote (dipanggil route PUT settings). */
export function invalidateWatermarkFootnoteCache(): void {
  footnoteCache = null;
}

/** Sepasang newline pemisah footnote dari isi pesan (biar rapi di WhatsApp). */
const FOOTNOTE_SEPARATOR = "\n\n";

/** Teks footnote aktif (env override, fallback default). "" = watermark nonaktif. */
export function getWatermarkFootnote(env: Record<string, string | undefined> = process.env): string {
  const raw = env.PINTSEND_WATERMARK_FOOTNOTE;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return DEFAULT_WATERMARK_FOOTNOTE;
}

/**
 * Footnote efektif untuk kirim pesan: env override → setting DB
 * `watermark_footnote` (platform admin, cache TTL) → default. Fail-safe:
 * kegagalan baca DB / tabel belum ada → default (tidak pernah melempar).
 */
export async function resolveWatermarkFootnote(
  env: Record<string, string | undefined> = process.env,
): Promise<string> {
  const raw = env.PINTSEND_WATERMARK_FOOTNOTE;
  if (typeof raw === "string" && raw.trim()) return raw.trim();

  const now = Date.now();
  if (footnoteCache && now - footnoteCache.at < FOOTNOTE_CACHE_TTL_MS) {
    return footnoteCache.value;
  }
  let fromDb: string | boolean | number | null = null;
  try {
    fromDb = await getPlatformSetting("watermark_footnote");
  } catch (e) {
    console.error("watermark: baca setting watermark_footnote gagal (fallback default):", e);
  }
  const value =
    typeof fromDb === "string" && fromDb.trim() ? fromDb.trim() : DEFAULT_WATERMARK_FOOTNOTE;
  footnoteCache = { value, at: now };
  return value;
}

/**
 * Sisipkan footnote ke akhir teks. Murni (pure) — mudah di-unit-test.
 * - footnote kosong → teks apa adanya (tanpa perubahan).
 * - total ≤ maxLength → teks + separator + footnote.
 * - total > maxLength → teks utama dipangkas (dari belakang, tanpa memotong
 *   footnote) agar seluruhnya muat; jika teks habis, footnote dipangkas.
 */
export function appendFootnote(text: string, footnote: string, maxLength: number): string {
  const foot = footnote.trim();
  if (!foot) return text;
  if (!text) return foot.slice(0, maxLength);
  const combined = `${text}${FOOTNOTE_SEPARATOR}${foot}`;
  if (combined.length <= maxLength) return combined;

  // Jaga footnote utuh: pangkas teks utama sampai sisa muat.
  const keep = Math.max(0, maxLength - FOOTNOTE_SEPARATOR.length - foot.length);
  const head = text.slice(0, keep).replace(/\s+$/, "");
  if (head) return `${head}${FOOTNOTE_SEPARATOR}${foot}`;
  // Teks utama tidak tersisa — kirim footnote saja (dipangkas ke maxLength).
  return foot.slice(0, maxLength);
}

/**
 * Cek apakah tenant punya addon remove_watermark yang AKTIF & belum
 * kedaluwarsa (activeUntil masa depan / null utk grant permanen).
 */
export async function tenantHasRemoveWatermark(tenantId: string): Promise<boolean> {
  const rows = await query<{ active: boolean }>(
    `SELECT active FROM "TenantAddon"
     WHERE "tenantId" = $1 AND key = $2 AND ${tenantAddonActiveWhere()} LIMIT 1`,
    [tenantId, WATERMARK_ADDON_KEY],
  );
  return rows.length > 0;
}

export interface WatermarkDecision {
  /** true → footnote harus disisipkan ke pesan keluar. */
  apply: boolean;
  /** Teks footnote aktif ("" bila nonaktif). */
  footnote: string;
}

/**
 * Keputusan watermark untuk satu kiriman: footnote dipakai bila teks tersedia
 * DAN tenant belum punya addon remove_watermark.
 */
export async function resolveWatermark(tenantId: string): Promise<WatermarkDecision> {
  const footnote = await resolveWatermarkFootnote();
  if (!footnote) return { apply: false, footnote: "" };
  const removed = await tenantHasRemoveWatermark(tenantId);
  return { apply: !removed, footnote };
}
