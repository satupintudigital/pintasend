import { verifyApiKey } from "@/lib/authStore";
import { executeGetPresence } from "@/lib/presence";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// GET /v1/devices/:deviceId/presence/:chatId — get presence status for a chat

export async function GET(
  req: Request,
  { params }: { params: Promise<{ deviceId: string; chatId: string }> }
) {
  const requestId = getRequestId(req);
  const { deviceId, chatId: rawChatId } = await params;

  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json({ error: "API key tidak valid" }, { status: 401, headers: { "x-request-id": requestId } });
  }
  logEvent("info", "api_key_auth", requestId, { ok: true, tenantId: verified.tenantId, keyId: verified.keyId });

  // Decode chatId from URL (contains @ and .)
  const chatId = decodeURIComponent(rawChatId);

  const result = await executeGetPresence(deviceId, chatId, { tenantId: verified.tenantId, keyId: verified.keyId, requestId });

  if (!result.ok) {
    return Response.json({ error: result.error }, {
      status: result.status,
      headers: { "x-request-id": requestId, ...(result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {}) },
    });
  }
  return Response.json(result.body, { status: result.status, headers: { "x-request-id": requestId } });
}
