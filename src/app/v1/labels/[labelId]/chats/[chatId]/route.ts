import { verifyApiKey } from "@/lib/authStore";
import { executeRemoveChatFromLabel } from "@/lib/labels";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// DELETE /v1/labels/:labelId/chats/:chatId — remove chat from label

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ labelId: string; chatId: string }> }
) {
  const requestId = getRequestId(req);
  const { labelId, chatId } = await params;

  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json({ error: "API key tidak valid" }, { status: 401, headers: { "x-request-id": requestId } });
  }
  logEvent("info", "api_key_auth", requestId, { ok: true, tenantId: verified.tenantId, keyId: verified.keyId });

  // Decode chatId from URL (it contains @ and .)
  const decodedChatId = decodeURIComponent(chatId);

  const result = await executeRemoveChatFromLabel(
    labelId,
    decodedChatId,
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
