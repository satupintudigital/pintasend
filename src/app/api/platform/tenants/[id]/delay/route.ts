import { auth } from "@/lib/auth";
import { setTenantDelayEnabled } from "@/lib/platform";

// Toggle config random delay per tenant — khusus platform_admin.
// Body: { enabled: boolean }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return Response.json({ error: "Field enabled (boolean) wajib diisi" }, { status: 400 });
  }

  try {
    const ok = await setTenantDelayEnabled(id, body.enabled);
    if (!ok) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });
    return Response.json({ ok: true, enabled: body.enabled });
  } catch (e) {
    console.error("platform/tenants/[id]/delay:", e);
    return Response.json({ error: "Gagal mengubah config delay" }, { status: 500 });
  }
}
