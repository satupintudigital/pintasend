// Service layer untuk GET /v1/chats — daftar chat aktif (kind, archived, pinned, muted).

import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface ListChatsContext { tenantId: string; keyId: string; requestId: string; }
export interface ListChatsInput { limit?: number; offset?: number; deviceId?: string; }
export type ListChatsResult = { ok: true; status: 200; body: Record<string, unknown> } | { ok: false; status: number; error: string; retryAfterSec?: number };

export async function executeListChats(input: ListChatsInput, ctx: ListChatsContext): Promise<ListChatsResult> {
  const limit = input.limit !== undefined ? Math.min(Math.max(input.limit, 1), 1000) : 100;
  const offset = input.offset !== undefined ? Math.max(input.offset, 0) : 0;

  const rl = await checkRateLimit(`v1-chats:list:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) return { ok: false, status: 429, error: "Terlalu banyak permintaan.", retryAfterSec: rl.retryAfterSec };

  const device = input.deviceId
    ? await queryD1One<{ id: string; openwaSessionId: string; status: string }>('SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?', [input.deviceId, ctx.tenantId])
    : await queryD1One<{ id: string; openwaSessionId: string; status: string }>('SELECT id, openwaSessionId, status FROM Device WHERE tenantId = ? AND status = ? ORDER BY updatedAt DESC LIMIT 1', [ctx.tenantId, "ready"]);

  if (!device) return { ok: false, status: input.deviceId ? 404 : 409, error: input.deviceId ? "Device tidak ditemukan" : "Belum ada device ready" };
  if (device.status !== "ready") return { ok: false, status: 409, error: `Device tidak siap (status: ${device.status})` };

  try {
    const chats = await openwa.listChats(device.openwaSessionId, { limit, offset });
    logEvent("info", "list_chats_success", ctx.requestId, { tenantId: ctx.tenantId, deviceId: device.id, count: chats.length });
    return { ok: true, status: 200, body: { ok: true, deviceId: device.id, chats } };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "list_chats_failed", ctx.requestId, { tenantId: ctx.tenantId, openwaStatus: e.status, detail: e.message });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/chats") };
    }
    return { ok: false, status: 500, error: "Gagal mengambil daftar chat" };
  }
}
