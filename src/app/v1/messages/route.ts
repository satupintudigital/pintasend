import { verifyApiKey } from "@/lib/authStore";
import { executeSendMessage } from "@/lib/sendMessage";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// API publik pihak ketiga: kirim pesan WhatsApp (teks ATAU media).
// Auth: Authorization: Bearer <API key> (dibuat dari dashboard → D1, 0 Neon utk verifikasi).
//
// Route ini THIN (SRP): verifikasi API key → delegasi logika bisnis ke
// service layer `src/lib/sendMessage.ts` (parsing, idempotensi, rate limit
// per key, kuota, device, upload R2, delay, kirim, log) → map hasil ke
// Response. Semua perilaku di-unit-test di sendMessage.test.ts.
//
// X-Request-Id: dipakai dari header masuk (valid) atau generate uuidv7; diecho
// di header respons & dipakai sebagai korelasi semua log event request (lihat
// src/lib/requestLogger.ts).
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

  const result = await executeSendMessage(req, {
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
          ...(result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {}),
        },
      },
    );
  }
  return Response.json(result.body, {
    status: result.status,
    headers: { "x-request-id": requestId, ...result.headers },
  });
}
