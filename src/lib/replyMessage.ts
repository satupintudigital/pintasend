// Service layer untuk POST /v1/messages/reply — balas pesan (quote).

import { normalizeChatId } from "./chat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

const MAX_TEXT_LENGTH = 4096;

export interface ReplyMessageContext { tenantId: string; keyId: string; requestId: string; }
export interface ReplyMessageInput { chatId: string; quotedMessageId: string; text: string; mentions?: string[]; deviceId?: string; }
export type ReplyMessageResult = { ok: true; status: 200; body: Record<string, unknown> } | { ok: false; status: number; error: string; retryAfterSec?: number };

export async function executeReplyMessage(input: ReplyMessageInput, ctx: ReplyMessageContext): Promise<ReplyMessageResult> {
  const chatId = normalizeChatId(input.chatId);
  if (!chatId) return { ok: false, status: 400, error: "chatId tidak valid" };
  const quotedMessageId = input.quotedMessageId?.trim();
  if (!quotedMessageId) return { ok: false, status: 400, error: "quotedMessageId wajib diisi" };
  const text = input.text?.trim();
  if (!text) return { ok: false, status: 400, error: "text wajib diisi" };
  if (text.length > MAX_TEXT_LENGTH) return { ok: false, status: 400, error: `text maksimal ${MAX_TEXT_LENGTH} karakter` };

  const rl = await checkRateLimit(`v1-messages-reply:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = input.deviceId
    ? await queryD1One<{ id: string; openwaSessionId: string; status: string }>('SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?', [input.deviceId, ctx.tenantId])
    : await queryD1One<{ id: string; openwaSessionId: string; status: string }>('SELECT id, openwaSessionId, status FROM Device WHERE tenantId = ? AND status = ? ORDER BY updatedAt DESC LIMIT 1', [ctx.tenantId, "ready"]);

  if (!device) return { ok: false, status: input.deviceId ? 404 : 409, error: input.deviceId ? "Device tidak ditemukan" : "Belum ada device ready" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    const result = await openwa.replyMessage(device.openwaSessionId, chatId, quotedMessageId, { text, ...(input.mentions?.length ? { mentions: input.mentions } : {}) });
    logEvent("info", "reply_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId: device.id, chatId, quotedMessageId });
    const newMsgId = result?.messageId ?? result?.id ?? null;
    return { ok: true, status: 200, body: { ok: true, deviceId: device.id, chatId, messageId: newMsgId, replied: true } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "reply_failed", ctx.requestId, { tenantId: ctx.tenantId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/messages/reply") };
    }
    return { ok: false, status: 500, error: "Gagal membalas pesan" };
  }
}
