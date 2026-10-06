import { verifyApiKey } from "@/lib/authStore";
import { executeRadiologyReadyNotification } from "@/lib/imagestro";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// Endpoint integrasi Imagestro: dipanggil saat DICOM forward ke SATUSEHAT SUCCESS.
// Auth: Authorization: Bearer <API key> (tenant-scoped, sama seperti /v1/messages).
// Route THIN — logika kirim (kuota/kredit/device/watermark/log) ada di
// src/lib/sendMessage.ts via executeRadiologyReadyNotification.
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
  logEvent("info", "api_key_auth", requestId, {
    ok: true,
    tenantId: verified.tenantId,
    keyId: verified.keyId,
  });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Body JSON tidak valid" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const result = await executeRadiologyReadyNotification(body, {
    tenantId: verified.tenantId,
    keyId: verified.keyId,
    requestId,
  });

  if (!result.ok) {
    return Response.json(
      { error: result.error },
      {
        status: result.status,
        headers: {
          "x-request-id": requestId,
          ...(result.retryAfterSec
            ? { "Retry-After": String(result.retryAfterSec) }
            : {}),
        },
      },
    );
  }
  return Response.json(result.body, {
    status: result.status,
    headers: { "x-request-id": requestId, ...result.headers },
  });
}
