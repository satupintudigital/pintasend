import { auth } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { recordAuditFromSession } from "@/lib/audit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    days?: unknown;
    reason?: unknown;
  } | null;

  const days = Number(body?.days);
  if (!Number.isInteger(days) || days <= 0) {
    return Response.json({ error: "days harus integer positif (> 0)" }, { status: 400 });
  }

  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : "manual_extension";

  const rows = await queryOne<{ planPeriodEnd: string }>(
    `UPDATE "Tenant"
     SET "planPeriodEnd" = GREATEST(COALESCE("planPeriodEnd", now()), now()) + ($1 || ' days')::interval,
         "updatedAt" = now()
     WHERE id = $2
     RETURNING "planPeriodEnd"`,
    [days, id],
  );

  if (!rows) {
    return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });
  }

  await recordAuditFromSession(session, {
    tenantId: id,
    action: "tenant.extend_period",
    targetType: "tenant",
    targetId: id,
    meta: { days, reason, planPeriodEnd: rows.planPeriodEnd },
  });

  return Response.json({ ok: true, planPeriodEnd: rows.planPeriodEnd });
}
