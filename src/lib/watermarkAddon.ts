// Service layer untuk self-service addon Hapus Watermark (tenant mengelola
// sendiri via API publik v1) — memisahkan logika bisnis dari route handler
// (SRP), pola sama seperti checkContact.ts / listGroups.ts.
//
// Endpoint: GET  /v1/addons/remove-watermark  → status addon tenant
//           POST /v1/addons/remove-watermark  → grant/cabut addon
//
// Tanggung jawab: rate limit per key → baca/tulis TenantAddon (Neon) → map
// hasil. Tidak ada kuota pesan (bukan kirim pesan) & tidak butuh device.

import { setTenantAddon } from "@/lib/platform";
import { tenantHasRemoveWatermark, WATERMARK_ADDON_KEY } from "@/lib/watermark";
import { checkRateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/requestLogger";

export interface WatermarkAddonContext {
  tenantId: string;
  keyId: string;
  /** Id korelasi (X-Request-Id) — dipakai di semua log event request ini. */
  requestId: string;
}

export type WatermarkAddonResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

function okBody(active: boolean): Record<string, unknown> {
  return {
    ok: true,
    addon: WATERMARK_ADDON_KEY,
    active,
    // Watermark pesan aktif = kebalikan dari addon: false saat addon AKTIF.
    watermark: !active,
  };
}

async function rateLimit(ctx: WatermarkAddonContext): Promise<WatermarkAddonResult | null> {
  // Bucket terpisah dari kirim pesan/cek nomor — toggle addon frekuensi rendah.
  const rl = await checkRateLimit(`v1-addons-watermark:key:${ctx.keyId}`, 60, 60_000);
  if (rl.allowed) return null;
  logEvent("warn", "watermark_addon_rate_limited", ctx.requestId, {
    tenantId: ctx.tenantId,
    keyId: ctx.keyId,
    retryAfterSec: rl.retryAfterSec,
  });
  return {
    ok: false,
    status: 429,
    error: "Terlalu banyak permintaan. Coba lagi nanti.",
    retryAfterSec: rl.retryAfterSec,
  };
}

/** Status addon saat ini (GET) — active:true = footnote dihapus dari pesan. */
export async function executeWatermarkAddonGet(
  ctx: WatermarkAddonContext,
): Promise<WatermarkAddonResult> {
  const limited = await rateLimit(ctx);
  if (limited) return limited;

  try {
    const active = await tenantHasRemoveWatermark(ctx.tenantId);
    logEvent("info", "watermark_addon_get", ctx.requestId, {
      tenantId: ctx.tenantId,
      active,
    });
    return { ok: true, status: 200, body: okBody(active) };
  } catch (e) {
    logEvent("error", "watermark_addon_get_failed", ctx.requestId, {
      tenantId: ctx.tenantId,
      detail: String(e),
    });
    return { ok: false, status: 500, error: "Gagal membaca status addon" };
  }
}

/** Grant/cabut addon sendiri (POST) — idempoten upsert TenantAddon. */
export async function executeWatermarkAddonSet(
  active: boolean,
  ctx: WatermarkAddonContext,
): Promise<WatermarkAddonResult> {
  const limited = await rateLimit(ctx);
  if (limited) return limited;

  try {
    const ok = await setTenantAddon(ctx.tenantId, WATERMARK_ADDON_KEY, active);
    if (!ok) {
      // TenantAddon FK ke Tenant — tenant dijamin ada (dari verifyApiKey),
      // jadi ini hanya jalur defensif.
      logEvent("error", "watermark_addon_set_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        detail: "tenant tidak ditemukan",
      });
      return { ok: false, status: 404, error: "Tenant tidak ditemukan" };
    }
    logEvent("info", "watermark_addon_set", ctx.requestId, {
      tenantId: ctx.tenantId,
      active,
    });
    return { ok: true, status: 200, body: okBody(active) };
  } catch (e) {
    logEvent("error", "watermark_addon_set_failed", ctx.requestId, {
      tenantId: ctx.tenantId,
      detail: String(e),
    });
    return { ok: false, status: 500, error: "Gagal mengubah addon" };
  }
}
