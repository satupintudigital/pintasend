import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { openwa, OpenwaError } from "@/lib/openwa";
import { getDeviceForTenant } from "@/lib/devices";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const device = await getDeviceForTenant(id, tenantId);
  if (!device) return Response.json({ error: "Device tidak ditemukan" }, { status: 404 });

  try {
    const owa = await openwa.startSession(device.openwaSessionId);
    await query('UPDATE "Device" SET status = $1, "updatedAt" = now() WHERE id = $2', [
      owa.status,
      id,
    ]);
    return Response.json({ status: owa.status });
  } catch (e) {
    if (e instanceof OpenwaError) {
      return Response.json({ error: `OpenWA: ${e.message}` }, { status: 502 });
    }
    return Response.json({ error: "Gagal memulai device" }, { status: 500 });
  }
}
