import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { openwa, OpenwaError } from "@/lib/openwa";
import { cloneDeviceToD1, deleteDeviceFromD1, getDeviceForTenant } from "@/lib/devices";
import { checkRateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import {
  getCachedDevice,
  setCachedDevice,
  deleteCachedDevice,
  deleteCachedDeviceList,
} from "@/lib/deviceCache";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // 1. Cache hit → 0 koneksi Neon (polling 2,5 dtk kebanyakan di sini).
  // Cache menyimpan device LENGKAP sehingga shape respons sama dengan cache miss.
  const cached = await getCachedDevice(id);
  if (cached) {
    return Response.json({ device: cached });
  }

  // 2. Cache miss → query Neon + OpenWA, lalu refresh cache.
  const device = await getDeviceForTenant(id, tenantId);
  if (!device) return Response.json({ error: "Device tidak ditemukan" }, { status: 404 });

  try {
    const owa = await openwa.getSession(device.openwaSessionId);
    const newStatus = owa.status;
    const newPhone = owa.phone ?? device.phone;
    await query(
      'UPDATE "Device" SET status = $1, phone = $2, "updatedAt" = now() WHERE id = $3',
      [newStatus, newPhone, id],
    );
    const refreshed = { ...device, status: newStatus, phone: newPhone };
    await setCachedDevice(refreshed);
    await cloneDeviceToD1(refreshed).catch((e) =>
      console.error("devices: clone D1 gagal:", e),
    );
    if (newStatus !== device.status) await deleteCachedDeviceList(tenantId);
    return Response.json({ device: refreshed });
  } catch (e) {
    if (e instanceof OpenwaError && e.status === 404) {
      // Session sudah dihapus di OpenWA → tandai terputus.
      await query('UPDATE "Device" SET status = $1, "updatedAt" = now() WHERE id = $2', [
        "disconnected",
        id,
      ]);
      await setCachedDevice({ ...device, status: "disconnected", phone: null });
      await deleteCachedDeviceList(tenantId);
      return Response.json({ device: { ...device, status: "disconnected", phone: null } });
    }
    if (e instanceof OpenwaError) {
      return Response.json({ error: `OpenWA: ${e.message}` }, { status: 502 });
    }
    return Response.json({ error: "Gagal mengambil status device" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(`device-mutate:${tenantId}:${clientIp(req)}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSec);

  const { id } = await params;

  const device = await getDeviceForTenant(id, tenantId);
  if (!device) return Response.json({ error: "Device tidak ditemukan" }, { status: 404 });

  // Unregister webhook OpenWA dulu (best-effort — baris DB tetap dihapus).
  if (device.openwaWebhookId) {
    await openwa.deleteWebhook(device.openwaSessionId, device.openwaWebhookId).catch(() => {});
  }
  try {
    await openwa.deleteSession(device.openwaSessionId);
  } catch {
    // Best effort — baris DB tetap dihapus.
  }
  await query('DELETE FROM "Device" WHERE id = $1', [id]);
  await deleteDeviceFromD1(id).catch((e) => console.error("devices: delete D1 gagal:", e));
  await deleteCachedDevice(id);
  await deleteCachedDeviceList(tenantId);
  return Response.json({ ok: true });
}
