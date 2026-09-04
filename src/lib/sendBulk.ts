// Service layer untuk POST /v1/messages/send-bulk — broadcast ke banyak
// penerima via batch async OpenWA (SendBulkMessageDto). Pola sama sendTemplate.ts
// (SRP): validasi → rate limit → KUOTA PER PENERIMA → pilih device ready → kirim
// batch via OpenWA → catat log ringkasan.
//
// Catatan kuota: bulk menghitung kuota pesan bulanan PER PENERIMA (kirim ke N
// nomor = N pesan kuota) — keputusan produk yang disepakati, agar broadcast
// tidak bisa menyalahi limit plan.

import { normalizeChatId } from "./chat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { insertMessageLog } from "./messageStore";
import { logEvent } from "./requestLogger";
import { getTenantConfig } from "./tenantConfig";

export interface BulkContext {
  tenantId: string;
  keyId: string;
  /** Id korelasi (X-Request-Id) — dipakai di semua log event request ini. */
  requestId: string;
}

export interface BulkItem {
  /** Nomor (0812…, 62812…) atau JID lengkap penerima. */
  to: string;
  type: "text" | "image" | "video" | "audio" | "document";
  content: Record<string, unknown>;
  variables?: Record<string, string>;
}

export interface BulkInput {
  messages: BulkItem[];
  /** Delay antar pesan (ms) — OpenWA clamp 1000–60000. */
  delayBetweenMessages?: number;
  randomizeDelay?: boolean;
  stopOnError?: boolean;
  deviceId?: string;
}

export type BulkResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

const BULK_TYPES: readonly BulkItem["type"][] = ["text", "image", "video", "audio", "document"];
const MAX_BATCH_ITEMS = 100;
const MAX_ITEM_TEXT = 4096;

export async function executeSendBulk(
  input: BulkInput,
  ctx: BulkContext,
): Promise<BulkResult> {
  // 1. Validasi batch.
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    return { ok: false, status: 400, error: '"messages" wajib berupa array non-kosong' };
  }
  if (input.messages.length > MAX_BATCH_ITEMS) {
    return { ok: false, status: 400, error: `"messages" maksimal ${MAX_BATCH_ITEMS} item per batch` };
  }
  if (input.delayBetweenMessages !== undefined) {
    if (
      typeof input.delayBetweenMessages !== "number" ||
      Number.isNaN(input.delayBetweenMessages) ||
      input.delayBetweenMessages < 1000 ||
      input.delayBetweenMessages > 60000
    ) {
      return { ok: false, status: 400, error: '"delayBetweenMessages" harus angka 1000–60000 (ms)' };
    }
  }

  // 2. Normalisasi setiap penerima → chatId JID; validasi tipe & content.
  const messages: { chatId: string; type: BulkItem["type"]; content: Record<string, unknown>; variables?: Record<string, string> }[] = [];
  for (let i = 0; i < input.messages.length; i++) {
    const item = input.messages[i];
    const chatId = normalizeChatId(item?.to ?? "");
    if (!chatId) {
      return { ok: false, status: 400, error: `Nomor tidak valid pada item ke-${i + 1}. Gunakan 6281234567890 atau 081234567890` };
    }
    if (!BULK_TYPES.includes(item?.type)) {
      return { ok: false, status: 400, error: `Tipe pesan tidak didukung pada item ke-${i + 1} (text|image|video|audio|document)` };
    }
    if (!item?.content || typeof item.content !== "object" || Array.isArray(item.content)) {
      return { ok: false, status: 400, error: `"content" wajib objek pada item ke-${i + 1}` };
    }
    if (typeof item.content.text === "string" && item.content.text.length > MAX_ITEM_TEXT) {
      return { ok: false, status: 400, error: `Text maksimal ${MAX_ITEM_TEXT} karakter (item ke-${i + 1})` };
    }
    messages.push({
      chatId,
      type: item.type,
      content: item.content,
      ...(item.variables && Object.keys(item.variables).length ? { variables: item.variables } : {}),
    });
  }

  // 3. Rate limit per API key — bucket terpisah, lebih ketat dari kirim tunggal.
  const rl = await checkRateLimit(`v1-messages-bulk:key:${ctx.keyId}`, 10, 60_000);
  if (!rl.allowed) {
    logEvent("warn", "send_bulk_rate_limited", ctx.requestId, {
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

  // 4. Config tenant (KV cache — 0 Neon queries).
  const cfg = await getTenantConfig(ctx.tenantId);

  // 4b. Kuota pesan bulan berjalan — PER PENERIMA (count = jumlah item batch).
  const count = messages.length;
  const maxMsg = cfg.plan.maxMessagesPerMonth;
  if (maxMsg !== null && (cfg.messageCount + count) > maxMsg) {
    const remaining = Math.max(0, maxMsg - cfg.messageCount);
    logEvent("warn", "send_bulk_quota_exceeded", ctx.requestId, {
      tenantId: ctx.tenantId,
      used: cfg.messageCount,
      max: maxMsg,
      needed: count,
      remaining,
    });
    return {
      ok: false,
      status: 429,
      error: `Kuota pesan bulan ini tidak cukup: butuh ${count} pesan (${cfg.messageCount}/${maxMsg} terpakai, sisa ${remaining}). Kurangi jumlah penerima atau hubungi admin untuk upgrade plan.`,
    };
  }

  // 5. Pilih device — D1 (0 Neon queries).
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

  // 6. Kirim batch async via OpenWA (202) + catat log ringkasan (best-effort).
  const sentAt = new Date();
  try {
    const result = await openwa.sendBulk(device.openwaSessionId, {
      messages,
      ...(input.delayBetweenMessages !== undefined ||
      input.randomizeDelay !== undefined ||
      input.stopOnError !== undefined
        ? {
            options: {
              ...(input.delayBetweenMessages !== undefined ? { delayBetweenMessages: input.delayBetweenMessages } : {}),
              ...(input.randomizeDelay !== undefined ? { randomizeDelay: input.randomizeDelay } : {}),
              ...(input.stopOnError !== undefined ? { stopOnError: input.stopOnError } : {}),
            },
          }
        : {}),
    });

    // Ringkasan batch di riwayat — pesan individual tercatat via webhook ack.
    await insertMessageLog({
      tenantId: ctx.tenantId,
      deviceId: device.id,
      deviceLabel: device.label,
      direction: "outgoing",
      chatId: `bulk:${result.batchId}`,
      body: `Broadcast ${count} pesan (batch ${result.batchId})`,
      type: "bulk",
      status: result.status === "completed" ? "sent" : "sent",
      messageId: null,
      mediaUrl: null,
      mimetype: null,
      mediaKey: null,
      triggeredAt: sentAt,
      sentAt,
    }).catch((e) =>
      logEvent("error", "send_bulk_log_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        detail: String(e),
      }),
    );

    logEvent("info", "send_bulk_success", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      batchId: result.batchId,
      totalMessages: count,
    });

    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        deviceId: device.id,
        batchId: result.batchId,
        status: result.status,
        totalMessages: result.totalMessages,
        estimatedCompletionTime: result.estimatedCompletionTime,
      },
    };
  } catch (e) {
    if (e instanceof OpenwaError) {
      logEvent("error", "send_bulk_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        deviceId: device.id,
        openwaStatus: e.status,
        detail: e.message,
      });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/messages/send-bulk") };
    }
    logEvent("error", "send_bulk_failed", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      detail: String(e),
    });
    return { ok: false, status: 500, error: "Gagal membuat broadcast" };
  }
}
