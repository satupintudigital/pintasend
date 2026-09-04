import { verifyApiKey } from "@/lib/authStore";
import { executeListChats } from "@/lib/listChats";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// API publik: daftar chat aktif (kind, archived, pinned, muted).

export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const deviceId = searchParams.get("deviceId") || undefined;
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
  const offset = searchParams.get("offset") ? parseInt(searchParams.get("offset")!, 10) : undefined;

  const result = await executeListChats(
    { deviceId, limit, offset },
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
