import { verifyApiKey } from "@/lib/authStore";
import { executeSendTemplate } from "@/lib/sendTemplate";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// API publik pihak ketiga: kirim template pesan yang disimpan di OpenWA.
// Auth: Authorization: Bearer <API key> (sama dengan /v1/messages).
//
// Route THIN (SRP): verifikasi API key → delegasi logika bisnis ke
// `src/lib/sendTemplate.ts` (validasi, rate limit, kuota, pilih device, kirim
// via OpenWA, catat log) → map hasil ke Response.

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

  let body: { to?: unknown; templateName?: unknown; vars?: unknown; deviceId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "Body harus berupa JSON" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const templateName = typeof body?.templateName === "string" ? body.templateName.trim() : "";
  const vars = body?.vars as Record<string, string> | undefined;
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";

  const result = await executeSendTemplate(
    {
      to,
      templateName,
      ...(vars !== undefined ? { vars } : {}),
      ...(deviceId ? { deviceId } : {}),
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
