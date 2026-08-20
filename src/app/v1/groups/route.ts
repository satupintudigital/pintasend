import { verifyApiKey } from "@/lib/authStore";
import { executeListGroups } from "@/lib/listGroups";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// API publik pihak ketiga: daftar grup WhatsApp pada sebuah device (ready).
// Auth: Authorization: Bearer <API key> (sama dengan /v1/messages).
//
// Route THIN (SRP): verifikasi API key → delegasi logika bisnis ke
// `src/lib/listGroups.ts` (rate limit per key, pilih device, list via OpenWA)
// → map hasil ke Response.

function parseIntParam(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

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
  logEvent("info", "api_key_auth", requestId, {
    ok: true,
    tenantId: verified.tenantId,
    keyId: verified.keyId,
  });

  const url = new URL(req.url);
  const deviceId = (url.searchParams.get("deviceId") ?? "").trim();
  const limit = parseIntParam(url.searchParams.get("limit"));
  const offset = parseIntParam(url.searchParams.get("offset"));

  const result = await executeListGroups(
    { deviceId: deviceId || undefined, limit, offset },
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
