import { auth } from "@/lib/auth";
import { getTenantPlanId, setTenantPlan } from "@/lib/platform";
import { recordAuditFromSession } from "@/lib/audit";

// Assign plan ke tenant (null = tanpa plan / tanpa kuota) — khusus platform_admin.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { planId?: unknown } | null;
  const planId = typeof body?.planId === "string" && body.planId ? body.planId : null;

  const before = await getTenantPlanId(id);
  if (before === undefined) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });
  const ok = await setTenantPlan(id, planId);
  if (!ok) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });
  await recordAuditFromSession(session, {
    tenantId: id,
    action: "tenant.plan.set",
    targetType: "tenant",
    targetId: id,
    meta: { before, after: planId },
  });
  return Response.json({ ok: true, planId });
}
