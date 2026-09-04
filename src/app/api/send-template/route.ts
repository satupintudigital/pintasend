import { auth } from "@/lib/auth";
import { executeSendTemplate } from "@/lib/sendTemplate";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// Kirim template pesan DARI DASHBOARD (tenant non-API). Auth: session login
// (bukan API key) — keyId diisi "dashboard:{userId}" agar bucket rate limit
// terpisah dari bucket API key tenant. Logika bisnis dipakai ulang dari
// `executeSendTemplate` (v1/messages/send-template): validasi, kuota, pilih
// device, kirim via OpenWA, catat riwayat.
export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  if (!tenantId || !userId) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "x-request-id": requestId } },
    );
  }

  let body: { deviceId?: unknown; to?: unknown; templateName?: unknown; vars?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json(
      { error: "Body harus berupa JSON" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const templateName = typeof body?.templateName === "string" ? body.templateName.trim() : "";
  const vars = body?.vars as Record<string, string> | undefined;

  if (!deviceId || !to || !templateName) {
    return Response.json(
      { error: "deviceId, to, dan templateName wajib diisi" },
      { status: 400, headers: { "x-request-id": requestId } },
    );
  }

  const result = await executeSendTemplate(
    {
      deviceId,
      to,
      templateName,
      ...(vars !== undefined ? { vars } : {}),
    },
    { tenantId, keyId: `dashboard:${userId}`, requestId },
  );

  if (!result.ok) {
    logEvent("warn", "dashboard_send_template_failed", requestId, {
      tenantId,
      userId,
      status: result.status,
      error: result.error,
    });
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
