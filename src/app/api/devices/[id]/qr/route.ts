import { auth } from "@/lib/auth";
import { openwa, OpenwaError, publicOpenwaError } from "@/lib/openwa";
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
      // Status 404 (session tidak ditemukan) tetap 404; selain itu 502. Pesan
      // publik selalu generik — detail hanya di log internal.
      const status = e.status === 404 ? 404 : 502;
      return Response.json({ error: publicOpenwaError(e, "devices qr") }, { status });
    }
    return Response.json({ error: "Gagal mengambil QR" }, { status: 500 });
  }
}
