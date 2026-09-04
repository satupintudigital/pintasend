import { verifyApiKey } from "@/lib/authStore";
import {
  executeWatermarkAddonGet,
  executeWatermarkAddonSet,
  type WatermarkAddonContext,
} from "@/lib/watermarkAddon";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// Self-service addon "Hapus Watermark" (tenant mengelola sendiri).
// Auth: Authorization: Bearer <API key> (sama dengan /v1/messages).
//
//   GET  /v1/addons/remove-watermark            → { addon, active, watermark }
//   POST /v1/addons/remove-watermark             → body { "active": true|false }
//
// Saat `active: true`, footnote iklan platform TIDAK disisipkan ke pesan
// keluar tenant (watermark: false). `active: false` → footnote kembali aktif.
// Route THIN (SRP): verifikasi API key → delegasi ke watermarkAddon.ts.

function headers(requestId: string, retryAfterSec?: number): Record<string, string> {
  return {
    "x-request-id": requestId,
    ...(retryAfterSec ? { "Retry-After": String(retryAfterSec) } : {}),
  };
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
  logEvent("info", "api_key_auth", requestId, {
    ok: true,
    tenantId: verified.tenantId,
    keyId: verified.keyId,
  });

  const ctx: WatermarkAddonContext = {
    tenantId: verified.tenantId,
    keyId: verified.keyId,
    requestId,
  };
  const result = await executeWatermarkAddonGet(ctx);
  return Response.json(result.ok ? result.body : { error: result.error }, {
    status: result.status,
    headers: headers(requestId, result.ok ? undefined : result.retryAfterSec),
  });
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
  logEvent("info", "api_key_auth", requestId, {
    ok: true,
    tenantId: verified.tenantId,
    keyId: verified.keyId,
  });

  const body = (await req.json().catch(() => null)) as { active?: unknown } | null;
  if (typeof body?.active !== "boolean") {
    return Response.json(
      { error: 'Field "active" (boolean) wajib diisi — true = hapus watermark, false = pasang kembali' },
      { status: 400, headers: headers(requestId) },
    );
  }

  const ctx: WatermarkAddonContext = {
    tenantId: verified.tenantId,
    keyId: verified.keyId,
    requestId,
  };
  const result = await executeWatermarkAddonSet(body.active, ctx);
  return Response.json(result.ok ? result.body : { error: result.error }, {
    status: result.status,
    headers: headers(requestId, result.ok ? undefined : result.retryAfterSec),
  });
}
