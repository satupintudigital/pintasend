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
    const channels = await openwa.listChannels(device.openwaSessionId);
    return Response.json({ channels });
  } catch (e) {
    if (e instanceof OpenwaError) {
      if (e.status === 404 || e.status === 501) {
        return Response.json({ error: "Fitur channels belum tersedia untuk device ini" }, { status: 501 });
      }
      return Response.json({ error: "Gagal mengambil channels" }, { status: 502 });
    }
    return Response.json({ error: "Gagal mengambil channels" }, { status: 502 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  if (!tenantId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: deviceId } = await params;
  const body = (await req.json().catch(() => null)) as { name?: unknown; description?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) return Response.json({ error: "Nama channel wajib diisi" }, { status: 400 });

  const device = await queryD1One<{ id: string; openwaSessionId: string; status: string }>(
    "SELECT id, openwaSessionId, status FROM Device WHERE id = ? AND tenantId = ?",
    [deviceId, tenantId]
  );
  if (!device) return Response.json({ error: "Device tidak ditemukan" }, { status: 404 });
  if (device.status !== "ready") return Response.json({ error: "Device tidak siap" }, { status: 409 });

  try {
    const input: { name: string; description?: string } = { name };
    if (typeof body?.description === "string" && body.description.trim()) input.description = body.description.trim();
    const channel = await openwa.createChannel(device.openwaSessionId, input);
    return Response.json({ channel }, { status: 201 });
  } catch (e) {
    if (e instanceof OpenwaError) {
      if (e.status === 404 || e.status === 501) {
        return Response.json({ error: "Fitur channels belum tersedia untuk device ini" }, { status: 501 });
      }
      return Response.json({ error: "Gagal membuat channel" }, { status: 502 });
    }
    return Response.json({ error: "Gagal membuat channel" }, { status: 502 });
  }
}
