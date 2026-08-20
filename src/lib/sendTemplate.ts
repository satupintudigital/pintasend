// Service layer untuk POST /v1/messages/send-template — mengirim template pesan
// yang disimpan di OpenWA (nama + vars). Pola sama seperti sendMessage.ts
// (SRP): parsing → rate limit → kuota pesan → pilih device ready → kirim via
// OpenWA → catat log. Route hanya verifikasi API key lalu delegasi ke sini.

import { normalizeChatId } from "./chat";
import { queryOne } from "./db";
import { openwa, OpenwaError, publicOpenwaError, type OpenwaSendResult } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { checkMessageQuota } from "./quota";
import { insertMessageLog } from "./messageStore";
import { logEvent } from "./requestLogger";

export interface SendTemplateContext {
  tenantId: string;
  keyId: string;
  /** Id korelasi (X-Request-Id) — dipakai di semua log event request ini. */
  requestId: string;
}

export interface SendTemplateInput {
  /** Nomor (0812…, 62812…) atau JID lengkap. */
  to: string;
  /** Nama template yang disimpan di OpenWA. */
  templateName: string;
  /** Variabel yang disubstitusi ke token {{placeholder}} (opsional). */
  vars?: Record<string, string>;
  /** Device tertentu (opsional); tanpa ini → device ready pertama tenant. */
  deviceId?: string;
}

export type SendTemplateResult =
  | { ok: true; status: 200; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

const MAX_TEMPLATE_NAME = 100;
const MAX_VARS = 50;

export async function executeSendTemplate(
  input: SendTemplateInput,
  ctx: SendTemplateContext,
): Promise<SendTemplateResult> {
  // 1. Validasi input.
  const templateName = input.templateName.trim();
  if (!templateName) {
    return { ok: false, status: 400, error: 'Field "templateName" wajib diisi' };
  }
  if (templateName.length > MAX_TEMPLATE_NAME) {
    return { ok: false, status: 400, error: `"templateName" maksimal ${MAX_TEMPLATE_NAME} karakter` };
  }
  if (input.vars !== undefined) {
    if (
      typeof input.vars !== "object" ||
      input.vars === null ||
      Array.isArray(input.vars) ||
      Object.keys(input.vars).length > MAX_VARS ||
      Object.values(input.vars).some((v) => typeof v !== "string")
    ) {
      return {
        ok: false,
        status: 400,
        error: `"vars" harus berupa objek string (maks ${MAX_VARS} variabel)`,
      };
    }
  }

  // 2. Normalisasi nomor → chatId.
  const chatId = normalizeChatId(input.to);
  if (!chatId) {
    return {
      ok: false,
      status: 400,
      error: "Nomor tidak valid. Gunakan format 6281234567890 atau 081234567890",
    };
  }

  // 3. Rate limit per API key.
  const rl = await checkRateLimit(`v1-messages-template:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) {
    logEvent("warn", "send_template_rate_limited", ctx.requestId, {
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

  // 4. Kuota pesan bulan berjalan — template tetap menghitung kuota (1 pesan).
  const quota = await checkMessageQuota(ctx.tenantId);
  if (!quota.ok) {
    logEvent("warn", "send_template_quota_exceeded", ctx.requestId, {
      tenantId: ctx.tenantId,
      used: quota.used,
      max: quota.max,
    });
    return {
      ok: false,
      status: 429,
      error: `Kuota pesan bulan ini tercapai (${quota.used}/${quota.max}). Coba lagi bulan depan atau hubungi admin untuk upgrade plan.`,
    };
  }

  // 5. Pilih device: deviceId tertentu, atau device ready pertama milik tenant.
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

  // 6. Kirim template via OpenWA + catat log keluar (best-effort).
  const sentAt = new Date();
  try {
    const result: OpenwaSendResult = await openwa.sendTemplate(device.openwaSessionId, chatId, {
      templateName,
      ...(input.vars ? { vars: input.vars } : {}),
    });

    const messageId = result?.messageId ?? result?.id ?? null;
    await insertMessageLog({
      tenantId: ctx.tenantId,
      deviceId: device.id,
      deviceLabel: device.label,
      direction: "outgoing",
      chatId,
      body: templateName,
      type: "template",
      status: typeof result?.status === "string" ? result.status : "sent",
      messageId,
      mediaUrl: null,
      mimetype: null,
      mediaKey: null,
      triggeredAt: sentAt,
      sentAt,
    }).catch((e) =>
      logEvent("error", "send_template_log_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        detail: String(e),
      }),
    );

    logEvent("info", "send_template_success", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      chatId,
      templateName,
      messageId,
    });

    return {
      ok: true,
      status: 200,
      body: { ok: true, deviceId: device.id, to: chatId, messageId, templateName },
    };
  } catch (e) {
    if (e instanceof OpenwaError) {
      await insertMessageLog({
        tenantId: ctx.tenantId,
        deviceId: device.id,
        deviceLabel: device.label,
        direction: "outgoing",
        chatId,
        body: templateName,
        type: "template",
        status: "failed",
        messageId: null,
        mediaUrl: null,
        mimetype: null,
        mediaKey: null,
        triggeredAt: sentAt,
        sentAt,
      }).catch((err) =>
        logEvent("error", "send_template_log_failed", ctx.requestId, {
          tenantId: ctx.tenantId,
          detail: String(err),
        }),
      );
      logEvent("error", "send_template_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        deviceId: device.id,
        chatId,
        templateName,
        openwaStatus: e.status,
        detail: e.message,
      });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/messages/send-template") };
    }
    logEvent("error", "send_template_failed", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      chatId,
      templateName,
      detail: String(e),
    });
    return { ok: false, status: 500, error: "Gagal mengirim template" };
  }
}
