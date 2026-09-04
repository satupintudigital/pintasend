import { auth } from "@/lib/auth";
import {
  forbidden,
  parsePrincipal,
  unauthorized,
  type Principal,
  type SessionLike,
} from "@/lib/abac";
import { getTenantActivation } from "@/lib/tenantGate";
import { createOrder, parseItems, type OrderItem, type OrderKind, type OrderRow } from "@/lib/billing";
import { getPublicCatalog } from "@/lib/catalog";

// ─── POST /api/billing/orders ───────────────────────────────────────────────
// Buat order pembayaran self-serve (kind: first_subscription, renewal_subscription,
// addon, topup). Guard: session owner/tenant_admin tenant itu sendiri.
//   - first_subscription: tenant BOLEH pending (aktivasi) — plan wajib
//     kind='subscription' (Latte/Mocha); addonKeys di-bundle bila berbayar.
//   - topup saat pending = aktivasi Espresso (order membawa planId prepaid,
//     finalize men-set activatedAt + assign plan — keputusan user 2026-09-04).
//   - addon / renewal_subscription butuh tenant aktif (TENANT_PENDING ditolak).
// Harga & item dihitung ulang server-side di createOrder (jangan percaya client).

const ORDER_KINDS: OrderKind[] = ["first_subscription", "renewal_subscription", "addon", "topup"];

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

/** Bentuk order yang aman & ringkas untuk client checkout. */
function publicOrder(order: OrderRow) {
  return {
    id: order.id,
    kind: order.kind,
    status: order.status,
    amount: order.amount,
    creditMessages: order.creditMessages,
    payMethod: order.payMethod,
    payCode: order.payCode,
    checkoutUrl: order.checkoutUrl,
    expiresAt: order.expiresAt,
    periodStart: order.periodStart,
    periodEnd: order.periodEnd,
    items: parseItems(order.itemsJson),
    createdAt: order.createdAt,
  };
}

