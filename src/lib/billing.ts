// ─── Billing order-centric (self-serve) ─────────────────────────────────────
// Order = instrumen pembayaran. Semua yang bisa dibayar (paket pertama,
// renewal, addon mandiri, top-up prepaid) direpresentasikan sebagai Order
// dengan snapshot item. `Invoice` tetap registri tagihan bulanan; order
// renewal menaut ke invoice via `invoiceId`.
//
// Idempotensi: setiap transisi status dijaga oleh guard `WHERE status = ...`
// (pola yang sama dengan repo — driver neon HTTP stateless, tanpa transaksi
// BEGIN/COMMIT). finalizePaidOrder hanya memproses order status `pending`
// sekali; callback ganda aman (baris kedua → `{ok:true}` tanpa efek).

import { query, queryOne } from "@/lib/db";
import { uuidv7 } from "@/lib/uuidv7";
import { getPublicCatalog, type PublicCatalog } from "@/lib/catalog";
import { getPaymentProvider } from "@/lib/payments";
import { addCredit } from "@/lib/credit";
import { recordAudit } from "@/lib/audit";
import { monthPeriodRange } from "@/lib/monthPeriod";
import { syncTenantD1 } from "@/lib/tenantStore";

export type OrderKind = "first_subscription" | "renewal_subscription" | "addon" | "topup";
export type OrderStatus = "pending" | "paid" | "expired" | "cancelled";

export interface OrderItem {
  type: "plan" | "activation" | "addon" | "credit";
  refId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderRow {
  id: string;
  tenantId: string;
  userId: string;
  kind: OrderKind;
  status: OrderStatus;
  invoiceId: string | null;
  planId: string | null;
  addonKey: string | null;
  amount: number;
  itemsJson: string;
  periodStart: string | null;
  periodEnd: string | null;
  creditMessages: number | null;
  gateway: string;
  gatewayRef: string | null;
  payCode: string | null;
  checkoutUrl: string | null;
  payMethod: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export class OrderPendingError extends Error {
  constructor(message = "Masih ada order pending untuk item yang sama") {
    super(message);
    this.name = "OrderPendingError";
  }
}

const ORDER_SELECT = [
  "id", '"tenantId"', '"userId"', "kind", "status", '"invoiceId"', '"planId"',
  '"addonKey"', "amount", '"itemsJson"', '"periodStart"', '"periodEnd"',
  '"creditMessages"', "gateway", '"gatewayRef"', '"payCode"', '"checkoutUrl"',
  '"payMethod"', '"expiresAt"', '"paidAt"', '"createdAt"', '"updatedAt"',
].join(", ");

function toOrderRow(r: Record<string, unknown>): OrderRow {
  return {
    id: String(r.id),
    tenantId: String(r.tenantId),
    userId: String(r.userId),
    kind: r.kind as OrderKind,
    status: r.status as OrderStatus,
    invoiceId: r.invoiceId ? String(r.invoiceId) : null,
    planId: r.planId ? String(r.planId) : null,
    addonKey: r.addonKey ? String(r.addonKey) : null,
    amount: Number(r.amount ?? 0),
    itemsJson: String(r.itemsJson ?? "[]"),
    periodStart: r.periodStart ? String(r.periodStart) : null,
    periodEnd: r.periodEnd ? String(r.periodEnd) : null,
    creditMessages: r.creditMessages != null ? Number(r.creditMessages) : null,
    gateway: String(r.gateway ?? "tripay"),
    gatewayRef: r.gatewayRef ? String(r.gatewayRef) : null,
    payCode: r.payCode ? String(r.payCode) : null,
    checkoutUrl: r.checkoutUrl ? String(r.checkoutUrl) : null,
    payMethod: r.payMethod ? String(r.payMethod) : null,
    expiresAt: r.expiresAt ? String(r.expiresAt) : null,
    paidAt: r.paidAt ? String(r.paidAt) : null,
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt),
  };
}

export async function getOrder(tenantId: string, orderId: string): Promise<OrderRow | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${ORDER_SELECT} FROM "Order" WHERE id = $1 AND "tenantId" = $2`,
    [orderId, tenantId],
  );
  return row ? toOrderRow(row) : null;
}

/** Hanya untuk callback internal pasca-verifikasi HMAC (bukan route session). */
export async function getOrderAnyScope(orderId: string): Promise<OrderRow | null> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${ORDER_SELECT} FROM "Order" WHERE id = $1`,
    [orderId],
  );
  return row ? toOrderRow(row) : null;
}

