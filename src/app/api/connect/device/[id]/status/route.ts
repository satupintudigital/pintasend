import { authenticateConnect } from "@/lib/nalaniagaSso";
import { getDeviceForTenant } from "@/lib/devices";
import { openwa } from "@/lib/openwa";
import { getRequestId, logEvent } from "@/lib/requestLogger";

async function findTenantForClaims(storeId: string): Promise<{ id: string }> {
  const { findOrCreateTenantByNalaniaga } = await import("@/lib/tenantStore");
  return findOrCreateTenantByNalaniaga(storeId, "");
}

// Poll status device wizard — token-gated.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const auth = await authenticateConnect(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const tenant = await findTenantForClaims(auth.claims.storeId);
  const device = await getDeviceForTenant(id, tenant.id);
  if (!device) return Response.json({ error: "Device tidak ditemukan" }, { status: 404 });

  let status = device.status;
  let phone = device.phone ?? null;
  try {
    const live = await openwa.getSession(device.openwaSessionId);
    status = live.status;
    phone = live.phone ?? phone;
  } catch {
    // OpenWA offline → pakai status tersimpan
  }
  logEvent("info", "connect_status", requestId, { deviceId: id, status });
  return Response.json({ status, phone });
}