export async function POST(req: Request) {
  const session = await auth();
  const guard = guardTenantBilling(session);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as {
    kind?: unknown;
    planId?: unknown;
    addonKey?: unknown;
    addonKeys?: unknown;
    creditMessages?: unknown;
    payMethod?: unknown;
  } | null;
  if (!body) return Response.json({ error: "Body JSON tidak valid" }, { status: 400 });

  const kind = body.kind;
  if (typeof kind !== "string" || !ORDER_KINDS.includes(kind as OrderKind)) {
    return Response.json({ error: "Jenis pesanan tidak dikenal" }, { status: 400 });
  }
  const payMethod = typeof body.payMethod === "string" ? body.payMethod.trim() : "";
  if (!payMethod) {
    return Response.json({ error: "Metode pembayaran wajib diisi" }, { status: 400 });
  }

  try {
    const catalog = await getPublicCatalog();
    const { tenantId, id: userId } = guard.principal;

    const activation = await getTenantActivation(tenantId);
    if (activation.suspendedAt) {
      return Response.json(
        { error: "Tenant dinonaktifkan (suspended). Hubungi admin platform.", code: "TENANT_SUSPENDED" },
        { status: 403 },
      );
    }
    const needsActiveTenant = kind === "addon" || kind === "renewal_subscription";
    if (needsActiveTenant && activation.pending) {
      return Response.json(
        { error: "Tenant belum aktif — selesaikan pembayaran paket terlebih dahulu.", code: "TENANT_PENDING" },
        { status: 403 },
      );
    }

    let planId: string | null = null;
    let addonKey: string | null = null;
    let creditMessages: number | null = null;
    const addonItems: OrderItem[] = [];

    if (kind === "first_subscription" || kind === "renewal_subscription") {
      const rawPlanId = typeof body.planId === "string" ? body.planId.trim() : "";
      if (!rawPlanId) return Response.json({ error: "Pilih paket terlebih dahulu" }, { status: 400 });
      const plan = catalog.plans.find((p) => p.id === rawPlanId);
      if (!plan || plan.kind !== "subscription" || plan.priceMonthly == null) {
        return Response.json({ error: "Paket tidak tersedia untuk dibeli" }, { status: 400 });
      }
      planId = plan.id;

      if (kind === "first_subscription") {
        if (!activation.pending) {
          return Response.json(
            { error: "Tenant sudah aktif — gunakan menu Langganan untuk perpanjangan atau addon." },
            { status: 400 },
          );
        }
        const addonKeys = Array.isArray(body.addonKeys)
          ? body.addonKeys.filter((k): k is string => typeof k === "string")
          : [];
        for (const key of addonKeys) {
          const addon = catalog.addons.find((a) => a.key === key);
          if (!addon || addon.priceMonthly == null) {
            return Response.json({ error: `Addon tidak tersedia: ${key}` }, { status: 400 });
          }
          addonItems.push({ type: "addon", refId: addon.key, name: addon.name, quantity: 1, unitPrice: addon.priceMonthly });
        }
      } else {
        // Renewal hanya utk plan yang sedang ditagih tenant (cegah ganti plan liar).
        if (!activation.planId || activation.planId !== planId) {
          return Response.json({ error: "Plan tidak sesuai tagihan aktif tenant." }, { status: 400 });
        }
      }
    } else if (kind === "addon") {
      addonKey = typeof body.addonKey === "string" ? body.addonKey.trim() : "";
      if (!addonKey) return Response.json({ error: "Pilih addon terlebih dahulu" }, { status: 400 });
      const addon = catalog.addons.find((a) => a.key === addonKey);
      if (!addon || addon.priceMonthly == null) {
        return Response.json({ error: "Addon tidak tersedia untuk dibeli" }, { status: 400 });
      }
    } else if (kind === "topup") {
      const raw = body.creditMessages;
      creditMessages = typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
      if (!creditMessages) {
        return Response.json({ error: "Jumlah pesan (creditMessages) harus bilangan bulat positif" }, { status: 400 });
      }
      const minMessages = Math.ceil(
        catalog.settings.creditMinTopupRp / catalog.settings.creditPerMessageRp,
      );
      if (creditMessages < minMessages) {
        return Response.json(
          { error: `Minimal top-up ${minMessages} pesan (Rp ${catalog.settings.creditMinTopupRp.toLocaleString("id-ID")})` },
          { status: 400 },
        );
      }
      if (activation.pending) {
        // Aktivasi Espresso: top-up pertama membawa planId prepaid (tanpa biaya aktivasi).
        const rawPlanId = typeof body.planId === "string" ? body.planId.trim() : "";
        if (!rawPlanId) {
          return Response.json({ error: "Pilih paket Espresso untuk top-up pertama (aktivasi)." }, { status: 400 });
        }
        const plan = catalog.plans.find((p) => p.id === rawPlanId);
        if (!plan || plan.kind !== "prepaid") {
          return Response.json({ error: "Paket prepaid tidak tersedia." }, { status: 400 });
        }
        planId = plan.id;
      }
    }

    const returnUrl = `${new URL(req.url).origin}/dashboard/langganan`;
    const order = await createOrder({
      tenantId,
      userId,
      kind: kind as OrderKind,
      planId: planId ?? undefined,
      addonKey: addonKey ?? undefined,
      items: addonItems,
      creditMessages,
      payMethod,
      returnUrl,
    });
    return Response.json(
      { order: publicOrder(order), redirectUrl: order.checkoutUrl ?? null },
      { status: 201 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "TENANT_NOT_FOUND") {
      return Response.json({ error: "Tenant tidak ditemukan" }, { status: 404 });
    }
    if (["PLAN_INVALID", "ADDON_INVALID", "CREDIT_INVALID", "ORDER_KIND_INVALID"].includes(msg)) {
      return Response.json({ error: "Pesanan tidak valid — muat ulang halaman checkout." }, { status: 400 });
    }
    console.error("billing/orders POST:", e);
    return Response.json({ error: "Gagal membuat pesanan" }, { status: 500 });
  }
}
