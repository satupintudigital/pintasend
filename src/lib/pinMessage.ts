// Service layer untuk POST /v1/messages/pin & unpin — sematkan pesan.

import { normalizeChatId } from "./chat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface PinMessageContext { tenantId: string; keyId: string; requestId: string; }
export interface PinMessageInput { chatId: string; messageId: string; durationSeconds?: number; deviceId?: string; }
export type PinMessageResult = { ok: true; status: 200; body: Record<string, unknown> } | { ok: false; status: number; error: string; retryAfterSec?: number };

const VALID_DURATIONS = new Set([86400, 604800, 2592000]);

export async function executePinMessage(input: PinMessageInput, ctx: PinMessageContext, pin = true): Promise<PinMessageResult> {
  const chatId = normalizeChatId(input.chatId);
  if (!chatId) return { ok: false, status: 400, error: "chatId tidak valid" };
  const messageId = input.messageId?.trim();
  if (!messageId) return { ok: false, status: 400, error: "messageId wajib diisi" };

  if (pin && input.durationSeconds !== undefined && !VALID_DURATIONS.has(input.durationSeconds)) {
    return { ok: false, status: 400, error: "durationSeconds harus 86400 (24h), 604800 (7d), atau 2592000 (30d)" };
  }

  const rl = await checkRateLimit(`v1-messages-pin:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = input.deviceId
    ? await queryD1One<{ id: string; openwaSessionId: string; status: string }>('SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?', [input.deviceId, ctx.tenantId])
    : await queryD1One<{ id: string; openwaSessionId: string; status: string }>('SELECT id, openwaSessionId, status FROM Device WHERE tenantId = ? AND status = ? ORDER BY updatedAt DESC LIMIT 1', [ctx.tenantId, "ready"]);

  if (!device) return { ok: false, status: input.deviceId ? 404 : 409, error: input.deviceId ? "Device tidak ditemukan" : "Belum ada device ready" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    if (pin) {
      await openwa.pinMessage(device.openwaSessionId, chatId, messageId, input.durationSeconds ?? 86400);
    } else {
      await openwa.unpinMessage(device.openwaSessionId, chatId, messageId);
    }
    logEvent("info", pin ? "pin_success" : "unpin_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId: device.id, chatId, messageId });
    return { ok: true, status: 200, body: { ok: true, deviceId: device.id, chatId, messageId, [pin ? "pinned" : "unpinned"]: true } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", pin ? "pin_failed" : "unpin_failed", ctx.requestId, { tenantId: ctx.tenantId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, `v1/messages/${pin ? "pin" : "unpin"}`) };
    }
    return { ok: false, status: 500, error: pin ? "Gagal menyematkan pesan" : "Gagal melepas sematan pesan" };
  }
}