export async function listOrders(tenantId: string, limit = 20): Promise<OrderRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ${ORDER_SELECT} FROM "Order" WHERE "tenantId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
    [tenantId, limit],
  );
  return rows.map(toOrderRow);
}

/** Semua order pending yang sudah punya gatewayRef — resync status (admin). */
export async function listPendingGatewayOrders(): Promise<OrderRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ${ORDER_SELECT} FROM "Order" WHERE status = 'pending' AND "gatewayRef" IS NOT NULL ORDER BY "createdAt" ASC`,
    [],
  );
  return rows.map(toOrderRow);
}

/** Cari order pending yang belum expire untuk kind+ref yang sama. */
export async function findPendingOrder(opts: {
  tenantId: string;
  kind: OrderKind;
  planId?: string | null;
  addonKey?: string | null;
  now?: Date;
}): Promise<OrderRow | null> {
  const nowIso = (opts.now ?? new Date()).toISOString();
  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${ORDER_SELECT} FROM "Order"
     WHERE "tenantId" = $1 AND kind = $2 AND status = 'pending'
       AND ("expiresAt" IS NULL OR "expiresAt" > $3)
       AND "planId" IS NOT DISTINCT FROM $4
       AND "addonKey" IS NOT DISTINCT FROM $5
     ORDER BY "createdAt" DESC LIMIT 1`,
    [opts.tenantId, opts.kind, nowIso, opts.planId ?? null, opts.addonKey ?? null],
  );
  return row ? toOrderRow(row) : null;
}

/**
 * Akhir periode bulan kalender WIB yang memuat tanggal mulai (periode = sisa
 * bulan berjalan). Pure — di-test.
 */
export function periodEndForStart(start: Date | string): Date {
  const d = new Date(start);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  return monthPeriodRange(year, month).periodEnd;
}

function parseItems(itemsJson: string): OrderItem[] {
  try {
    const parsed = JSON.parse(itemsJson);
    return Array.isArray(parsed) ? (parsed as OrderItem[]) : [];
  } catch {
    return [];
  }
}

async function loadCatalogOnce(): Promise<PublicCatalog> {
  return getPublicCatalog();
}

/**
 * Buat order pembayaran.
 * - skipGateway=false (default): panggil provider.createPayment lalu simpan
 *   gatewayRef/payCode/checkoutUrl/payMethod/expiresAt.
 * - skipGateway=true: simpan pending TANPA provider (dipakai renewal — Tripay
 *   dibuat belakangan saat user klik Bayar).
 * - Idempoten: order pending yang sama (kind+ref, belum expire) dikembalikan
 *   apa adanya (tanpa membuat pembayaran baru).
 */
