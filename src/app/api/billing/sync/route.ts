import { auth } from "@/lib/auth";
import {
  forbidden,
  isPlatformAdmin,
  parsePrincipal,
  unauthorized,
  type SessionLike,
} from "@/lib/abac";
import {
  expireStaleOrders,
  finalizePaidOrder,
  listPendingGatewayOrders,
  markOrderExpiredFromGateway,
} from "@/lib/billing";
import { getPaymentProvider, type PaymentStatus } from "@/lib/payments";

// ─── POST /api/billing/sync (platform admin) ────────────────────────────────
// Resync manual status pembayaran: expire order yang lewat waktu lokal, lalu
// untuk setiap order pending yang sudah punya gatewayRef → tanya status ke
// Tripay. PAID → finalisasi (idempoten), EXPIRED → tandai expired. Dipakai
// tombol "Resync Tripay" di /platform/orders dan fallback polling admin.

function requirePlatformAdmin(session: SessionLike | null): Response | null {
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!isPlatformAdmin(p)) return forbidden("Forbidden — khusus platform admin");
  return null;
}

export async function POST() {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  try {
    const expired = await expireStaleOrders();
    const orders = await listPendingGatewayOrders();
    const provider = getPaymentProvider();

    let paid = 0;
    let expiredFromGateway = 0;
    let stillPending = 0;
    for (const order of orders) {
      if (!order.gatewayRef) continue;
      let status: PaymentStatus;
      try {
        status = await provider.checkStatus(order.gatewayRef);
      } catch (e) {
        console.error("billing/sync: checkStatus gagal utk", order.id, e);
        stillPending += 1;
        continue;
      }
      if (status.status === "PAID") {
        const res = await finalizePaidOrder(order.id, {
          gatewayRef: order.gatewayRef,
          payMethod: order.payMethod ?? undefined,
          paidAt: status.paidAt ?? undefined,
        });
        if (res.ok) paid += 1;
        else stillPending += 1;
      } else if (status.status === "EXPIRED") {
        if (await markOrderExpiredFromGateway(order.id)) expiredFromGateway += 1;
      } else {
        stillPending += 1; // UNPAID / REFUND / FAILED
      }
    }
    return Response.json({ expired, paid, expiredFromGateway, stillPending });
  } catch (e) {
    console.error("billing/sync POST:", e);
    return Response.json({ error: "Gagal sinkronisasi status pembayaran" }, { status: 500 });
  }
}
