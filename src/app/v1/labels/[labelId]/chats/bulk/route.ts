import { verifyApiKey } from "@/lib/authStore";
import { executeBulkAddChatsToLabel } from "@/lib/labels";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// POST /v1/labels/:labelId/chats/bulk — bulk add chats to label

export async function POST(
  req: Request,
  { params }: { params: Promise<{ labelId: string }> }
) {
  const requestId = getRequestId(req);
  const { labelId } = await params;

  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json({ error: "API key tidak valid" }, { status: 401, headers: { "x-request-id": requestId } });
  }
  logEvent("info", "api_key_auth", requestId, { ok: true, tenantId: verified.tenantId, keyId: verified.keyId });

  let body: { chatIds?: unknown; deviceId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400, headers: { "x-request-id": requestId } });
  }

  const chatIds = Array.isArray(body?.chatIds) ? (body.chatIds as string[]) : [];
  const deviceId = typeof body?.deviceId === "string" && body.deviceId.trim() ? body.deviceId.trim() : undefined;

  const result = await executeBulkAddChatsToLabel(
    labelId,
    { chatIds, deviceId },
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
