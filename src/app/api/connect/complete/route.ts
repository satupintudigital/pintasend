import {
  authenticateConnect,
  deliverConnectCallback,
  INTEGRATION_KEY_LABEL,
} from "@/lib/nalaniagaSso";
import { findOrCreateTenantByNalaniaga } from "@/lib/tenantStore";
import { getDeviceForTenant } from "@/lib/devices";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/authStore";
import { generateWebhookSecret, upsertWebhook } from "@/lib/webhookStore";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getBinding } from "@/lib/cf";
import { getRequestId, logEvent } from "@/lib/requestLogger";

const COMPLETE_KV_TTL_MS = 24 * 60 * 60 * 1000;

// Langkah akhir wizard: cabut key lama → key baru → webhook tenant → callback
// ke NalaNiaga. Idempotent per jti (KV connect:complete:<jti>, TTL 24 jam).
export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const rl = await checkRateLimit(`connect-complete:${clientIp(req)}`, 20, 60_000);
  if (!rl.allowed) {
    return Response.json(
      { error: "Terlalu banyak permintaan" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }
  const auth = await authenticateConnect(req);
  if (auth instanceof Response) return auth;
  const { claims } = auth;

  // 1. Idempotensi: sudah selesai untuk jti ini → kembalikan hasil tersimpan.
  const kv = await getBinding<{
    get(k: string): Promise<string | null>;
    put(k: string, v: string, opts?: { expirationTtl?: number }): Promise<void>;
  }>("PINTSEND_CACHE");
  const doneKey = `connect:complete:${claims.jti}`;
  const cached = await kv.get(doneKey).catch(() => null);
  if (cached) {
    const parsed = JSON.parse(cached) as {
      ok: boolean;
      callbackOk: boolean;
      deviceId: string;
      webhookUrl: string;
    };
    return Response.json({ ...parsed, idempotentReplay: true });
  }

  const tenant = await findOrCreateTenantByNalaniaga(claims.storeId, claims.storeName);

  // 2. Device: pakai deviceId dari body, atau device ready pertama tenant.
  const rawBody = (await req.clone().json().catch(() => ({}))) as { deviceId?: unknown };
  const requestedId = typeof rawBody.deviceId === "string" ? rawBody.deviceId : "";
  const device = requestedId
    ? await getDeviceForTenant(requestedId, tenant.id)
    : await listReadyDevice(tenant.id);
  if (!device) {
    return Response.json({ error: "Device tidak ditemukan untuk tenant ini" }, { status: 404 });
  }
  if (device.status !== "ready") {
    return Response.json(
      { error: `Device "${device.id}" belum siap (status: ${device.status})` },
      { status: 409 },
    );
  }

  // 3. Cabut key integrasi lama (label khusus), lalu buat key baru.
  const oldKeys = await listApiKeys(tenant.id);
  for (const k of oldKeys) {
    if (k.label === INTEGRATION_KEY_LABEL && !k.revokedAt) {
      await revokeApiKey(k.id, tenant.id).catch(() => {});
    }
  }
  const apiKey = await createApiKey({ tenantId: tenant.id, label: INTEGRATION_KEY_LABEL });

  // 4. Webhook tenant → URL NalaNiaga, secret baru.
  const webhookSecret = generateWebhookSecret();
  await upsertWebhook({
    tenantId: tenant.id,
    url: claims.webhookUrl,
    secret: webhookSecret,
    events: ["message.received", "session.status"],
  });

  // 5. Callback ke NalaNiaga (HMAC + retry, lihat nalaniagaSso).
  const callback = await deliverConnectCallback(claims, {
    token: await readToken(req),
    tenantId: tenant.id,
    deviceId: device.id,
    deviceLabel: device.label,
    apiKey: apiKey.raw,
    webhookUrl: claims.webhookUrl,
    webhookSecret,
  });

  const result = {
    ok: true as const,
    callbackOk: callback.ok,
    deviceId: device.id,
    webhookUrl: claims.webhookUrl,
  };
  await kv
    .put(doneKey, JSON.stringify(result), { expirationTtl: COMPLETE_KV_TTL_MS / 1000 })
    .catch(() => {});

  logEvent(callback.ok ? "info" : "error", "connect_complete", requestId, {
    tenantId: tenant.id,
    deviceId: device.id,
    callbackOk: callback.ok,
    status: callback.status,
  });

  if (!callback.ok) {
    return Response.json(
      {
        ...result,
        error:
          "Koneksi tersimpan di PintaSend, tapi pemberitahuan ke NalaNiaga gagal. Silakan coba ulang dari NalaNiaga.",
      },
      { status: 502 },
    );
  }
  return Response.json(result);
}

async function listReadyDevice(
  tenantId: string,
): Promise<{ id: string; label: string; openwaSessionId: string; status: string } | null> {
  const { listDevicesForTenant } = await import("@/lib/devices");
  const devices = await listDevicesForTenant(tenantId);
  return devices.find((d) => d.status === "ready") ?? null;
}

async function readToken(req: Request): Promise<string> {
  const fromHeader = req.headers.get("x-connect-token") ?? "";
  if (fromHeader) return fromHeader;
  const body = (await req.clone().json().catch(() => ({}))) as { token?: unknown };
  return typeof body.token === "string" ? body.token : "";
}
