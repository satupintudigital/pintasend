import { verifyApiKey } from "@/lib/authStore";
import { executeSendBulk } from "@/lib/sendBulk";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// API publik pihak ketiga: broadcast ke banyak penerima (batch async OpenWA).
// Auth: Authorization: Bearer <API key>. Route THIN — delegasi logika ke
// `src/lib/sendBulk.ts` (validasi, kuota per penerima, rate limit, kirim).

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

  let body: {
    messages?: unknown;
    delayBetweenMessages?: unknown;
    randomizeDelay?: unknown;
    stopOnError?: unknown;
    deviceId?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "Body harus berupa JSON" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const result = await executeSendBulk(
    {
      messages: Array.isArray(body?.messages) ? (body.messages as never) : [],
      ...(typeof body?.delayBetweenMessages === "number" ? { delayBetweenMessages: body.delayBetweenMessages } : {}),
      ...(typeof body?.randomizeDelay === "boolean" ? { randomizeDelay: body.randomizeDelay } : {}),
      ...(typeof body?.stopOnError === "boolean" ? { stopOnError: body.stopOnError } : {}),
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
