import { verifyApiKey } from "@/lib/authStore";
import { executeReadChatHistory } from "@/lib/readChatHistory";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// Baca riwayat chat langsung dari client WhatsApp (bukan DB lokal). Berguna
// untuk mengambil pesan yang tiba sebelum gateway berjalan. Query: limit ·
// includeMedia · deep. Auth: Authorization: Bearer <API key>.
//
// chatId di path bisa berisi karakter URL-encoded (mis. 62812...%40c.us).

export async function GET(
  req: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const requestId = getRequestId(req);

  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json(
      { error: "API key tidak valid atau telah dicabut" },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  const { chatId } = await params;
  const decoded = chatId ? decodeURIComponent(chatId) : "";
  if (!decoded) {
    return Response.json(
      { error: "chatId wajib diisi" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const url = new URL(req.url);
  const rawLimit = url.searchParams.get("limit") ?? "";
  let limit: number | undefined;
  if (rawLimit) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return Response.json(
        { error: "limit harus angka bulat >= 1" },
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }
    limit = parsed;
  }
  const rawOffset = url.searchParams.get("offset") ?? "";
  let offset: number | undefined;
  if (rawOffset) {
    const parsed = Number(rawOffset);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return Response.json(
        { error: "offset harus angka bulat >= 0" },
        { status: 400, headers: { "x-request-id": requestId } },
      );
    }
    offset = parsed;
  }

  // v0.23: after (keyset cursor) & inlineMedia (false = omit media base64).
  const after = url.searchParams.get("after")?.trim() || undefined;
  const rawInline = url.searchParams.get("inlineMedia") ?? "";
  let inlineMedia: boolean | undefined;
  if (rawInline === "false") inlineMedia = false;

  const result = await executeReadChatHistory(
    {
      chatId: decoded,
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
      ...(after ? { after } : {}),
      ...(inlineMedia !== undefined ? { inlineMedia } : {}),
    },
    { tenantId: verified.tenantId, keyId: verified.keyId, requestId },
  );

  if (!result.ok) {
    return Response.json(
      { error: result.error },
      {
        status: result.status,
        headers: {
          "x-request-id": requestId,
          ...(result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {}),
        },
      },
    );
  }
  return Response.json(result.body, {
    status: result.status,
    headers: { "x-request-id": requestId },
  });
}
