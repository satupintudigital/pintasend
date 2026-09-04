import { auth } from "@/lib/auth";
import { setTenantAddon } from "@/lib/platform";
import { recordAuditFromSession } from "@/lib/audit";
import { ADDON_KEYS, type AddonKey } from "@/lib/addonKeys";

// Addon tenant (grant/revoke) — khusus platform_admin.
// Body: { key: string, active: boolean }. Key di-whitelist dari addonKeys.ts.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    key?: unknown;
    active?: unknown;
  } | null;
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!ADDON_KEYS.includes(key as AddonKey)) {
    return Response.json({ error: "Addon tidak dikenal" }, { status: 400 });
  }
  if (typeof body?.active !== "boolean") {
    return Response.json({ error: "Field active (boolean) wajib diisi" }, { status: 400 });
  }

  try {
    const ok = await setTenantAddon(id, key, body.active);
    if (!ok) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });
    await recordAuditFromSession(session, {
      tenantId: id,
      action: "tenant.addon.set",
      targetType: "tenant",
      targetId: id,
      meta: { key, active: body.active },
    });
    return Response.json({ ok: true, key, active: body.active });
  } catch (e) {
    console.error("platform/tenants/[id]/addons:", e);
    return Response.json({ error: "Gagal mengubah addon" }, { status: 500 });
  }
}
