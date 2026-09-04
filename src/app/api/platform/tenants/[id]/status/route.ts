import { auth } from "@/lib/auth";
import { setTenantSuspended } from "@/lib/tenantStore";
import { recordAuditFromSession } from "@/lib/audit";

// Suspend / aktifkan tenant — khusus platform_admin.
// Write-through Neon (source of truth) → D1 (gate login & API key).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "suspend" && action !== "activate") {
    return Response.json({ error: 'action harus "suspend" atau "activate"' }, { status: 400 });
  }

  const suspendedAt = action === "suspend" ? new Date().toISOString() : null;
  const result = await setTenantSuspended(id, suspendedAt);
  if (!result.updated) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });
  await recordAuditFromSession(session, {
    tenantId: id,
    action: action === "suspend" ? "tenant.suspend" : "tenant.activate",
    targetType: "tenant",
    targetId: id,
    meta: { suspendedAt },
  });
  return Response.json({ ok: true, action, d1Ok: result.d1Ok });
}
