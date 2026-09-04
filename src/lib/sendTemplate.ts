// Service layer untuk POST /v1/messages/send-template — mengirim template pesan
// yang disimpan di OpenWA (nama + vars). Pola sama seperti sendMessage.ts
// (SRP): parsing → rate limit → kuota pesan → pilih device ready → kirim via
// OpenWA → catat log. Route hanya verifikasi API key lalu delegasi ke sini.

import { normalizeChatId } from "./chat";
import { queryD1One } from "./d1";
import { queryOne } from "./db";
import { openwa, OpenwaError, publicOpenwaError, type OpenwaSendResult } from "./openwa";
import { checkRateLimit } from "./rate-limit";
import { insertMessageLog } from "./messageStore";
import { logEvent } from "./requestLogger";
import { resolveWatermarkFootnote } from "./watermark";
import { getTenantConfig } from "./tenantConfig";

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

interface TemplateBinding {
  physicalTemplateName: string;
  status: string;
  canonicalVersion: number;
}

async function resolveTemplateName(
  tenantId: string,
  deviceId: string,
  canonicalName: string,
): Promise<{ ok: true; name: string } | { ok: false; status: 409; error: string }> {
  const binding = await queryOne<TemplateBinding>(
    'SELECT b."physicalTemplateName", b.status, b."canonicalVersion" FROM "TenantWhatsAppTemplateDevice" b JOIN "TenantWhatsAppTemplate" t ON t.id = b."templateId" WHERE b."tenantId" = $1 AND b."deviceId" = $2 AND t."canonicalName" = $3 ORDER BY b."canonicalVersion" DESC LIMIT 1',
    [tenantId, deviceId, canonicalName],
  );
  // Legacy/manual OpenWA templates remain usable when no canonical catalog row
  // exists. Once a canonical binding exists, never silently send an older
  // physical version while sync is pending or failed.
  if (!binding) return { ok: true, name: canonicalName };
  if (binding.status !== "synced") {
    return { ok: false, status: 409, error: "Template belum tersinkron ke device ini" };
  }
  return { ok: true, name: binding.physicalTemplateName };
}

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

  // 4. Config tenant (KV cache — 0 Neon queries).
  const cfg = await getTenantConfig(ctx.tenantId);

  // 4b. Kuota pesan bulan berjalan — template tetap menghitung kuota (1 pesan).
  const maxMsg = cfg.plan.maxMessagesPerMonth;
  if (maxMsg !== null && cfg.messageCount >= maxMsg) {
    logEvent("warn", "send_template_quota_exceeded", ctx.requestId, {
      tenantId: ctx.tenantId,
      used: cfg.messageCount,
      max: maxMsg,
    });
    return {
      ok: false,
      status: 429,
      error: `Kuota pesan bulan ini tercapai (${cfg.messageCount}/${maxMsg}). Coba lagi bulan depan atau hubungi admin untuk upgrade plan.`,
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

  // 6. Canonical template → physical immutable template OpenWA. Resolver hanya
  //    membaca binding milik tenant+device; nama fisik tidak pernah keluar ke
  //    client. Template legacy tanpa catalog tetap kompatibel.
  const resolved = await resolveTemplateName(ctx.tenantId, device.id, templateName);
  if (!resolved.ok) return resolved;
  const physicalTemplateName = resolved.name;

  // 7. Watermark footnote (media iklan platform) — template OpenWA menyimpan
  //     placeholder `{{watermark}}` di akhir footer (lihat NALA_TEMPLATES),
  //     sehingga vars.watermark selalu dikirim: footnote saat apply, atau string
  //     kosong saat tenant punya addon remove_watermark (placeholder ter-render
  //     bersih tanpa trailing newline). Dibaca dari KV cache (0 Neon queries).
  const watermark = {
    apply: !cfg.addons.removeWatermark,
    footnote: cfg.addons.removeWatermark ? "" : await resolveWatermarkFootnote(),
  };
  const vars = {
    ...(input.vars ?? {}),
    watermark: watermark.apply ? `\n\n${watermark.footnote}` : "",
  };

  // 8. Kirim template via OpenWA + catat log keluar (best-effort).
  const sentAt = new Date();
  try {
    const result: OpenwaSendResult = await openwa.sendTemplate(device.openwaSessionId, chatId, {
      templateName: physicalTemplateName,
      vars,
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
      watermark: watermark.apply,
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
      ...(watermark.apply ? { watermarkApplied: true } : {}),
    });

    return {
      ok: true,
      status: 200,
      body: {
        ok: true,
        deviceId: device.id,
        to: chatId,
        messageId,
        templateName,
        ...(watermark.apply ? { watermark: true } : {}),
      },
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
        watermark: watermark.apply,
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
