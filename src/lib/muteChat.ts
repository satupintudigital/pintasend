// Service layer untuk POST /v1/chats/mute — mute/unmute chat.

import { normalizeChatId } from "./chat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface MuteChatContext { tenantId: string; keyId: string; requestId: string; }
export interface MuteChatInput { chatId: string; muteUntil?: number | null; deviceId?: string; }
export type MuteChatResult = { ok: true; status: 200; body: Record<string, unknown> } | { ok: false; status: number; error: string; retryAfterSec?: number };

export async function executeMuteChat(input: MuteChatInput, ctx: MuteChatContext): Promise<MuteChatResult> {
  const chatId = normalizeChatId(input.chatId);
  if (!chatId) return { ok: false, status: 400, error: "chatId tidak valid" };

  const rl = await checkRateLimit(`v1-chats-mute:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = input.deviceId
    ? await queryD1One<{ id: string; openwaSessionId: string; status: string }>('SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?', [input.deviceId, ctx.tenantId])
    : await queryD1One<{ id: string; openwaSessionId: string; status: string }>('SELECT id, openwaSessionId, status FROM Device WHERE tenantId = ? AND status = ? ORDER BY updatedAt DESC LIMIT 1', [ctx.tenantId, "ready"]);

  if (!device) return { ok: false, status: input.deviceId ? 404 : 409, error: input.deviceId ? "Device tidak ditemukan" : "Belum ada device ready" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    await openwa.muteChat(device.openwaSessionId, chatId, input.muteUntil);
    const muted = input.muteUntil !== null && input.muteUntil !== undefined;
    logEvent("info", muted ? "mute_success" : "unmute_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId: device.id, chatId });
    return { ok: true, status: 200, body: { ok: true, deviceId: device.id, chatId, muted, muteUntil: input.muteUntil ?? null } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "mute_failed", ctx.requestId, { tenantId: ctx.tenantId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/chats/mute") };
    }
    return { ok: false, status: 500, error: "Gagal mengmute chat" };
  }
}
