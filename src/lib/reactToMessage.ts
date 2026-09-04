// Service layer untuk POST /v1/messages/react — memberi/menghapus reaksi emoji
// ke pesan WhatsApp (ReactMessageDto OpenWA). Pola sama blockContact.ts (SRP):
// validasi → rate limit → pilih device ready → kirim via OpenWA. Reaksi TIDAK
// menghitung kuota pesan bulanan (bukan pesan baru) dan tidak dicatat di riwayat
// pesan (status reaksi bisa dibaca via webhook message.reaction).

import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { logEvent } from "./requestLogger";

export interface ReactContext {
  tenantId: string;
  keyId: string;
  /** Id korelasi (X-Request-Id) — dipakai di semua log event request ini. */
  requestId: string;
}

export interface ReactInput {
  /** JID chat (…@c.us / …@g.us). */
  chatId: string;
  /** ID pesan (engine-specific, sama seperti replyTo/quotedMessageId). */
  messageId: string;
  /** Emoji; string kosong = hapus reaksi. */
  emoji: string;
  /** Device tertentu (opsional); tanpa ini → device ready pertama tenant. */
  deviceId?: string;
}

export type ReactResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

const MAX_EMOJI_LENGTH = 32;

export async function executeReactToMessage(
  input: ReactInput,
  ctx: ReactContext,
): Promise<ReactResult> {
  // 1. Validasi input.
  const chatId = input.chatId.trim();
  const messageId = input.messageId.trim();
  const emoji = input.emoji;
  if (!chatId) return { ok: false, status: 400, error: 'Field "chatId" wajib diisi' };
  if (!messageId) return { ok: false, status: 400, error: 'Field "messageId" wajib diisi' };
  if (emoji.length > MAX_EMOJI_LENGTH) {
    return { ok: false, status: 400, error: `"emoji" maksimal ${MAX_EMOJI_LENGTH} karakter` };
  }

  // 2. Rate limit per API key — bucket terpisah dari kirim pesan.
  const rl = await checkRateLimit(`v1-messages-react:key:${ctx.keyId}`, 120, 60_000);
  if (!rl.allowed) {
    logEvent("warn", "react_rate_limited", ctx.requestId, {
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

  // 4. Kirim reaksi via OpenWA.
  try {
    await openwa.react(device.openwaSessionId, chatId, messageId, emoji);
    logEvent("info", "react_success", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      chatId,
      messageId,
      emoji: emoji || "(hapus)",
    });
    return {
      ok: true,
      status: 200,
      body: { ok: true, deviceId: device.id, chatId, messageId, emoji },
    };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "react_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        deviceId: device.id,
        chatId,
        messageId,
        openwaStatus: e.status,
        detail: e.message,
      });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/messages/react") };
    }
    logEvent("error", "react_failed", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      chatId,
      messageId,
      detail: String(e),
    });
    return { ok: false, status: 500, error: "Gagal memproses reaksi" };
  }
}
