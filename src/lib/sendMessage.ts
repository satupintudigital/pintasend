// Service layer untuk POST /v1/messages — memisahkan logika bisnis dari route
// handler (SRP). Route `src/app/v1/messages/route.ts` hanya: verifikasi API key
// → panggil executeSendMessage → map hasil ke Response.
//
// Tanggung jawab service (satu per fungsi, SOLID):
//   - parse body (JSON / multipart)  → parseSendRequest
//   - idempotensi (Idempotency-Key)  → cek & simpan record KV
//   - rate limit per API key         → checkRateLimit (keyId, bukan tenant+IP)
//   - kuota pesan bulan berjalan     → checkMessageQuota
//   - pemilihan device               → query Neon scoped tenantId
//   - upload media ke R2             → putMediaObject
//   - delay anti-spam                → getTenantDelayInfo + sleep
//   - kirim ke OpenWA + catat log    → openwa + insertMessageLog

import { normalizeChatId, normalizePhoneNumber } from "./chat";
import { queryD1One } from "./d1";
import { openwa, OpenwaError, publicOpenwaError, type OpenwaSendResult } from "./openwa";
import { insertMessageLog } from "./messageStore";
import { parseMediaPayload, MEDIA_LIMITS, type MediaPayload } from "./media";
import { appendFootnote, resolveWatermarkFootnote } from "./watermark";
import { MultipartError, parseMultipartForm, sanitizeFilename, type MultipartForm } from "./multipart";
import { putMediaObject } from "./r2";
import { uuidv7 } from "./uuidv7";
import { checkRateLimit } from "./rate-limit";
import { getTenantConfig } from "./tenantConfig";
import { prepaidSendGate, spendCredit } from "./credit";
import { randomDelayMs, sleep } from "./delay";
import { logEvent } from "./requestLogger";
import {
  getIdempotencyRecord,
  setIdempotencyRecord,
  isValidIdempotencyKey,
  hashBody,
} from "./idempotency";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
// Batas karakter base64 untuk jalur file: file 25 MB → ~33,3 jt karakter base64.
const MAX_BASE64_FILE_CHARS = Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8;
// Batas panjang isi pesan — sama dengan limit text API (4096 karakter).
const MAX_TEXT_LENGTH = 4096;

interface UploadFile {
  data: Uint8Array;
  filename: string;
  contentType: string;
}

export interface ParsedSend {
  to: string;
  text: string;
  deviceId: string;
  media: MediaPayload | null;
  upload: UploadFile | null;
  /** Nomor yang di-@ (mentions), dinormalisasi ke JID @c.us. */
  mentions: string[];
  /** quotedMessageId — jadikan pesan ini balasan ke pesan sebelumnya. */
  replyTo: string | null;
}

type ParseResult = { ok: true; data: ParsedSend } | { ok: false; error: string; status: number };

const bad = (error: string, status = 400): ParseResult => ({ ok: false, error, status });

/** Konteks terverifikasi — dihasilkan route dari verifyApiKey. */
export interface SendMessageContext {
  tenantId: string;
  keyId: string;
  /** Id korelasi (X-Request-Id) — dipakai di semua log event request ini. */
  requestId: string;
}

export type SendMessageResult =
  | { ok: true; status: 200; body: Record<string, unknown>; headers?: Record<string, string> }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

// ── Parsing body ─────────────────────────────────────────────────────────────
// Normalisasi array mentions (nomor 08…/628…/8…) → JID @c.us. Nomor tidak valid
// → parse gagal (400) sebelum menyentuh OpenWA.
function parseMentions(raw: unknown): { ok: true; mentions: string[] } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, mentions: [] };
  if (!Array.isArray(raw)) return { ok: false, error: '"mentions" harus berupa array nomor' };
  if (raw.length > 50) return { ok: false, error: '"mentions" maksimal 50 nomor' };
  const mentions: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return { ok: false, error: '"mentions" hanya boleh berisi nomor' };
    const digits = normalizePhoneNumber(item.trim());
    if (!digits) {
      return { ok: false, error: `Nomor mention tidak valid: ${item}` };
    }
    mentions.push(`${digits}@c.us`);
  }
  return { ok: true, mentions };
}

