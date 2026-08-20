import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { openwa, OpenwaError, publicOpenwaError } from "@/lib/openwa";
import { getDeviceForTenant } from "@/lib/devices";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { deleteCachedDeviceList } from "@/lib/deviceCache";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`device-mutate:${tenantId}:${clientIp(req)}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const { id } = await params;

  const device = await getDeviceForTenant(id, tenantId);
  if (!device) return Response.json({ error: "Device tidak ditemukan" }, { status: 404 });

  try {
    await openwa.logoutSession(device.openwaSessionId);
  } catch (e) {
    if (e instanceof OpenwaError && e.status === 404) {
      // Session sudah tidak ada di OpenWA — logout idempoten, lanjutkan.
    } else if (e instanceof OpenwaError) {
      return Response.json({ error: publicOpenwaError(e, "devices logout") }, { status: 502 });
    } else {
      return Response.json({ error: "Gagal logout device" }, { status: 500 });
    }
  }

  await query('UPDATE "Device" SET status = $1, "updatedAt" = now() WHERE id = $2', [
    "disconnected",
    id,
  ]);
  await deleteCachedDeviceList(tenantId);
  return Response.json({ ok: true });
}
