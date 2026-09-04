import { verifyApiKey } from "@/lib/authStore";
import { createCampaign, listCampaigns } from "@/lib/campaigns";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// API publik modul Campaign — blast massal bertahap (worker HTTP on-demand).
// Auth: Authorization: Bearer <API key>. Route THIN — delegasi ke campaigns.ts.
//
//   GET  /v1/campaigns          → daftar campaign + statistik
//   POST /v1/campaigns          → buat draft: { name, messageBody, deviceId?,
//                                 mediaType?, mediaUrl?, audienceTag?,
//                                 minDelaySec?, maxDelaySec?, scheduledAt? }
// Mulai/jeda/batal → POST /v1/campaigns/:id/{start|pause|resume|cancel}.

function headers(requestId: string): Record<string, string> {
  return { "x-request-id": requestId };
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json({ error: "API key tidak valid atau telah dicabut" }, {
      status: 401,
      headers: headers(requestId),
    });
  }

  const url = new URL(req.url);
  const campaigns = await listCampaigns(verified.tenantId, Number(url.searchParams.get("limit")) || 20);
  return Response.json({ ok: true, campaigns }, { headers: headers(requestId) });
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json({ error: "API key tidak valid atau telah dicabut" }, {
      status: 401,
      headers: headers(requestId),
    });
  }
  logEvent("info", "api_key_auth", requestId, { ok: true, tenantId: verified.tenantId });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400, headers: headers(requestId) });
  }

  const result = await createCampaign(
    {
      name: typeof body.name === "string" ? body.name : "",
      messageBody: typeof body.messageBody === "string" ? body.messageBody : "",
      ...(typeof body.deviceId === "string" && body.deviceId.trim() ? { deviceId: body.deviceId.trim() } : {}),
      ...(typeof body.mediaType === "string" ? { mediaType: body.mediaType } : {}),
      ...(typeof body.mediaUrl === "string" ? { mediaUrl: body.mediaUrl } : {}),
      ...(typeof body.filename === "string" ? { filename: body.filename } : {}),
      ...(typeof body.audienceTag === "string" && body.audienceTag.trim()
        ? { audienceTag: body.audienceTag.trim() }
        : { audienceTag: null }),
      ...(typeof body.minDelaySec === "number" ? { minDelaySec: body.minDelaySec } : {}),
      ...(typeof body.maxDelaySec === "number" ? { maxDelaySec: body.maxDelaySec } : {}),
      ...(typeof body.scheduledAt === "string" && body.scheduledAt.trim()
        ? { scheduledAt: body.scheduledAt }
        : { scheduledAt: null }),
    },
    { tenantId: verified.tenantId, keyId: verified.keyId, requestId },
  );

  if (!result.ok) {
    return Response.json(
      { error: result.error },
      { status: result.status, headers: headers(requestId) },
    );
  }
  return Response.json(result.body, { status: result.status, headers: headers(requestId) });
}