function parseJsonFromText(text: string): ParseResult {
  let body: Record<string, unknown> | null;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = null;
  }
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const textMsg = typeof body?.text === "string" ? body.text.trim() : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  if (!to) return bad('Field "to" wajib diisi');

  const mentionsRes = parseMentions(body?.mentions);
  if (!mentionsRes.ok) return bad(mentionsRes.error);
  const replyTo = typeof body?.replyTo === "string" && body.replyTo.trim() ? body.replyTo.trim() : null;
  if (replyTo && replyTo.length > 300) return bad('Field "replyTo" terlalu panjang');

  const hasMediaInput =
    body?.mediaType !== undefined ||
    body?.mediaUrl !== undefined ||
    body?.mediaBase64 !== undefined;
  let media: MediaPayload | null = null;
  if (hasMediaInput) {
    const parsed = parseMediaPayload({
      mediaType: body?.mediaType,
      mediaUrl: body?.mediaUrl,
      mediaBase64: body?.mediaBase64,
      mimetype: body?.mimetype,
      filename: body?.filename,
      text: textMsg,
    });
    if (!parsed.ok) return bad(parsed.error);
    media = parsed.media;
  }

  return { ok: true, data: { to, text: textMsg, deviceId, media, upload: null, mentions: mentionsRes.mentions, replyTo } };
}

