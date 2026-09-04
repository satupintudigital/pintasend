import { verifyApiKey } from "@/lib/authStore";
import { executeGetDeviceConfig, executePatchDeviceConfig } from "@/lib/deviceConfig";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// GET /v1/devices/:deviceId/config — get session config
// PATCH /v1/devices/:deviceId/config — patch session config

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

  const result = await executeGetDeviceConfig(deviceId, { tenantId: verified.tenantId, keyId: verified.keyId, requestId });

  if (!result.ok) {
    return Response.json({ error: result.error }, {
      status: result.status,
      headers: { "x-request-id": requestId, ...(result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {}) },
    });
  }
  return Response.json(result.body, { status: result.status, headers: { "x-request-id": requestId } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ deviceId: string }> }) {
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

  let body: { autoRejectCalls?: unknown; maxReconnectAttempts?: unknown; reconnectBaseDelay?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body harus berupa JSON" }, { status: 400, headers: { "x-request-id": requestId } });
  }

  const input: {
    autoRejectCalls?: boolean;
    maxReconnectAttempts?: number | null;
    reconnectBaseDelay?: number;
  } = {};
  if (typeof body?.autoRejectCalls === "boolean") input.autoRejectCalls = body.autoRejectCalls;
  if (body?.maxReconnectAttempts === null || typeof body?.maxReconnectAttempts === "number") input.maxReconnectAttempts = body.maxReconnectAttempts;
  if (typeof body?.reconnectBaseDelay === "number") input.reconnectBaseDelay = body.reconnectBaseDelay;

  const result = await executePatchDeviceConfig(deviceId, input, { tenantId: verified.tenantId, keyId: verified.keyId, requestId });

  if (!result.ok) {
    return Response.json({ error: result.error }, {
      status: result.status,
      headers: { "x-request-id": requestId, ...(result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {}) },
    });
  }
  return Response.json(result.body, { status: result.status, headers: { "x-request-id": requestId } });
}
