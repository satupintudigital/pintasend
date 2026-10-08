import { auth } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { openwa, OpenwaError, publicOpenwaError } from "@/lib/openwa";
import { recordAuditFromSession } from "@/lib/audit";
import { isPlatformAdmin, parsePrincipal, unauthorized, forbidden, type SessionLike } from "@/lib/abac";
import { deleteCachedDeviceList } from "@/lib/deviceCache";

function requirePlatformAdmin(session: SessionLike | null): Response | null {
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!isPlatformAdmin(p)) return forbidden("Forbidden — khusus platform admin");
  return null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const { id } = await params;
  const device = await queryOne<{
    id: string;
    label: string;
    tenantId: string;
    openwaSessionId: string;
  }>(
    'SELECT id, label, "tenantId", "openwaSessionId" FROM "Device" WHERE id = $1',
    [id],
  );
  if (!device) return Response.json({ error: "Device tidak ditemukan" }, { status: 404 });

  try {
    await openwa.logoutSession(device.openwaSessionId);
  } catch (e) {
    if (e instanceof OpenwaError && e.status === 404) {
      // Session sudah tidak ada di OpenWA — logout idempoten, lanjutkan.
    } else if (e instanceof OpenwaError) {
      return Response.json({ error: publicOpenwaError(e, "platform devices logout") }, { status: 502 });
    } else {
      return Response.json({ error: "Gagal logout device" }, { status: 500 });
    }
  }

  await queryOne(
    'UPDATE "Device" SET status = $1, "updatedAt" = now() WHERE id = $2 RETURNING id',
    ["disconnected", id],
  );

  await deleteCachedDeviceList(device.tenantId);

  await recordAuditFromSession(session, {
    tenantId: device.tenantId,
    action: "device.admin_force_logout",
    targetType: "device",
    targetId: id,
    meta: { deviceLabel: device.label },
  });

  return Response.json({ ok: true });
}
