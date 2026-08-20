import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { openwa, OpenwaError, publicOpenwaError } from "@/lib/openwa";
import { ensureDeviceWebhookEvents, getDeviceForTenant } from "@/lib/devices";
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

  // Rekonsiliasi webhook (device lama → ack delivery aktif) — best-effort.
  const reconcile = await ensureDeviceWebhookEvents(device);
  if (reconcile.error) console.error("devices start: webhook reconcile gagal:", reconcile.error);

  try {
    const owa = await openwa.startSession(device.openwaSessionId);
    await query('UPDATE "Device" SET status = $1, "updatedAt" = now() WHERE id = $2', [
      owa.status,
      id,
    ]);
    await deleteCachedDeviceList(tenantId);
    return Response.json({ status: owa.status });
  } catch (e) {
    if (e instanceof OpenwaError) {
      return Response.json({ error: publicOpenwaError(e, "devices start") }, { status: 502 });
    }
    return Response.json({ error: "Gagal memulai device" }, { status: 500 });
  }
}
