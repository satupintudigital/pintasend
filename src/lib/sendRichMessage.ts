// Service layer untuk POST /v1/messages/location|contact|poll — kirim pesan
// kaya (selain teks/media): lokasi, kartu kontak, poll WhatsApp. Pola sama
// seperti sendTemplate.ts / blockContact.ts (SRP): validasi → rate limit →
// kuota → pilih device ready → kirim via OpenWA → catat log. Route hanya
// verifikasi API key lalu delegasi ke sini.

import { normalizeChatId } from "./chat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError, type OpenwaSendResult } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { insertMessageLog } from "./messageStore";
import { logEvent } from "./requestLogger";
import { getTenantConfig } from "./tenantConfig";
import { prepaidSendGate, spendCredit } from "./credit";
import { uuidv7 } from "./uuidv7";

export type RichMessageKind = "location" | "contact" | "poll";

export interface RichMessageContext {
  tenantId: string;
  keyId: string;
  /** Id korelasi (X-Request-Id) — dipakai di semua log event request ini. */
  requestId: string;
}

export interface RichMessageInput {
  /** Nomor (0812…, 62812…) atau JID lengkap. */
  to: string;
  /** Device tertentu (opsional); tanpa ini → device ready pertama tenant. */
  deviceId?: string;
  /** Field khusus location. */
  latitude?: number;
  longitude?: number;
  description?: string;
  address?: string;
  /** Field khusus contact. */
  contactName?: string;
  contactNumber?: string;
  /** Field khusus poll. */
  name?: string;
  options?: string[];
  allowMultipleAnswers?: boolean;
  /** quotedMessageId — jadikan pesan ini balasan ke pesan sebelumnya. */
  replyTo?: string;
}

export type RichMessageResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

const bad = (error: string): RichMessageResult => ({ ok: false, status: 400, error });

/** Validasi field khusus per jenis pesan. */
function validateKind(
  kind: RichMessageKind,
  input: RichMessageInput,
): RichMessageResult | null {
  if (kind === "location") {
    const lat = input.latitude;
    const lng = input.longitude;
    if (typeof lat !== "number" || Number.isNaN(lat) || typeof lng !== "number" || Number.isNaN(lng)) {
      return bad('Field "latitude" dan "longitude" wajib berupa angka');
    }
    if (lat < -90 || lat > 90) return bad('"latitude" harus antara -90 dan 90');
    if (lng < -180 || lng > 180) return bad('"longitude" harus antara -180 dan 180');
    return null;
  }
  if (kind === "contact") {
    const name = input.contactName?.trim() ?? "";
    const number = input.contactNumber?.trim() ?? "";
    if (!name) return bad('Field "contactName" wajib diisi');
    if (!number) return bad('Field "contactNumber" wajib diisi');
    if (name.length > 255) return bad('"contactName" maksimal 255 karakter');
    if (number.length > 30) return bad('"contactNumber" maksimal 30 karakter');
    return null;
  }
  // poll
  const name = input.name?.trim() ?? "";
  const options = input.options;
  if (!name) return bad('Field "name" (pertanyaan poll) wajib diisi');
  if (name.length > 255) return bad('"name" maksimal 255 karakter');
  if (!Array.isArray(options) || options.length < 2 || options.length > 12) {
    return bad('"options" wajib berupa array 2–12 pilihan');
  }
  if (options.some((o) => typeof o !== "string" || !o.trim() || o.length > 100)) {
    return bad('Setiap pilihan wajib teks non-kosong maksimal 100 karakter');
  }
  return null;
}

/** Label riwayat + tipe log per jenis pesan. */
function kindLabel(kind: RichMessageKind, input: RichMessageInput): { body: string; type: string } {
  switch (kind) {
    case "location":
      return { body: input.description?.trim() || `Lokasi (${input.latitude}, ${input.longitude})`, type: "location" };
    case "contact":
      return { body: `Kontak: ${input.contactName?.trim() ?? ""}`, type: "contact" };
    case "poll":
      return { body: `Poll: ${input.name?.trim() ?? ""}`, type: "poll" };
  }
}

