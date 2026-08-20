import { verifyApiKey } from "@/lib/authStore";
import { executeBlockContact } from "@/lib/blockContact";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// API publik pihak ketiga: blokir / buka blokir kontak (moderasi spam).
// Auth: Authorization: Bearer <API key> (sama dengan /v1/messages).
//
// Route THIN (SRP): verifikasi API key → delegasi logika bisnis ke
// `src/lib/blockContact.ts` (normalisasi, rate limit per key, pilih device,
// block/unblock via OpenWA) → map hasil ke Response.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const requestId = getRequestId(req);
  const { number } = await params;

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

  const result = await executeBlockContact(
    { number, action: "block", deviceId: deviceId || undefined },
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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const requestId = getRequestId(req);
  const { number } = await params;

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

  const result = await executeBlockContact(
    { number, action: "unblock", deviceId: deviceId || undefined },
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
