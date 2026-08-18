import { auth } from "@/lib/auth";
import { setTenantPlan } from "@/lib/platform";

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

  const ok = await setTenantPlan(id, planId);
  if (!ok) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });
  return Response.json({ ok: true, planId });
}
