import { verifyApiKey } from "@/lib/authStore";
import { executeSendRichMessage } from "@/lib/sendRichMessage";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// API publik pihak ketiga: kirim pesan lokasi (SendLocationDto OpenWA).
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

  let body: {
    to?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    description?: unknown;
    address?: unknown;
    replyTo?: unknown;
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

  const result = await executeSendRichMessage(
    "location",
    {
      to: typeof body?.to === "string" ? body.to.trim() : "",
      latitude: body?.latitude as number | undefined,
      longitude: body?.longitude as number | undefined,
      ...(typeof body?.description === "string" ? { description: body.description } : {}),
      ...(typeof body?.address === "string" ? { address: body.address } : {}),
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
