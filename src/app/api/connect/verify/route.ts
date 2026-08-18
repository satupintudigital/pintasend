import { authenticateConnect } from "@/lib/nalaniagaSso";
import { findOrCreateTenantByNalaniaga } from "@/lib/tenantStore";
import { listDevicesForTenant } from "@/lib/devices";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// Langkah 1 wizard SSO NalaNiaga → Wavio. Token JWT di body; endpoint publik
// tapi token-gated + rate limit per IP (bukan session dashboard).
export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const rl = await checkRateLimit(`connect-verify:${clientIp(req)}`, 10, 60_000);
  if (!rl.allowed) {
    return Response.json(
      { error: "Terlalu banyak permintaan" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  const auth = await authenticateConnect(req);
  if (auth instanceof Response) return auth;

  const tenant = await findOrCreateTenantByNalaniaga(auth.claims.storeId, auth.claims.storeName);
  const devices = await listDevicesForTenant(tenant.id);
  const deviceReady = devices.find((d) => d.status === "ready") ?? null;

  logEvent("info", "connect_verify", requestId, { storeId: auth.claims.storeId, tenantId: tenant.id });
  return Response.json({
    ok: true,
    storeName: auth.claims.storeName,
    tenantId: tenant.id,
    deviceReady: deviceReady
      ? { id: deviceReady.id, label: deviceReady.label, phone: deviceReady.phone, status: deviceReady.status }
      : null,
  });
}
