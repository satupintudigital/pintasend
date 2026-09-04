import { auth } from "@/lib/auth";
import { setTenantAddon } from "@/lib/platform";

// Addon tenant (grant/revoke) — khusus platform_admin.
// Body: { key: string, active: boolean }. Key di-whitelist di sini.
const ADDON_KEYS = ["random_delay", "remove_watermark"] as const;

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
  if (!ADDON_KEYS.includes(key as (typeof ADDON_KEYS)[number])) {
    return Response.json({ error: "Addon tidak dikenal" }, { status: 400 });
  }
  if (typeof body?.active !== "boolean") {
    return Response.json({ error: "Field active (boolean) wajib diisi" }, { status: 400 });
  }

  try {
    const ok = await setTenantAddon(id, key, body.active);
    if (!ok) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });
    return Response.json({ ok: true, key, active: body.active });
  } catch (e) {
    console.error("platform/tenants/[id]/addons:", e);
    return Response.json({ error: "Gagal mengubah addon" }, { status: 500 });
  }
}
