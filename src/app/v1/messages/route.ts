import { verifyApiKey } from "@/lib/authStore";
import { normalizeChatId } from "@/lib/chat";
import { queryOne } from "@/lib/db";
import { openwa, OpenwaError, type OpenwaSendResult } from "@/lib/openwa";
import { insertMessageLog } from "@/lib/messageStore";
import { parseMediaPayload, type MediaPayload } from "@/lib/media";
import { MultipartError, parseMultipartForm, sanitizeFilename, type MultipartForm } from "@/lib/multipart";
import { putMediaObject } from "@/lib/r2";
import { uuidv7 } from "@/lib/uuidv7";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { checkMessageQuota } from "@/lib/quota";

// API publik pihak ketiga: kirim pesan WhatsApp (teks ATAU media).
// Auth: Authorization: Bearer <API key> (dibuat dari dashboard → D1, 0 Neon utk verifikasi).
//
// Dua format body:
//   1. application/json (teks / media via mediaUrl ATAU mediaBase64) — lihat docs.
//   2. multipart/form-data (upload file biner, "multer-style"):
//        - field : to, mediaType, text (caption), deviceId?, mimetype? (opsional)
//        - file  : name="file" (biner, maks 25 MB)
//      File disimpan ke R2 (bucket wavio-media) lalu dikirim ke OpenWA sebagai
//      base64; key R2 dicatat di riwayat (MessageLog.mediaKey).
//
// Device yang dipakai: deviceId jika diberikan & milik tenant, kalau tidak device ready pertama.

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
// Batas karakter base64 untuk jalur file: file 25 MB → ~33,3 jt karakter base64.
const MAX_BASE64_FILE_CHARS = Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8;

interface UploadFile {
  data: Uint8Array;
  filename: string;
  contentType: string;
}

interface ParsedSend {
  to: string;
  text: string;
  deviceId: string;
  media: MediaPayload | null;
  upload: UploadFile | null;
}

type ParseResult = { ok: true; data: ParsedSend } | { ok: false; error: string; status: number };

const bad = (error: string, status = 400): ParseResult => ({ ok: false, error, status });

async function parseJson(req: Request): Promise<ParseResult> {
  const body = (await req.json().catch(() => null)) as {
    to?: unknown;
    text?: unknown;
    deviceId?: unknown;
    mediaType?: unknown;
    mediaUrl?: unknown;
    mediaBase64?: unknown;
    mimetype?: unknown;
    filename?: unknown;
  } | null;
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  if (!to) return bad('Field "to" wajib diisi');

  // Validasi media (jika ada field mediaType/mediaUrl/mediaBase64) — fail fast.
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
      text,
    });
    if (!parsed.ok) return bad(parsed.error);
    media = parsed.media;
  }

  return { ok: true, data: { to, text, deviceId, media, upload: null } };
}

