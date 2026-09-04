// Service layer untuk POST /v1/messages/edit — edit teks pesan terkirim.
// Pola sama markChatRead.ts: normalisasi → rate limit → pilih device → OpenWA.

import { normalizeChatId } from "./chat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

const MAX_TEXT_LENGTH = 4096;

export interface EditMessageContext {
  tenantId: string;
  keyId: string;
  requestId: string;
}

export interface EditMessageInput {
  chatId: string;
  messageId: string;
  text: string;
  mentions?: string[];
  deviceId?: string;
}

export type EditMessageResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

export async function executeEditMessage(
  input: EditMessageInput,
  ctx: EditMessageContext,
): Promise<EditMessageResult> {
  // 1. Normalisasi chatId.
  const chatId = normalizeChatId(input.chatId);
  if (!chatId) {
    return { ok: false, status: 400, error: "chatId tidak valid. Gunakan format 6281234567890 atau JID" };
  }

  // 2. Validasi messageId.
  const messageId = input.messageId?.trim();
  if (!messageId) {
    return { ok: false, status: 400, error: "messageId wajib diisi" };
  }

  // 3. Validasi text.
  const text = input.text?.trim();
  if (!text) {
    return { ok: false, status: 400, error: "text wajib diisi" };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { ok: false, status: 400, error: `text maksimal ${MAX_TEXT_LENGTH} karakter` };
  }

  // 4. Rate limit.
  const rl = await checkRateLimit(`v1-messages-edit:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) {
    logEvent("warn", "edit_rate_limited", ctx.requestId, { tenantId: ctx.tenantId, retryAfterSec: rl.retryAfterSec });
    return { ok: false, status: 429, error: "Terlalu banyak permintaan. Coba lagi nanti.", retryAfterSec: rl.retryAfterSec };
  }

  // 5. Pilih device.
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
      error: input.deviceId ? "Device tidak ditemukan untuk tenant ini" : "Belum ada device yang tersambung (status ready)",
    };
  }
  if (device.status !== "ready") {
    return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };
  }

  // 6. Edit via OpenWA.
  try {
    await openwa.editMessage(device.openwaSessionId, chatId, messageId, {
      text,
      ...(input.mentions?.length ? { mentions: input.mentions } : {}),
    });
    logEvent("info", "edit_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId: device.id, chatId, messageId });
    return { ok: true, status: 200, body: { ok: true, deviceId: device.id, chatId, messageId, edited: true } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "edit_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId: device.id, chatId, messageId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/messages/edit") };
    }
    logEvent("error", "edit_failed", ctx.requestId, { tenantId: ctx.tenantId, deviceId: device.id, chatId, messageId, detail: String(e) });
    return { ok: false, status: 500, error: "Gagal mengedit pesan" };
  }
}
