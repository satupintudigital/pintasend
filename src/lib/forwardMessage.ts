// Service layer untuk POST /v1/messages/forward — forward pesan antar chat.

import { normalizeChatId } from "./chat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface ForwardMessageContext { tenantId: string; keyId: string; requestId: string; }
export interface ForwardMessageInput { fromChatId: string; toChatId: string; messageId: string; deviceId?: string; }
export type ForwardMessageResult = { ok: true; status: 200; body: Record<string, unknown> } | { ok: false; status: number; error: string; retryAfterSec?: number };

export async function executeForwardMessage(input: ForwardMessageInput, ctx: ForwardMessageContext): Promise<ForwardMessageResult> {
  const fromChatId = normalizeChatId(input.fromChatId);
  if (!fromChatId) return { ok: false, status: 400, error: "fromChatId tidak valid" };
  const toChatId = normalizeChatId(input.toChatId);
  if (!toChatId) return { ok: false, status: 400, error: "toChatId tidak valid" };
  const messageId = input.messageId?.trim();
  if (!messageId) return { ok: false, status: 400, error: "messageId wajib diisi" };

  const rl = await checkRateLimit(`v1-messages-forward:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = input.deviceId
    ? await queryD1One<{ id: string; openwaSessionId: string; status: string }>('SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?', [input.deviceId, ctx.tenantId])
    : await queryD1One<{ id: string; openwaSessionId: string; status: string }>('SELECT id, openwaSessionId, status FROM Device WHERE tenantId = ? AND status = ? ORDER BY updatedAt DESC LIMIT 1', [ctx.tenantId, "ready"]);

  if (!device) return { ok: false, status: input.deviceId ? 404 : 409, error: input.deviceId ? "Device tidak ditemukan" : "Belum ada device ready" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    const result = await openwa.forwardMessage(device.openwaSessionId, fromChatId, toChatId, messageId);
    logEvent("info", "forward_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId: device.id, fromChatId, toChatId, messageId });
    const newMsgId = result?.messageId ?? result?.id ?? null;
    return { ok: true, status: 200, body: { ok: true, deviceId: device.id, fromChatId, toChatId, messageId: newMsgId, forwarded: true } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "forward_failed", ctx.requestId, { tenantId: ctx.tenantId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/messages/forward") };
    }
    return { ok: false, status: 500, error: "Gagal forward pesan" };
  }
}
