import { verifyApiKey } from "@/lib/authStore";
import { executeEditMessage } from "@/lib/editMessage";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// POST /v1/messages/edit — edit teks pesan terkirim.

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json({ error: "API key tidak valid atau telah dicabut" }, { status: 401, headers: { "x-request-id": requestId } });
  }

  let body: { chatId?: unknown; messageId?: unknown; text?: unknown; mentions?: unknown; deviceId?: unknown };
  try { body = (await req.json()) as typeof body; } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400, headers: { "x-request-id": requestId } });
  }

  const result = await executeEditMessage(
    {
      chatId: typeof body?.chatId === "string" ? body.chatId.trim() : "",
      messageId: typeof body?.messageId === "string" ? body.messageId.trim() : "",
      text: typeof body?.text === "string" ? body.text.trim() : "",
      ...(Array.isArray(body?.mentions) ? { mentions: body.mentions as string[] } : {}),
      ...(typeof body?.deviceId === "string" && body.deviceId.trim() ? { deviceId: (body.deviceId as string).trim() } : {}),
    },
    { tenantId: verified.tenantId, keyId: verified.keyId, requestId },
  );

  if (!result.ok) {
    return Response.json({ error: result.error }, {
      status: result.status,
      headers: { "x-request-id": requestId, ...(result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {}) },
    });
  }
  return Response.json(result.body, { status: result.status, headers: { "x-request-id": requestId } });
}
