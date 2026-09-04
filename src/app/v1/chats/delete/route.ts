import { verifyApiKey } from "@/lib/authStore";
import { executeDeleteChat } from "@/lib/deleteChat";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// API publik: hapus chat.

export async function POST(req: Request) {
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
  logEvent("info", "api_key_auth", requestId, { ok: true, tenantId: verified.tenantId, keyId: verified.keyId });

  let body: { chatId?: unknown; deviceId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400, headers: { "x-request-id": requestId } });
  }

  const chatId = typeof body?.chatId === "string" ? body.chatId.trim() : "";
  const deviceId = typeof body?.deviceId === "string" && body.deviceId.trim() ? body.deviceId.trim() : undefined;

  const result = await executeDeleteChat(
    { chatId, deviceId },
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
  return Response.json(result.body, { status: result.status, headers: { "x-request-id": requestId } });
}
