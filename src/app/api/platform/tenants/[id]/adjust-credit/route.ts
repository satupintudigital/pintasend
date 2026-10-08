import { auth } from "@/lib/auth";
import { addCredit } from "@/lib/credit";
import { queryOne } from "@/lib/db";
import { recordAuditFromSession } from "@/lib/audit";
import { uuidv7 } from "@/lib/uuidv7";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "platform_admin") {
    return Response.json({ error: "Forbidden — khusus platform admin" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    amount?: unknown;
    reason?: unknown;
  } | null;

  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    return Response.json({ error: "amount harus integer non-nol" }, { status: 400 });
  }

  const { id } = await params;
  const tenant = await queryOne<{ id: string }>(
    'SELECT id FROM "Tenant" WHERE id = $1',
    [id],
  );
  if (!tenant) return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });

  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : "manual_adjustment";

  const orderId = uuidv7();
  await queryOne(
    `INSERT INTO "Order" (id, "tenantId", "userId", kind, status, amount, "itemsJson", "creditMessages", "paidAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'topup', 'paid', 0, $4, $5, now(), now(), now())
     RETURNING id`,
    [
      orderId,
      id,
      session.user.id,
      JSON.stringify([{ type: "credit", name: "Manual Credit Adjustment", quantity: Math.abs(amount), unitPrice: 0 }]),
      amount,
    ],
  );

  const newBalance = await addCredit({
    tenantId: id,
    messages: amount,
    orderId,
    reason,
  });

  await recordAuditFromSession(session, {
    tenantId: id,
    action: "tenant.adjust_credit",
    targetType: "tenant",
    targetId: id,
    meta: { amount, reason, orderId, newBalance },
  });

  return Response.json({ ok: true, newBalance });
}