export async function createOrder(input: {
  tenantId: string;
  userId: string;
  kind: OrderKind;
  planId?: string | null;
  addonKey?: string | null;
  invoiceId?: string | null;
  items: OrderItem[];
  creditMessages?: number | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  payMethod: string;
  returnUrl: string;
  skipGateway?: boolean;
  now?: Date;
}): Promise<OrderRow> {
  const now = input.now ?? new Date();
  const catalog = await loadCatalogOnce();

  // 1. Validasi tenant.
  const tenant = await queryOne<{ id: string; name: string; activatedAt: string | null }>(
    'SELECT id, name, "activatedAt" FROM "Tenant" WHERE id = $1',
    [input.tenantId],
  );
  if (!tenant) throw new Error("TENANT_NOT_FOUND");

  // 2. Validasi katalog & hitung amount server-side (jangan percaya client).
  let amount = 0;
  let creditMessages: number | null = input.creditMessages ?? null;
  const items: OrderItem[] = [];

  if (input.kind === "first_subscription" || input.kind === "renewal_subscription") {
    const plan = catalog.plans.find((p) => p.id === input.planId);
    if (!plan || plan.kind !== "subscription" || plan.priceMonthly == null) {
      throw new Error("PLAN_INVALID");
    }
    items.push({ type: "plan", refId: plan.id, name: plan.name, quantity: 1, unitPrice: plan.priceMonthly });
    if (input.kind === "first_subscription" && !tenant.activatedAt) {
      items.push({ type: "activation", name: "Biaya aktivasi", quantity: 1, unitPrice: catalog.settings.activationFeeRp });
    }
    // Addon yang ikut (khusus first_subscription) — harga dari katalog.
    for (const it of input.items) {
      if (it.type === "addon") {
        const addon = catalog.addons.find((a) => a.key === it.refId);
        if (!addon || addon.priceMonthly == null) throw new Error("ADDON_INVALID");
        items.push({ type: "addon", refId: addon.key, name: addon.name, quantity: 1, unitPrice: addon.priceMonthly });
      }
    }
  } else if (input.kind === "addon") {
    const addon = catalog.addons.find((a) => a.key === input.addonKey);
    if (!addon || addon.priceMonthly == null) throw new Error("ADDON_INVALID");
    items.push({ type: "addon", refId: addon.key, name: addon.name, quantity: 1, unitPrice: addon.priceMonthly });
    creditMessages = null;
  } else if (input.kind === "topup") {
    if (!creditMessages || creditMessages < 1) throw new Error("CREDIT_INVALID");
    // Top-up pertama (tenant pending) mengaktifkan tenant + assign plan prepaid
    // (Espresso). planId hanya valid utk plan kind=prepaid — diverifikasi dari
    // katalog, bukan dari client.
    if (input.planId) {
      const plan = catalog.plans.find((p) => p.id === input.planId);
      if (!plan || plan.kind !== "prepaid") throw new Error("PLAN_INVALID");
    }
    const unit = catalog.settings.creditPerMessageRp;
    items.push({ type: "credit", name: `Top-up ${creditMessages} pesan`, quantity: creditMessages, unitPrice: unit });
  } else {
    throw new Error("ORDER_KIND_INVALID");
  }
  amount = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);

  // 3. Idempoten: kembalikan order pending yang masih berlaku. Bila order
  //    pending ditemukan TANPA gatewayRef (mis. renewal skipGateway dari
  //    ensureCurrentPeriod) dan pemanggil ingin bayar (skipGateway=false),
  //    buat payment Tripay dan attach ke order tsb (flow "Bayar Sekarang").
  const existing = await findPendingOrder({
    tenantId: input.tenantId,
    kind: input.kind,
    planId: input.kind === "first_subscription" || input.kind === "renewal_subscription" ? input.planId : null,
    addonKey: input.kind === "addon" ? input.addonKey : null,
    now,
  });
  if (existing) {
    if (!input.skipGateway && !existing.gatewayRef) {
      const payment = await createPaymentForOrder(existing, catalog, tenant, input);
      await query(
        `UPDATE "Order" SET "gatewayRef" = $2, "payCode" = $3, "checkoutUrl" = $4,
           "payMethod" = $5, "expiresAt" = $6, "updatedAt" = now()
         WHERE id = $1`,
        [existing.id, payment.gatewayRef, payment.payCode, payment.checkoutUrl, payment.payMethod, existing.expiresAt ?? new Date(now.getTime() + catalog.settings.orderExpiryMinutes * 60_000).toISOString()],
      );
      return {
        ...existing,
        gatewayRef: payment.gatewayRef,
        payCode: payment.payCode,
        checkoutUrl: payment.checkoutUrl,
        payMethod: payment.payMethod,
      };
    }
    return existing;
  }

  // 4. Simpan order (pending).
  const orderId = uuidv7();
  const periodStart = input.periodStart ?? (input.kind === "addon" ? now : null);
  const periodEnd = input.periodEnd ?? (periodStart ? periodEndForStart(periodStart) : null);
  const expiresAt = new Date(now.getTime() + catalog.settings.orderExpiryMinutes * 60_000).toISOString();

  await query(
    `INSERT INTO "Order"
       (id, "tenantId", "userId", kind, status, "invoiceId", "planId", "addonKey",
        amount, "itemsJson", "periodStart", "periodEnd", "creditMessages",
        gateway, "payMethod", "expiresAt", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12,'tripay',$13,$14,now(),now())`,
    [
      orderId,
      input.tenantId,
      input.userId,
      input.kind,
      input.invoiceId ?? null, // (digunakan renewal di Task 6 via param optional)
      input.planId ?? null,
      input.addonKey ?? null,
      amount,
      JSON.stringify(items),
      periodStart ? periodStart.toISOString() : null,
      periodEnd ? periodEnd.toISOString() : null,
      creditMessages,
      input.payMethod,
      expiresAt,
    ],
  );

  let order = toOrderRow({
    id: orderId,
    tenantId: input.tenantId,
    userId: input.userId,
    kind: input.kind,
    status: "pending",
    invoiceId: input.invoiceId ?? null,
    planId: input.planId ?? null,
    addonKey: input.addonKey ?? null,
    amount,
    itemsJson: JSON.stringify(items),
    periodStart: periodStart ? periodStart.toISOString() : null,
    periodEnd: periodEnd ? periodEnd.toISOString() : null,
    creditMessages,
    gateway: "tripay",
    gatewayRef: null,
    payCode: null,
    checkoutUrl: null,
    payMethod: input.payMethod,
    expiresAt,
    paidAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  if (!input.skipGateway) {
    const payment = await createPaymentForOrder(order, catalog, tenant, input);
    await query(
      `UPDATE "Order" SET "gatewayRef" = $2, "payCode" = $3, "checkoutUrl" = $4,
         "payMethod" = $5, "expiresAt" = $6, "updatedAt" = now()
       WHERE id = $1`,
      [orderId, payment.gatewayRef, payment.payCode, payment.checkoutUrl, payment.payMethod, expiresAt],
    );
    order = {
      ...order,
      gatewayRef: payment.gatewayRef,
      payCode: payment.payCode,
      checkoutUrl: payment.checkoutUrl,
      payMethod: payment.payMethod,
    };
  }

  return order;
}

/** Buat payment Tripay untuk sebuah order (baru/existing). */
async function createPaymentForOrder(
  order: OrderRow,
  catalog: PublicCatalog,
  tenant: { id: string; name: string; activatedAt: string | null },
  input: {
    tenantId: string;
    userId: string;
    returnUrl: string;
    payMethod: string;
    expiryMinutes?: number;
  },
): Promise<{"gatewayRef": string; "payCode": string | null; "checkoutUrl": string | null; "payMethod": string; "qrString": string | null}> {
  const owner = await queryOne<{ email: string }>(
    `SELECT email FROM "User" WHERE "tenantId" = $1 AND role = 'owner' ORDER BY "createdAt" ASC LIMIT 1`,
    [input.tenantId],
  );
  return getPaymentProvider().createPayment({
    merchantRef: order.id,
    amount: order.amount,
    customerName: tenant.name.slice(0, 100),
    customerEmail: owner?.email ?? "",
    items: parseItems(order.itemsJson).map((it) => ({ name: it.name, price: it.unitPrice, quantity: it.quantity })),
    method: input.payMethod,
    returnUrl: input.returnUrl,
    expiryMinutes: catalog.settings.orderExpiryMinutes,
  });
}

/** Expire semua order pending yang sudah lewat batas waktu. */
export async function expireStaleOrders(now?: Date): Promise<number> {
  const rows = await query<{ id: string }>(
    `UPDATE "Order" SET status = 'expired', "updatedAt" = now()
     WHERE status = 'pending' AND "expiresAt" < $1 RETURNING id`,
    [now ? now.toISOString() : new Date().toISOString()],
  );
  return rows.length;
}

/** Tandai order expired dari gateway (status EXPIRED) — hanya dari pending. */
export async function markOrderExpiredFromGateway(orderId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE "Order" SET status = 'expired', "updatedAt" = now()
     WHERE id = $1 AND status = 'pending' RETURNING id`,
    [orderId],
  );
  return rows.length > 0;
}

interface FinalizePaymentInfo {
  gatewayRef?: string | null;
  payMethod?: string | null;
  paidAt?: string | null;
  callbackRaw?: string | null;
}

/**
 * Finalisasi order paid — idempoten: hanya memproses order status `pending`;
 * panggilan berikutnya (callback ganda) → `{ok:true}` tanpa efek. Efek per kind
 * diterapkan setelah claim status (guard atomik, pola repo tanpa BEGIN/COMMIT).
 */
export async function finalizePaidOrder(
  orderId: string,
  payment: FinalizePaymentInfo = {},
  actor?: { id: string; name: string } | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const rows = await query<Record<string, unknown>>(
      `UPDATE "Order" SET status = 'paid', "paidAt" = COALESCE($2, now()),
         "gatewayRef" = COALESCE($3, "gatewayRef"),
         "payMethod" = COALESCE($4, "payMethod"),
         "callbackRaw" = COALESCE($5, "callbackRaw"),
         "updatedAt" = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING ${ORDER_SELECT}`,
      [orderId, payment.paidAt ? new Date(payment.paidAt).toISOString() : null,
        payment.gatewayRef ?? null, payment.payMethod ?? null, payment.callbackRaw ?? null],
    );
    const raw = rows[0];
    if (!raw) return { ok: true }; // sudah diproses / tidak ditemukan — idempoten
    const order = toOrderRow(raw);

    // Efek per kind.
    if (order.kind === "first_subscription" || order.kind === "renewal_subscription") {
      const tenant = await queryOne<{ id: string; name: string; suspendedAt: string | null }>(
        'SELECT id, name, "suspendedAt" FROM "Tenant" WHERE id = $1',
        [order.tenantId],
      );
      const periodEnd = order.periodEnd ? new Date(order.periodEnd) : periodEndForStart(new Date());
      await query(
        `UPDATE "Tenant" SET "planId" = $2, "planAssignedAt" = now(),
           "planPeriodEnd" = $3,
           "activatedAt" = COALESCE("activatedAt", now())
         WHERE id = $1`,
        [order.tenantId, order.planId, periodEnd.toISOString()],
      );
      // Addon yang dibeli bersamaan (first_subscription) aktif sampai periode.
      const items = parseItems(order.itemsJson).filter((it) => it.type === "addon");
      for (const it of items) {
        if (!it.refId) continue;
        await upsertTenantAddon(order.tenantId, it.refId, periodEnd);
      }
      if (tenant) {
        await syncTenantD1({
          id: tenant.id,
          name: tenant.name,
          suspendedAt: tenant.suspendedAt,
          activatedAt: new Date().toISOString(),
        }).catch(() => undefined);
      }
      if (order.invoiceId) {
        await query(
          `UPDATE "Invoice" SET status = 'paid', "paidAt" = now(), "updatedAt" = now()
           WHERE id = $1 AND status = 'issued'`,
          [order.invoiceId],
        );
      }
    } else if (order.kind === "addon") {
      const tenant = await queryOne<{ id: string; planPeriodEnd: string | null }>(
        'SELECT id, "planPeriodEnd" FROM "Tenant" WHERE id = $1',
        [order.tenantId],
      );
      const end = tenant?.planPeriodEnd ? new Date(tenant.planPeriodEnd) : periodEndForStart(new Date());
      if (order.addonKey) await upsertTenantAddon(order.tenantId, order.addonKey, end);
    } else if (order.kind === "topup") {
      // Top-up pertama dengan planId prepaid = aktivasi Espresso: assign plan +
      // activatedAt (guard `activatedAt IS NULL` — race-safe, hanya sekali).
      if (order.planId) {
        const tenant = await queryOne<{
          id: string;
          name: string;
          suspendedAt: string | null;
          activatedAt: string | null;
        }>('SELECT id, name, "suspendedAt", "activatedAt" FROM "Tenant" WHERE id = $1', [
          order.tenantId,
        ]);
        if (tenant && !tenant.activatedAt) {
          const activated = await query<{ id: string }>(
            'UPDATE "Tenant" SET "planId" = $2, "planAssignedAt" = now(), "activatedAt" = now(), "updatedAt" = now() ' +
              'WHERE id = $1 AND "activatedAt" IS NULL RETURNING id',
            [order.tenantId, order.planId],
          );
          if (activated.length > 0) {
            await syncTenantD1({
              id: tenant.id,
              name: tenant.name,
              suspendedAt: tenant.suspendedAt,
              activatedAt: new Date().toISOString(),
            }).catch(() => undefined);
          }
        }
      }
      if (order.creditMessages && order.creditMessages > 0) {
        await addCredit({ tenantId: order.tenantId, messages: order.creditMessages, orderId: order.id, reason: "topup" });
      }
    }

    await recordAudit({
      tenantId: order.tenantId,
      actor: actor
        ? { id: actor.id, email: actor.name, role: "system" }
        : { id: null, email: "system", role: "system" },
      action: "billing.order.paid",
      targetType: "Order",
      targetId: order.id,
      meta: { kind: order.kind, amount: order.amount },
    });
    return { ok: true };
  } catch (e) {
    console.error("billing: finalize gagal (order diproses parsial?):", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function upsertTenantAddon(
  tenantId: string,
  key: string,
  activeUntil: Date,
): Promise<void> {
  await query(
    `INSERT INTO "TenantAddon" (id, "tenantId", key, active, "activeUntil")
     VALUES ($1, $2, $3, true, $4)
     ON CONFLICT ("tenantId", key) DO UPDATE SET
       active = true, "activeUntil" = EXCLUDED."activeUntil", "updatedAt" = now()`,
    [uuidv7(), tenantId, key, activeUntil.toISOString()],
  );
}

// Re-export helper parse item agar route & tugas lain tidak perlu import ulang.
export { parseItems };