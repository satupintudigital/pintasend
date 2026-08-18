import { authenticateConnect } from "@/lib/nalaniagaSso";
import { getDeviceForTenant } from "@/lib/devices";
import { openwa } from "@/lib/openwa";
import { getRequestId, logEvent } from "@/lib/requestLogger";

// Resolve tenant SSO dari storeId (sama dengan verify) — idempotent.
async function findTenantForClaims(storeId: string): Promise<{ id: string }> {
  const { findOrCreateTenantByNalaniaga } = await import("@/lib/tenantStore");
  return findOrCreateTenantByNalaniaga(storeId, "");
}

// QR pairing device wizard — token-gated (bukan session dashboard).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const auth = await authenticateConnect(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const tenant = await findTenantForClaims(auth.claims.storeId);
  const device = await getDeviceForTenant(id, tenant.id);
  if (!device) return Response.json({ error: "Device tidak ditemukan" }, { status: 404 });

  const { qrCode, status } = await openwa.getQr(device.openwaSessionId);
  logEvent("info", "connect_qr", requestId, { deviceId: id, status });
  return Response.json({ qrCode, status });
}
