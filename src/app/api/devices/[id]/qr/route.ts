import { auth } from "@/lib/auth";
import { openwa, OpenwaError } from "@/lib/openwa";
import { getDeviceForTenant } from "@/lib/devices";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const device = await getDeviceForTenant(id, tenantId);
  if (!device) return Response.json({ error: "Device tidak ditemukan" }, { status: 404 });

  try {
    const qr = await openwa.getQr(device.openwaSessionId);
    return Response.json(qr);
  } catch (e) {
    if (e instanceof OpenwaError) {
      return Response.json({ error: `OpenWA: ${e.message}` }, { status: e.status });
    }
    return Response.json({ error: "Gagal mengambil QR" }, { status: 500 });
  }
}
