import { auth } from "@/lib/auth";
import {
  forbidden,
  parsePrincipal,
  unauthorized,
  type Principal,
  type SessionLike,
} from "@/lib/abac";
import { getTenantActivation } from "@/lib/tenantGate";
import { ensureCurrentPeriod } from "@/lib/billingRenewal";
import { getBalance } from "@/lib/credit";
import { listOrders } from "@/lib/billing";
import { listDevicesForTenant } from "@/lib/devices";
import { getPublicCatalog } from "@/lib/catalog";
import { queryOne } from "@/lib/db";

// ─── GET /api/billing/my ────────────────────────────────────────────────────
// Ringkasan langganan tenant sendiri (dashboard /dashboard/langganan):
// katalog harga + plan aktif (join Tenant×Plan) + saldo prepaid + daftar order
// + flag pending + jumlah device. Sebelum membaca, periode yang sudah habis
// dipicu renewal lazy (ensureCurrentPeriod) supaya tagihan bulan baru tampil.

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

export async function GET() {
  const session = await auth();
  const guard = guardTenantBilling(session);
  if (!guard.ok) return guard.response;

  try {
    const { tenantId } = guard.principal;

    // Renewal lazy: terbitkan invoice + order renewal bila periode sudah habis.
    const renewal = await ensureCurrentPeriod(tenantId);

    const [catalog, planRow, balance, orders, devices, activation] = await Promise.all([
      getPublicCatalog(),
      queryOne<{
        planId: string | null;
        planName: string | null;
        planKind: string | null;
        priceMonthly: number | null;
        priceDisplay: string | null;
        maxMessagesPerMonth: number | null;
        maxDevices: number | null;
        maxUsers: number | null;
        activatedAt: string | null;
        suspendedAt: string | null;
        planAssignedAt: string | null;
        planPeriodEnd: string | null;
      }>(
        `SELECT t."planId", p.name AS "planName", p.kind AS "planKind",
                p."priceMonthly", p."priceDisplay", p."maxMessagesPerMonth",
                p."maxDevices", p."maxUsers",
                t."activatedAt", t."suspendedAt", t."planAssignedAt", t."planPeriodEnd"
         FROM "Tenant" t LEFT JOIN "Plan" p ON p.id = t."planId"
         WHERE t.id = $1`,
        [tenantId],
      ),
      getBalance(tenantId),
      listOrders(tenantId, 20),
      listDevicesForTenant(tenantId),
      getTenantActivation(tenantId),
    ]);

    return Response.json({
      catalog,
      plan: planRow ?? null,
      balance,
      orders,
      pending: activation.pending,
      deviceCount: devices.length,
      renewalTriggered: renewal.invoiceCreated || renewal.orderCreated,
    });
  } catch (e) {
    console.error("billing/my GET:", e);
    return Response.json({ error: "Gagal memuat data langganan" }, { status: 500 });
  }
}
