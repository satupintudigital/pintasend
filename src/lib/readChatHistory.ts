// Service layer untuk GET /v1/messages/:chatId/history — baca riwayat chat
// langsung dari client WhatsApp (bukan DB lokal), berguna untuk mengambil
// pesan yang tiba sebelum gateway berjalan. Pola sama checkContact.ts (SRP):
// validasi → rate limit → pilih device ready → baca via OpenWA.

import { normalizeChatId } from "./chat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface HistoryContext {
  tenantId: string;
  keyId: string;
  /** Id korelasi (X-Request-Id) — dipakai di semua log event request ini. */
  requestId: string;
}

export interface HistoryInput {
  /** Nomor (0812…, 62812…) atau JID lengkap. */
  chatId: string;
  /** Max pesan (1–100, default 50). */
  limit?: number;
  /** Lewati N pesan pertama (paginasi offset). */
  offset?: number;
  /** v0.23: Keyset cursor — id pesan terakhir dari page sebelumnya.
   * Lebih stabil dari offset karena tidak melewatkan/gandakan pesan baru. */
  after?: string;
  /** v0.23: false → omit media base64 dari response (hemat bandwidth). */
  inlineMedia?: boolean;
  /** Device tertentu (opsional); tanpa ini → device ready pertama tenant. */
  deviceId?: string;
}

export type HistoryResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

const MAX_LIMIT = 100;

export async function executeReadChatHistory(
  input: HistoryInput,
  ctx: HistoryContext,
): Promise<HistoryResult> {
  // 1. Normalisasi chatId + validasi limit.
  const chatId = normalizeChatId(input.chatId);
  if (!chatId) {
    return { ok: false, status: 400, error: "chatId tidak valid. Gunakan 6281234567890 atau JID" };
  }
  let limit: number | undefined;
  if (input.limit !== undefined) {
    if (typeof input.limit !== "number" || Number.isNaN(input.limit)) {
      return { ok: false, status: 400, error: '"limit" harus berupa angka' };
    }
    // limit < 1 diabaikan (pakai default OpenWA); > 100 di-clamp.
    limit = input.limit >= 1 ? Math.min(input.limit, MAX_LIMIT) : undefined;
  }
  let offset: number | undefined;
  if (input.offset !== undefined) {
    if (typeof input.offset !== "number" || Number.isNaN(input.offset) || input.offset < 0) {
      return { ok: false, status: 400, error: '"offset" harus angka >= 0' };
    }
    offset = input.offset;
  }
  // after — keyset cursor; validasi ringan (string non-kosong).
  const after = typeof input.after === "string" && input.after.trim() ? input.after.trim() : undefined;
  if (after && input.offset !== undefined) {
    return { ok: false, status: 400, error: 'Gunakan "after" ATAU "offset", bukan keduanya' };
  }
  // inlineMedia — false untuk hemat bandwidth.
  const inlineMedia = input.inlineMedia === false ? false : undefined;

  // 2. Rate limit per API key — bucket terpisah dari kirim pesan.
  const rl = await checkRateLimit(`v1-messages-history:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) {
    logEvent("warn", "history_rate_limited", ctx.requestId, {
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

  // 3. Pilih device: deviceId tertentu, atau device ready pertama milik tenant.
  const device = input.deviceId
    ? await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
        'SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?',
        [input.deviceId, ctx.tenantId],
      )
    : await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
        'SELECT id, openwaSessionId, status FROM Device WHERE tenantId = ? AND status = ? ORDER BY updatedAt DESC LIMIT 1',
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

  // 4. Baca riwayat dari DB lokal OpenWA (didukung semua engine, termasuk
  //    Baileys — beda dari GET .../history engine-based yang 501 di Baileys).
  try {
    const options: { limit?: number; offset?: number; after?: string; inlineMedia?: boolean } = {};
    if (limit !== undefined) options.limit = limit;
    if (offset !== undefined) options.offset = offset;
    if (after !== undefined) options.after = after;
    if (inlineMedia !== undefined) options.inlineMedia = inlineMedia;
    const result = await openwa.listMessages(device.openwaSessionId, chatId, options);
    const messages = Array.isArray(result?.messages) ? result.messages : [];
    logEvent("info", "history_success", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      chatId,
      count: messages.length,
    });
    return {
      ok: true,
      status: 200,
      body: { ok: true, deviceId: device.id, chatId, messages },
    };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "history_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        deviceId: device.id,
        chatId,
        openwaStatus: e.status,
        detail: e.message,
      });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/messages/history") };
    }
    logEvent("error", "history_failed", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      chatId,
      detail: String(e),
    });
    return { ok: false, status: 500, error: "Gagal membaca riwayat chat" };
  }
}
