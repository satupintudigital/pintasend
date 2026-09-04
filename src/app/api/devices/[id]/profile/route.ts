import { auth } from "@/lib/auth";
import { queryD1One } from "@/lib/d1";
import { openwa, OpenwaError } from "@/lib/openwa";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: deviceId } = await params;

  const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, tenantId]
  );
  if (!device) return Response.json({ error: "Device tidak ditemukan" }, { status: 404 });
  if (device.status !== "ready") return Response.json({ error: "Device tidak siap" }, { status: 409 });

  try {
    const profile = await openwa.getProfile(device.openwaSessionId);
    return Response.json({ profile });
  } catch (e) {
    if (e instanceof OpenwaError) {
      // 404 = endpoint not available on this engine (Baileys doesn't support profile)
      if (e.status === 404) {
        return Response.json({ error: "Profil tidak tersedia pada engine ini" }, { status: 501 });
      }
      return Response.json({ error: "Gagal mengambil profil" }, { status: 502 });
    }
    return Response.json({ error: "Gagal mengambil profil" }, { status: 502 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: deviceId } = await params;
  const body = (await req.json().catch(() => null)) as { name?: unknown; about?: unknown } | null;

  const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, tenantId]
  );
  if (!device) return Response.json({ error: "Device tidak ditemukan" }, { status: 404 });
  if (device.status !== "ready") return Response.json({ error: "Device tidak siap" }, { status: 409 });

  const input: { name?: string; about?: string } = {};
  if (typeof body?.name === "string") input.name = body.name;
  if (typeof body?.about === "string") input.about = body.about;

  try {
    const profile = await openwa.patchProfile(device.openwaSessionId, input);
    return Response.json({ profile });
  } catch (e) {
    if (e instanceof OpenwaError) {
      if (e.status === 404) {
        return Response.json({ error: "Profil tidak tersedia pada engine ini" }, { status: 501 });
      }
      return Response.json({ error: "Gagal memperbarui profil" }, { status: 502 });
    }
    return Response.json({ error: "Gagal memperbarui profil" }, { status: 502 });
  }
}
