import { auth } from "@/lib/auth";
import {
  forbidden,
  parsePrincipal,
  unauthorized,
  type Principal,
  type SessionLike,
} from "@/lib/abac";
import { expireStaleOrders, getOrder } from "@/lib/billing";

// ─── GET /api/billing/orders/[id] ───────────────────────────────────────────
// Status order milik tenant sendiri (dipakai polling checkout). Bila order
// pending sudah lewat expiresAt → refresh lewat expireStaleOrders lalu tampilkan
// status terbaru + sisa detik sebelum kedaluwarsa.

function guardTenantBilling(
  session: SessionLike | null,
): { ok: true; principal: Principal } | { ok: false; response: Response } {
  const principal = parsePrincipal(session);
  if (!principal) return { ok: false, response: unauthorized() };
  if (principal.role !== "owner" && principal.role !== "tenant_admin") {
    return { ok: false, response: forbidden("Forbidden — khusus owner / tenant admin") };
  }
  return { ok: true, principal };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const guard = guardTenantBilling(session);
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  if (!id) return Response.json({ error: "Order id wajib diisi" }, { status: 400 });

  try {
    const { tenantId } = guard.principal;
    let order = await getOrder(tenantId, id);
    if (!order) return Response.json({ error: "Order tidak ditemukan" }, { status: 404 });

    // Refresh order yang sudah lewat batas bayar (polling checkout lama).
    if (order.status === "pending" && order.expiresAt && new Date(order.expiresAt) <= new Date()) {
      await expireStaleOrders(new Date());
      order = (await getOrder(tenantId, id)) ?? order;
    }

    let expiresInSec: number | null = null;
    if (order.status === "pending" && order.expiresAt) {
      expiresInSec = Math.max(0, Math.floor((new Date(order.expiresAt).getTime() - Date.now()) / 1000));
    }
    return Response.json({
      order: {
        id: order.id,
        kind: order.kind,
        status: order.status,
        amount: order.amount,
        payCode: order.payCode,
        checkoutUrl: order.checkoutUrl,
        expiresAt: order.expiresAt,
        expiresInSec,
        paidAt: order.paidAt,
      },
    });
  } catch (e) {
    console.error("billing/orders/[id] GET:", e);
    return Response.json({ error: "Gagal memuat status order" }, { status: 500 });
  }
}
