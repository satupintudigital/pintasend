// Service layer untuk POST /v1/chats/read — menandai chat dibaca (read receipts).
// Pola sama dengan checkContact.ts / blockContact.ts: normalisasi → rate limit →
// pilih device ready → panggil OpenWA (sessions/:id/chats/read) → map hasil.

import { normalizeChatId } from "./chat";
import { queryOne } from "./db";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface MarkChatReadContext {
  tenantId: string;
  keyId: string;
  /** Id korelasi (X-Request-Id) — dipakai di semua log event request ini. */
  requestId: string;
}

export interface MarkChatReadInput {
  /** Nomor (0812…, 62812…) atau JID lengkap (…@c.us / …@g.us). */
  chatId: string;
  /** Pesan spesifik yang ditandai dibaca (opsional). */
  messageIds?: string[];
  /** Device tertentu (opsional); tanpa ini → device ready pertama tenant. */
  deviceId?: string;
}

export type MarkChatReadResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

export async function executeMarkChatRead(
  input: MarkChatReadInput,
  ctx: MarkChatReadContext,
): Promise<MarkChatReadResult> {
  // 1. Normalisasi chatId → JID.
  const chatId = normalizeChatId(input.chatId);
  if (!chatId) {
    return {
      ok: false,
      status: 400,
      error: "chatId tidak valid. Gunakan format 6281234567890 atau JID (…@c.us / …@g.us)",
    };
  }

  // 2. Validasi messageIds (opsional).
  const messageIds = input.messageIds;
  if (messageIds !== undefined) {
    if (!Array.isArray(messageIds) || messageIds.some((m) => typeof m !== "string" || !m.trim())) {
      return { ok: false, status: 400, error: '"messageIds" harus berupa array string' };
    }
    if (messageIds.length > 100) {
      return { ok: false, status: 400, error: '"messageIds" maksimal 100 pesan' };
    }
  }

  // 3. Rate limit per API key — bucket terpisah dari kirim pesan.
  const rl = await checkRateLimit(`v1-chats-read:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) {
    logEvent("warn", "chats_read_rate_limited", ctx.requestId, {
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

  // 4. Pilih device: deviceId tertentu, atau device ready pertama milik tenant.
  const device = input.deviceId
    ? await queryOne<{ id: string; label: string; openwaSessionId: string; status: string }>(
        'SELECT id, label, "openwaSessionId", status FROM "Device" WHERE id = $1 AND "tenantId" = $2',
        [input.deviceId, ctx.tenantId],
      )
    : await queryOne<{ id: string; label: string; openwaSessionId: string; status: string }>(
        'SELECT id, label, "openwaSessionId", status FROM "Device" WHERE "tenantId" = $1 AND status = $2 ORDER BY "updatedAt" DESC LIMIT 1',
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

  // 5. Mark-read via OpenWA.
  try {
    await openwa.markChatRead(device.openwaSessionId, chatId, messageIds);
    logEvent("info", "chats_read_success", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      chatId,
      messageCount: messageIds?.length ?? null,
    });
    return {
      ok: true,
      status: 200,
      body: { ok: true, deviceId: device.id, chatId, read: true },
    };
  } catch (e) {
    if (e instanceof OpenwaError) {
      // Detail internal (status/message) HANYA di log — pesan publik generik.
      logEvent("error", "chats_read_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        deviceId: device.id,
        chatId,
        openwaStatus: e.status,
        detail: e.message,
      });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/chats/read") };
    }
    logEvent("error", "chats_read_failed", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      chatId,
      detail: String(e),
    });
    return { ok: false, status: 500, error: "Gagal menandai pesan dibaca" };
  }
}
