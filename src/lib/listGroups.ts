// Service layer untuk GET /v1/groups — memisahkan logika bisnis dari route
// handler (SRP), sama seperti checkContact.ts untuk contacts/check.
//
// Tanggung jawab: rate limit per key → pilih device ready → list grup via
// OpenWA (sessions/:id/groups) → map hasil. Route hanya verifikasi API key lalu
// delegasi ke sini.
//
// Catatan: ini BACA (bukan kirim pesan) — tidak menghitung kuota pesan, hanya
// dibatasi rate limit per API key (bucket terpisah dari kirim pesan).

import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface ListGroupsContext {
  tenantId: string;
  keyId: string;
  /** Id korelasi (X-Request-Id) — dipakai di semua log event request ini. */
  requestId: string;
}

export interface ListGroupsInput {
  /** Device tertentu (opsional); tanpa ini → device ready pertama tenant. */
  deviceId?: string;
  /** Maksimal grup yang dikembalikan (1-1000). Default 1000 (di-clamp OpenWA). */
  limit?: number;
  /** Jumlah grup yang dilewati (paging). Default 0. */
  offset?: number;
}

export type ListGroupsResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

// Batas atas pagination — selaras dengan OpenWA DEFAULT_LIST_LIMIT (1000).
const MAX_LIMIT = 1000;

function clampWindow(limit?: number, offset?: number): { limit?: number; offset?: number } {
  const l =
    typeof limit === "number" && Number.isFinite(limit)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)))
      : undefined;
  const o =
    typeof offset === "number" && Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : undefined;
  return { limit: l, offset: o };
}

export async function executeListGroups(
  input: ListGroupsInput,
  ctx: ListGroupsContext,
): Promise<ListGroupsResult> {
  // 1. Rate limit per API key — bucket terpisah dari kirim pesan.
  const rl = await checkRateLimit(`v1-groups-list:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) {
    logEvent("warn", "groups_list_rate_limited", ctx.requestId, {
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

  // 2. Pilih device: deviceId tertentu, atau device ready pertama milik tenant.
  const device = input.deviceId
    ? await queryD1One<{ id: string; label: string; openwaSessionId: string; status: string }>(
        'SELECT id, label, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?',
        [input.deviceId, ctx.tenantId],
      )
    : await queryD1One<{ id: string; label: string; openwaSessionId: string; status: string }>(
        'SELECT id, label, openwaSessionId, status FROM Device WHERE tenantId = ? AND status = ? ORDER BY updatedAt DESC LIMIT 1',
        [ctx.tenantId, "ready"],
      );

  if (!device) {
    return {
      ok: false,
      status: input.deviceId ? 404 : 409,
      error: input.deviceId
        ? "Device tidak ditemukan untuk tenant ini"
        : "Belum ada device yang tersambung (status ready)",
    };
  }
  if (device.status !== "ready") {
    return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };
  }

  // 3. List grup via OpenWA. Respons OpenWA = array mentah (proyeksi narrow).
  const { limit, offset } = clampWindow(input.limit, input.offset);
  try {
    const groups = await openwa.listGroups(device.openwaSessionId, limit, offset);
    const list = Array.isArray(groups) ? groups : [];
    logEvent("info", "groups_list_success", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      count: list.length,
    });
    return {
      ok: true,
      status: 200,
      body: { ok: true, deviceId: device.id, count: list.length, groups: list },
    };
  } catch (e) {
    if (e instanceof OpenwaError) {
      // Detail internal (status/message) HANYA di log — pesan publik generik.
      logEvent("error", "groups_list_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        deviceId: device.id,
        openwaStatus: e.status,
        detail: e.message,
      });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/groups") };
    }
    logEvent("error", "groups_list_failed", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      detail: String(e),
    });
    return { ok: false, status: 500, error: "Gagal mengambil daftar grup" };
  }
}