async function parseMultipart(req: Request): Promise<ParseResult> {
  const contentType = req.headers.get("content-type") ?? "";
  const raw = await req.arrayBuffer().catch(() => null);
  if (!raw) return bad("Body multipart tidak dapat dibaca");

  let form: MultipartForm;
  try {
    form = parseMultipartForm(new Uint8Array(raw), contentType, {
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
    },
  };
}

export async function POST(req: Request) {
  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    return Response.json({ error: "API key tidak valid atau telah dicabut" }, { status: 401 });
  }
  const tenantId = verified.tenantId;

  // Kuota pesan bulan berjalan (WIB) — hard block sebelum memproses body.
  const quota = await checkMessageQuota(tenantId);
  if (!quota.ok) {
    return Response.json(
      {
        error: `Kuota pesan bulan ini tercapai (${quota.used}/${quota.max}). Coba lagi bulan depan atau hubungi admin untuk upgrade plan.`,
      },
      { status: 429 },
    );
  }

  const rl = await checkRateLimit(`v1-messages:${tenantId}:${clientIp(req)}`, 60, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const contentType = req.headers.get("content-type") ?? "";
  const parsed = contentType.includes("multipart/form-data")
    ? await parseMultipart(req)
    : await parseJson(req);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });
  const { to, text, deviceId, media, upload } = parsed.data;

  if (!text && !media) {
    return Response.json(
      { error: "Isi \"text\" atau media (mediaType + mediaUrl/mediaBase64/file)" },
      { status: 400 },
    );
  }
  if (text.length > 4096) {
    return Response.json({ error: "Text maksimal 4096 karakter" }, { status: 400 });
  }

  // Normalisasi nomor: 0812… → 62812…; 62812… dibiarkan; buang non-digit.
  const chatId = normalizeChatId(to);
  if (!chatId) {
    return Response.json(
      { error: "Nomor tidak valid. Gunakan format 6281234567890 atau 081234567890" },
      { status: 400 },
    );
  }

  // Pilih device: sesuai deviceId, atau device ready pertama milik tenant.
  const device = deviceId
    ? await queryOne<{ id: string; label: string; openwaSessionId: string; status: string }>(
        'SELECT id, label, "openwaSessionId", status FROM "Device" WHERE id = $1 AND "tenantId" = $2',
        [deviceId, tenantId],
      )
    : await queryOne<{ id: string; label: string; openwaSessionId: string; status: string }>(
        'SELECT id, label, "openwaSessionId", status FROM "Device" WHERE "tenantId" = $1 AND status = $2 ORDER BY "updatedAt" DESC LIMIT 1',
        [tenantId, "ready"],
      );

  if (!device) {
    return Response.json(
      {
        error: deviceId
          ? "Device tidak ditemukan untuk tenant ini"
          : "Belum ada device yang tersambung (status ready)",
      },
      { status: deviceId ? 404 : 409 },
    );
  }
  if (device.status !== "ready") {
    return Response.json(
      { error: `Device \"${device.id}\" tidak siap (status: ${device.status})` },
      { status: 409 },
    );
  }

  // Upload file ke R2 — hanya setelah device ready (hindari tulis sia-sia).
  let mediaKey: string | null = null;
  if (upload) {
    const key = `${tenantId}/${uuidv7()}-${upload.filename}`;
    try {
      await putMediaObject(key, upload.data, upload.contentType);
      mediaKey = key;
    } catch (e) {
      console.error("v1/messages: simpan media ke R2 gagal:", e);
      return Response.json({ error: "Gagal menyimpan media (R2). Coba lagi." }, { status: 500 });
    }
  }

  // Label untuk riwayat: caption media, filename, atau tipe; teks biasa apa adanya.
  const logBody = media ? (media.caption ?? media.filename ?? "") : text;
  const logType = media ? media.mediaType : "text";

  try {
    const result: OpenwaSendResult = media
      ? await openwa.sendMedia(device.openwaSessionId, chatId, media.mediaType, {
          ...(media.url ? { url: media.url } : {}),
          ...(media.base64 ? { base64: media.base64, mimetype: media.mimetype } : {}),
          ...(media.filename ? { filename: media.filename } : {}),
          ...(media.caption ? { caption: media.caption } : {}),
        })
      : await openwa.sendText(device.openwaSessionId, chatId, text);

    // Catat pesan KELUAR (best-effort; kegagalan log tidak memengaruhi respons).
    const messageId = result?.messageId ?? result?.id ?? null;
    insertMessageLog({
      tenantId,
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
    }).catch((e) => console.error("v1/messages: catat pesan keluar gagal:", e));
    return Response.json({
      ok: true,
      deviceId: device.id,
      to: chatId,
      messageId,
      ...(media ? { mediaType: media.mediaType } : {}),
      ...(mediaKey ? { stored: "r2" } : {}),
    });
  } catch (e) {
    if (e instanceof OpenwaError) {
      // Catat kegagalan ke riwayat (status failed) agar terlihat di dashboard.
      insertMessageLog({
        tenantId,
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
      }).catch((err) => console.error("v1/messages: catat gagal kirim:", err));
      return Response.json({ error: `OpenWA: ${e.message}` }, { status: 502 });
    }
    console.error("v1/messages:", e);
    return Response.json({ error: "Gagal mengirim pesan" }, { status: 500 });
  }
}
