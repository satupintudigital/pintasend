import { verifyApiKey } from "@/lib/authStore";
import { executeSendRichMessage } from "@/lib/sendRichMessage";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// API publik pihak ketiga: kirim kartu kontak (SendContactDto OpenWA).
// Auth: Authorization: Bearer <API key>. Route THIN — delegasi logika ke
// `src/lib/sendRichMessage.ts`.

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

  let body: { to?: unknown; contactName?: unknown; contactNumber?: unknown; replyTo?: unknown; deviceId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "Body harus berupa JSON" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const result = await executeSendRichMessage(
    "contact",
    {
      to: typeof body?.to === "string" ? body.to.trim() : "",
      ...(typeof body?.contactName === "string" ? { contactName: body.contactName } : {}),
      ...(typeof body?.contactNumber === "string" ? { contactNumber: body.contactNumber } : {}),
      ...(typeof body?.replyTo === "string" && body.replyTo.trim() ? { replyTo: body.replyTo.trim() } : {}),
      ...(typeof body?.deviceId === "string" && body.deviceId.trim() ? { deviceId: body.deviceId.trim() } : {}),
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