export async function executeSendRichMessage(
  kind: RichMessageKind,
  input: RichMessageInput,
  ctx: RichMessageContext,
): Promise<RichMessageResult> {
  // 1. Validasi input khusus jenis.
  const kindErr = validateKind(kind, input);
  if (kindErr) return kindErr;

  // 2. Normalisasi nomor → chatId.
  const chatId = normalizeChatId(input.to);
  if (!chatId) {
    return bad("Nomor tidak valid. Gunakan format 6281234567890 atau 081234567890");
  }

  // 3. Rate limit per API key — bucket terpisah dari kirim teks/media.
  const rl = await checkRateLimit(`v1-messages-${kind}:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) {
    logEvent("warn", "send_rich_rate_limited", ctx.requestId, {
      tenantId: ctx.tenantId,
      keyId: ctx.keyId,
      kind,
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

  // 4b. Kuota pesan bulan berjalan — pesan kaya tetap menghitung kuota (1 pesan).
  const maxMsg = cfg.plan.maxMessagesPerMonth;
  if (maxMsg !== null && cfg.messageCount >= maxMsg) {
    logEvent("warn", "send_rich_quota_exceeded", ctx.requestId, {
      tenantId: ctx.tenantId,
      kind,
      used: cfg.messageCount,
      max: maxMsg,
    });
    return {
      ok: false,
      status: 429,
      error: `Kuota pesan bulan ini tercapai (${cfg.messageCount}/${maxMsg}). Coba lagi bulan depan atau hubungi admin untuk upgrade plan.`,
    };
  }

  // 4c. Gate prepaid (Espresso): saldo pulsa ≥ 1 pesan sebelum kirim.
  const creditGate = await prepaidSendGate(cfg.plan.kind, ctx.tenantId, 1);
  if (!creditGate.ok) {
    logEvent("warn", "send_rich_insufficient_credit", ctx.requestId, {
      tenantId: ctx.tenantId,
      kind,
      balance: creditGate.balance,
    });
    return {
      ok: false,
      status: 402,
      error: `Saldo pesan tidak cukup (INSUFFICIENT_CREDIT — sisa ${creditGate.balance}). Lakukan top-up di menu Langganan.`,
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

  // 6. Kirim via OpenWA + catat log keluar (best-effort).
  const sentAt = new Date();
  const log = kindLabel(kind, input);
  try {
    const result: OpenwaSendResult = await (() => {
      switch (kind) {
        case "location":
          return openwa.sendLocation(device.openwaSessionId, chatId, {
            latitude: input.latitude!,
            longitude: input.longitude!,
            ...(input.description ? { description: input.description.trim() } : {}),
            ...(input.address ? { address: input.address.trim() } : {}),
            ...(input.replyTo ? { replyTo: input.replyTo } : {}),
          });
        case "contact":
          return openwa.sendContact(device.openwaSessionId, chatId, {
            contactName: input.contactName!.trim(),
            contactNumber: input.contactNumber!.trim(),
            ...(input.replyTo ? { replyTo: input.replyTo } : {}),
          });
        case "poll":
          return openwa.sendPoll(device.openwaSessionId, chatId, {
            name: input.name!.trim(),
            options: input.options!.map((o) => o.trim()),
            ...(input.allowMultipleAnswers !== undefined ? { allowMultipleAnswers: input.allowMultipleAnswers } : {}),
            ...(input.replyTo ? { replyTo: input.replyTo } : {}),
          });
      }
    })();

    const messageId = result?.messageId ?? result?.id ?? null;
    await insertMessageLog({
      tenantId: ctx.tenantId,
      deviceId: device.id,
      deviceLabel: device.label,
      direction: "outgoing",
      chatId,
      body: log.body,
      type: log.type,
      status: typeof result?.status === "string" ? result.status : "sent",
      messageId,
      mediaUrl: null,
      mimetype: null,
      mediaKey: null,
      triggeredAt: sentAt,
      sentAt,
    }).catch((e) =>
      logEvent("error", "send_rich_log_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        kind,
        detail: String(e),
      }),
    );

    logEvent("info", "send_rich_success", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      chatId,
      kind,
      messageId,
    });

    // Prepaid: potong saldo 1 pesan pasca-kirim (best-effort, refId unik).
    if (cfg.plan.kind === "prepaid") {
      await spendCredit({
        tenantId: ctx.tenantId,
        messages: 1,
        refId: messageId ?? `rich-${uuidv7()}`,
        reason: "send",
      }).catch((e) =>
        logEvent("error", "credit_spend_failed", ctx.requestId, {
          tenantId: ctx.tenantId,
          kind,
          detail: String(e),
        }),
      );
    }

    return {
      ok: true,
      status: 200,
      body: { ok: true, deviceId: device.id, to: chatId, messageId, kind },
    };
  } catch (e) {
    if (e instanceof OpenwaError) {
      await insertMessageLog({
        tenantId: ctx.tenantId,
        deviceId: device.id,
        deviceLabel: device.label,
        direction: "outgoing",
        chatId,
        body: log.body,
        type: log.type,
        status: "failed",
        messageId: null,
        mediaUrl: null,
        mimetype: null,
        mediaKey: null,
        triggeredAt: sentAt,
        sentAt,
      }).catch((err) =>
        logEvent("error", "send_rich_log_failed", ctx.requestId, {
          tenantId: ctx.tenantId,
          kind,
          detail: String(err),
        }),
      );
      logEvent("error", "send_rich_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        deviceId: device.id,
        chatId,
        kind,
        openwaStatus: e.status,
        detail: e.message,
      });
      return { ok: false, status: 502, error: publicOpenwaError(e, `v1/messages/${kind}`) };
    }
    logEvent("error", "send_rich_failed", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      chatId,
      kind,
      detail: String(e),
    });
    return { ok: false, status: 500, error: "Gagal mengirim pesan" };
  }
}
