import { verifyApiKey } from "@/lib/authStore";
import { executeGetProfilePicture, executeSetProfilePicture, executeDeleteProfilePicture } from "@/lib/profile";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// GET /v1/devices/:deviceId/profile/picture — get profile picture (stream)
// POST /v1/devices/:deviceId/profile/picture — set profile picture
// DELETE /v1/devices/:deviceId/profile/picture — delete profile picture

export async function GET(req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const requestId = getRequestId(req);
  const { deviceId } = await params;

  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json({ error: "API key tidak valid" }, { status: 401, headers: { "x-request-id": requestId } });
  }
  logEvent("info", "api_key_auth", requestId, { ok: true, tenantId: verified.tenantId, keyId: verified.keyId });

  const result = await executeGetProfilePicture(deviceId, { tenantId: verified.tenantId, keyId: verified.keyId, requestId });

  if (!result.ok) {
    return Response.json({ error: result.error }, {
      status: result.status,
      headers: { "x-request-id": requestId, ...(result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {}) },
    });
  }
  // Stream the image
  return new Response(result.stream, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "x-request-id": requestId,
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const requestId = getRequestId(req);
  const { deviceId } = await params;

  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json({ error: "API key tidak valid" }, { status: 401, headers: { "x-request-id": requestId } });
  }
  logEvent("info", "api_key_auth", requestId, { ok: true, tenantId: verified.tenantId, keyId: verified.keyId });

  let body: { imageBase64?: unknown; mimetype?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400, headers: { "x-request-id": requestId } });
  }

  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
  const mimetype = typeof body?.mimetype === "string" ? body.mimetype : "";

  const result = await executeSetProfilePicture(
    deviceId,
    { imageBase64, mimetype },
    { tenantId: verified.tenantId, keyId: verified.keyId, requestId },
  );

  if (!result.ok) {
    return Response.json({ error: result.error }, {
      status: result.status,
      headers: { "x-request-id": requestId, ...(result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {}) },
    });
  }
  return Response.json(result.body, { status: result.status, headers: { "x-request-id": requestId } });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
  const requestId = getRequestId(req);
  const { deviceId } = await params;

  const authz = req.headers.get("authorization") ?? "";
  const raw = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  const verified = await verifyApiKey(raw);
  if (!verified) {
    logEvent("warn", "api_key_auth", requestId, { ok: false });
    return Response.json({ error: "API key tidak valid" }, { status: 401, headers: { "x-request-id": requestId } });
  }
  logEvent("info", "api_key_auth", requestId, { ok: true, tenantId: verified.tenantId, keyId: verified.keyId });

  const result = await executeDeleteProfilePicture(deviceId, { tenantId: verified.tenantId, keyId: verified.keyId, requestId });

  if (!result.ok) {
    return Response.json({ error: result.error }, {
      status: result.status,
      headers: { "x-request-id": requestId, ...(result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {}) },
    });
  }
  return Response.json(result.body, { status: result.status, headers: { "x-request-id": requestId } });
}