function parseMultipartFromBytes(raw: Uint8Array, contentType: string): ParseResult {
  let form: MultipartForm;
  try {
    form = parseMultipartForm(raw, contentType, {
      maxFiles: 1,
      maxFileBytes: MAX_FILE_BYTES,
    });
  } catch (e) {
    if (e instanceof MultipartError) return bad(e.message);
    return bad("multipart/form-data tidak valid");
  }

  const to = (form.fields.to ?? "").trim();
  const text = (form.fields.text ?? "").trim();
  const deviceId = (form.fields.deviceId ?? "").trim();
  const mediaTypeRaw = (form.fields.mediaType ?? "").trim();
  if (!to) return bad('Field "to" wajib diisi');

  const mentionsRes = parseMentions(form.fields.mentions ? JSON.parse(form.fields.mentions) : undefined);
  if (!mentionsRes.ok) return bad(mentionsRes.error);
  const replyTo = typeof form.fields.replyTo === "string" && form.fields.replyTo.trim() ? form.fields.replyTo.trim() : null;

  const file = form.files[0];
  if (!file) return bad('Field file (name="file") wajib ada');
  if (file.data.byteLength === 0) return bad("File kosong");
  if (file.data.byteLength > MAX_FILE_BYTES) {
    return bad(`File terlalu besar (maks ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
  }

  const mimetype = (form.fields.mimetype ?? "").trim() || file.contentType || "";
  // Buffer tersedia di runtime Worker (nodejs_compat aktif di wrangler.jsonc).
  const base64 = Buffer.from(file.data).toString("base64");

  const parsed = parseMediaPayload(
    {
      mediaType: mediaTypeRaw,
      mediaBase64: base64,
      mimetype,
      filename: file.filename ?? "",
      text,
    },
    { maxBase64Chars: MAX_BASE64_FILE_CHARS },
  );
  if (!parsed.ok) return bad(parsed.error);

  return {
    ok: true,
    data: {
      to,
      text,
      deviceId,
      media: parsed.media,
      upload: {
        data: file.data,
        filename: sanitizeFilename(file.filename ?? ""),
        contentType: mimetype,
      },
      mentions: mentionsRes.mentions,
      replyTo,
    },
  };
}

/** Baca raw body sekali (byte) + parse sesuai content-type. */
async function parseSendRequest(
  req: Request,
): Promise<{ parsed: ParseResult; raw: Uint8Array }> {
  const contentType = req.headers.get("content-type") ?? "";
  const raw = new Uint8Array(await req.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (raw.byteLength === 0) return { parsed: bad("Body kosong atau tidak dapat dibaca"), raw };

  const parsed = contentType.includes("multipart/form-data")
    ? parseMultipartFromBytes(raw, contentType)
    : parseJsonFromText(new TextDecoder().decode(raw));
  return { parsed, raw };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────
/**
 * Alur lengkap kirim pesan. Mengembalikan hasil terstruktur (bukan Response)
 * agar route tinggal memetakan — dan service bisa di-unit-test.
 */
export async function executeSendMessage(
  req: Request,
  ctx: SendMessageContext,
): Promise<SendMessageResult> {
  // 1. Idempotency-Key (opsional): validasi format dulu.
  const idemKey = (req.headers.get("idempotency-key") ?? "").trim();
  if (idemKey && !isValidIdempotencyKey(idemKey)) {
    return {
      ok: false,
      status: 400,
      error: "Idempotency-Key tidak valid (8–128 karakter, hanya huruf/angka/._-)",
    };
  }

  // 2. Baca raw body + hash (dipakai idempotensi & parsing).
  const { parsed, raw } = await parseSendRequest(req);
  const bodyHash = idemKey ? await hashBody(raw) : null;

  // 3. Replay idempotensi — SEBELUM kuota/rate limit agar replikasi tidak
  //    menghabiskan kuota. Key sama + hash sama → balas respons asli.
  if (idemKey && bodyHash) {
    const record = await getIdempotencyRecord(ctx.tenantId, idemKey);
    if (record) {
      if (record.bodyHash !== bodyHash) {
        return {
          ok: false,
          status: 400,
          error: "Idempotency-Key sudah dipakai dengan payload berbeda",
        };
      }
      logEvent("info", "idempotency_replay", ctx.requestId, { tenantId: ctx.tenantId });
      return {
        ok: true,
        status: 200,
        body: record.response,
        headers: { "x-wavio-idempotent-replay": "true" },
      };
    }
  }

  // 4. Rate limit per API key (keyId = identitas, bukan tenant+IP).
  const rl = await checkRateLimit(`v1-messages:key:${ctx.keyId}`, 60, 60_000);
  if (!rl.allowed) {
    logEvent("warn", "send_rate_limited", ctx.requestId, {
      tenantId: ctx.tenantId,
      keyId: ctx.keyId,
      retryAfterSec: rl.retryAfterSec,
    });
    return { ok: false, status: 429, error: "Terlalu banyak permintaan. Coba lagi nanti.", retryAfterSec: rl.retryAfterSec };
  }

  // 5. Config tenant (KV cache — 0 Neon queries).
  const cfg = await getTenantConfig(ctx.tenantId);

  // 5b. Kuota pesan bulan berjalan (WIB) — hard block sebelum memproses body.
  const maxMsg = cfg.plan.maxMessagesPerMonth;
  if (maxMsg !== null && cfg.messageCount >= maxMsg) {
    logEvent("warn", "send_quota_exceeded", ctx.requestId, {
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

  // 5c. Gate prepaid (Espresso): saldo pulsa ≥ 1 pesan — tolak sebelum proses
  //     body/kirim (INSUFFICIENT_CREDIT). Plan subscription lolos tanpa query.
  const creditGate = await prepaidSendGate(cfg.plan.kind, ctx.tenantId, 1);
  if (!creditGate.ok) {
    logEvent("warn", "send_insufficient_credit", ctx.requestId, {
      tenantId: ctx.tenantId,
      balance: creditGate.balance,
    });
    return {
      ok: false,
      status: 402,
      error: `Saldo pesan tidak cukup (INSUFFICIENT_CREDIT — sisa ${creditGate.balance}). Lakukan top-up di menu Langganan.`,
    };
  }

  // 6. Validasi hasil parse.
  if (!parsed.ok) return { ok: false, status: parsed.status, error: parsed.error };
  const { to, text, deviceId, media, upload, mentions, replyTo } = parsed.data;

  if (!text && !media) {
    return {
      ok: false,
      status: 400,
      error: 'Isi "text" atau media (mediaType + mediaUrl/mediaBase64/file)',
    };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { ok: false, status: 400, error: `Text maksimal ${MAX_TEXT_LENGTH} karakter` };
  }

  // Normalisasi nomor: 0812… → 62812…; 62812… dibiarkan; buang non-digit.
  const chatId = normalizeChatId(to);
  if (!chatId) {
    return {
      ok: false,
      status: 400,
      error: "Nomor tidak valid. Gunakan format 6281234567890 atau 081234567890",
    };
  }

  // 7. Pilih device — D1 (0 Neon queries).
  const device = deviceId
    ? await queryD1One<{ id: string; label: string; openwaSessionId: string; status: string }>(
        'SELECT id, label, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?',
        [deviceId, ctx.tenantId],
      )
    : await queryD1One<{ id: string; label: string; openwaSessionId: string; status: string }>(
        'SELECT id, label, openwaSessionId, status FROM Device WHERE tenantId = ? AND status = ? ORDER BY updatedAt DESC LIMIT 1',
        [ctx.tenantId, "ready"],
      );

  if (!device) {
    return {
      ok: false,
      status: deviceId ? 404 : 409,
      error: deviceId
        ? "Device tidak ditemukan untuk tenant ini"
        : "Belum ada device yang tersambung (status ready)",
    };
  }
  if (device.status !== "ready") {
    return {
      ok: false,
      status: 409,
      error: `Device "${device.id}" tidak siap (status: ${device.status})`,
    };
  }

  // 8. Upload file ke R2 — hanya setelah device ready (hindari tulis sia-sia).
  let mediaKey: string | null = null;
  if (upload) {
    const key = `${ctx.tenantId}/${uuidv7()}-${upload.filename}`;
    try {
      await putMediaObject(key, upload.data, upload.contentType);
      mediaKey = key;
    } catch (e) {
      logEvent("error", "send_media_upload_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        detail: String(e),
      });
      return { ok: false, status: 500, error: "Gagal menyimpan media (R2). Coba lagi." };
    }
  }

  // 7b. Watermark footnote (media iklan platform) — disisipkan ke teks/caption
  //     setiap pesan keluar, KECUALI tenant punya addon remove_watermark aktif.
  //     Dibaca dari KV cache (0 Neon queries).
  const watermark = {
    apply: !cfg.addons.removeWatermark,
    footnote: cfg.addons.removeWatermark ? "" : await resolveWatermarkFootnote(),
  };
  const finalText = media
    ? text
    : watermark.apply
      ? appendFootnote(text, watermark.footnote, MAX_TEXT_LENGTH)
      : text;
  let finalCaption: string | undefined;
  if (media) {
    finalCaption = media.caption;
    // Sticker tidak mendukung caption di WhatsApp — footnote dilewati.
    if (watermark.apply && media.mediaType !== "sticker") {
      finalCaption = appendFootnote(finalCaption ?? "", watermark.footnote, MEDIA_LIMITS.captionMax);
    }
  }

  // Label untuk riwayat: caption media, filename, atau tipe; teks biasa apa adanya.
  const logBody = media ? (finalCaption ?? media.filename ?? "") : finalText;
  const logType = media ? media.mediaType : "text";

  // 9. Random delay anti-spam (fitur per tenant, 3–10 dtk acak).
  //     Dibaca dari KV cache (0 Neon queries).
  const delayActive = cfg.features.delayEnabled && (cfg.plan.includesDelay || cfg.addons.randomDelay);
  const triggeredAt = new Date();
  let delayMs: number | null = null;
  if (delayActive) {
    delayMs = randomDelayMs();
    await sleep(delayMs);
  }
  const sentAt = new Date();

  // 10. Kirim ke OpenWA. mentions (JID @c.us) & replyTo (quotedMessageId)
  //     diteruskan apa adanya — kontrak OpenWA v0.22 (send-text/media).
  try {
    const sendOptions = {
      ...(mentions.length ? { mentions } : {}),
      ...(replyTo ? { replyTo } : {}),
    };
    const hasOptions = Object.keys(sendOptions).length > 0;
    const result: OpenwaSendResult = media
      ? await openwa.sendMedia(device.openwaSessionId, chatId, media.mediaType, {
          ...(media.url ? { url: media.url } : {}),
          ...(media.base64 ? { base64: media.base64, mimetype: media.mimetype } : {}),
          ...(media.filename ? { filename: media.filename } : {}),
          ...(finalCaption ? { caption: finalCaption } : {}),
          ...sendOptions,
        })
      : hasOptions
        ? await openwa.sendText(device.openwaSessionId, chatId, finalText, sendOptions)
        : await openwa.sendText(device.openwaSessionId, chatId, finalText);

    // Catat pesan KELUAR (best-effort; kegagalan log tidak memengaruhi respons).
    const messageId = result?.messageId ?? result?.id ?? null;
    await insertMessageLog({
      tenantId: ctx.tenantId,
      deviceId: device.id,
      deviceLabel: device.label,
      direction: "outgoing",
      chatId,
      body: logBody,
      type: logType,
      status: typeof result?.status === "string" ? result.status : "sent",
      messageId,
      mediaUrl: media?.url ?? null,
      mimetype: media?.mimetype ?? null,
      mediaKey,
      triggeredAt,
      sentAt,
      watermark: watermark.apply,
    }).catch((e) =>
      logEvent("error", "send_log_failed", ctx.requestId, { tenantId: ctx.tenantId, detail: String(e) }),
    );

    const response: Record<string, unknown> = {
      ok: true,
      deviceId: device.id,
      to: chatId,
      messageId,
      ...(watermark.apply ? { watermark: true } : {}),
      ...(delayMs !== null ? { delayMs } : {}),
      ...(media ? { mediaType: media.mediaType } : {}),
      ...(mediaKey ? { stored: "r2" } : {}),
    };

    logEvent("info", "send_success", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      chatId,
      messageId,
      ...(watermark.apply ? { watermarkApplied: true } : {}),
      ...(delayMs !== null ? { delayMs } : {}),
      ...(media ? { mediaType: media.mediaType } : {}),
    });

    // 10b. Prepaid: potong saldo 1 pesan pasca-kirim sukses. Best-effort
    //     (kegagalan ledger tidak menggagalkan kirim); refId unik per pesan
    //     (messageId OpenWA / fallback uuid) → idempoten di CreditLedger.
    if (cfg.plan.kind === "prepaid") {
      await spendCredit({
        tenantId: ctx.tenantId,
        messages: 1,
        refId: messageId ?? `send-${uuidv7()}`,
        reason: "send",
      }).catch((e) =>
        logEvent("error", "credit_spend_failed", ctx.requestId, {
          tenantId: ctx.tenantId,
          detail: String(e),
        }),
      );
    }

    // 11. Simpan idempotensi HANYA untuk respons sukses — kegagalan tidak
    //     direkam sehingga retry dengan key yang sama diperbolehkan.
    if (idemKey && bodyHash) {
      await setIdempotencyRecord(ctx.tenantId, idemKey, { bodyHash, response }).catch((e) =>
        logEvent("error", "idempotency_store_failed", ctx.requestId, {
          tenantId: ctx.tenantId,
          detail: String(e),
        }),
      );
    }

    return { ok: true, status: 200, body: response };
  } catch (e) {
    if (e instanceof OpenwaError) {
      // Catat kegagalan ke riwayat (status failed) agar terlihat di dashboard.
      await insertMessageLog({
        tenantId: ctx.tenantId,
        deviceId: device.id,
        deviceLabel: device.label,
        direction: "outgoing",
        chatId,
        body: logBody,
        type: logType,
        status: "failed",
        messageId: null,
        mediaUrl: media?.url ?? null,
        mimetype: media?.mimetype ?? null,
        mediaKey,
        triggeredAt,
        sentAt,
        watermark: watermark.apply,
      }).catch((err) =>
        logEvent("error", "send_log_failed", ctx.requestId, { tenantId: ctx.tenantId, detail: String(err) }),
      );
      // Detail internal (status/message) HANYA di log — pesan publik generik.
      logEvent("error", "send_failed", ctx.requestId, {
        tenantId: ctx.tenantId,
        deviceId: device.id,
        chatId,
        openwaStatus: e.status,
        detail: e.message,
      });
      return { ok: false, status: 502, error: publicOpenwaError(e, "v1/messages kirim") };
    }
    logEvent("error", "send_failed", ctx.requestId, {
      tenantId: ctx.tenantId,
      deviceId: device.id,
      chatId,
      detail: String(e),
    });
    return { ok: false, status: 500, error: "Gagal mengirim pesan" };
  }
}
