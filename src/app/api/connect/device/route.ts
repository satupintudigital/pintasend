import { authenticateConnect, INTEGRATION_KEY_LABEL } from "@/lib/nalaniagaSso";
import { findOrCreateTenantByNalaniaga } from "@/lib/tenantStore";
import { createDeviceAndStart } from "@/lib/devices";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// Langkah 2 wizard: buat device (create + start) utk tenant SSO.
export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const rl = await checkRateLimit(`connect-device:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) {
    return Response.json(
      { error: "Terlalu banyak permintaan" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }
  const auth = await authenticateConnect(req);
  if (auth instanceof Response) return auth;

  const tenant = await findOrCreateTenantByNalaniaga(auth.claims.storeId, auth.claims.storeName);
  const created = await createDeviceAndStart(INTEGRATION_KEY_LABEL, tenant.id);

  logEvent("info", "connect_device_created", requestId, { tenantId: tenant.id, deviceId: created.id });
  return Response.json({ ok: true, deviceId: created.id, status: created.status }, { status: 201 });
}
