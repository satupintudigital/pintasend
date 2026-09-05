import { auth } from "@/lib/auth";
import { createPlan, listPlans, parsePlanCreateBody } from "@/lib/platform";

// Daftar plan — khusus platform_admin.
export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  try {
    const plans = await listPlans();
    return Response.json({ plans });
  } catch (e) {
    console.error("platform/plans:", e);
    return Response.json({ error: "Gagal memuat plan" }, { status: 500 });
  }
}

// Buat plan baru (katalog) — khusus platform_admin.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parsePlanCreateBody(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const plan = await createPlan(parsed.plan);
    if (!plan) return Response.json({ error: "Gagal membuat plan" }, { status: 500 });
    return Response.json({ ok: true, plan });
  } catch (e) {
    console.error("platform/plans POST:", e);
    return Response.json({ error: "Gagal membuat plan" }, { status: 500 });
  }
}
