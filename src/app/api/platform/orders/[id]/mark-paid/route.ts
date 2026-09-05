import { auth } from "@/lib/auth";
import {
  forbidden,
  isPlatformAdmin,
  parsePrincipal,
  unauthorized,
  type SessionLike,
} from "@/lib/abac";
import { finalizePaidOrder, getOrderAnyScope } from "@/lib/billing";

// ─── POST /api/platform/orders/[id]/mark-paid ───────────────────────────────
// Rekonsiliasi MANUAL (platform admin): menandai order pending sebagai lunas
// tanpa gateway — dipakai ketika pembayaran diterima di luar Tripay (transfer
// manual, gateway sedang down, dsb.). Efek per kind dijalankan oleh
// finalizePaidOrder yang sama dgn callback Tripay (idempoten, guard atomik):
//   first/renewal_subscription → assign plan + activatedAt,
//   addon → grant TenantAddon sampai akhir periode,
//   topup → aktivasi Espresso + isi kredit pesan.
// gatewayRef dicatat "manual:<admin>" agar bisa dilacak siapa yang menandai.

function requirePlatformAdmin(session: SessionLike | null): Response | null {
  const p = parsePrincipal(session);
  if (!p) return unauthorized();
  if (!isPlatformAdmin(p)) return forbidden("Forbidden — khusus platform admin");
  return null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const denied = requirePlatformAdmin(session);
  if (denied) return denied;

  const { id } = await params;
  try {
    const order = await getOrderAnyScope(id);
    if (!order) return Response.json({ error: "Order tidak ditemukan" }, { status: 404 });
    if (order.status !== "pending") {
      return Response.json(
        { error: `Order berstatus '${order.status}' — hanya order pending yang bisa ditandai lunas` },
        { status: 409 },
      );
    }

    const actor = { id: session?.user?.id ?? "platform", name: session?.user?.email ?? "platform" };
    const res = await finalizePaidOrder(
      id,
      { gatewayRef: `manual:${actor.name}`, payMethod: "manual" },
      actor,
    );
    if (!res.ok) {
      console.error("platform/orders mark-paid: finalize gagal", res.error);
      return Response.json({ error: res.error ?? "Gagal menandai lunas" }, { status: 500 });
    }
    return Response.json({ ok: true, orderId: id });
  } catch (e) {
    console.error("platform/orders mark-paid:", e);
    return Response.json({ error: "Gagal menandai order lunas" }, { status: 500 });
  }
}
