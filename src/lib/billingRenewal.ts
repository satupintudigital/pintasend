// ─── Renewal bulanan lazy (self-serve) ──────────────────────────────────────
// Saat dashboard langganan dibuka (GET /api/billing/my), periode yang sudah
// habis diproses: terbitkan Invoice (registri) + Order renewal_subscription
// dengan skipGateway=true (Tripay TIDAK dipanggil saat penerbitan — dibuat
// belakangan saat user klik "Bayar Sekarang"). Idempoten: satu invoice per
// tenant per periode; kalau sudah ada → skip.

import { query, queryOne } from "@/lib/db";
import { uuidv7 } from "@/lib/uuidv7";
import { getPlatformSetting } from "@/lib/platformSettings";
import { monthPeriodRange, currentMonthStartIso } from "@/lib/monthPeriod";

export interface RenewalTarget {
  id: string;
  planId: string;
  planName: string;
  priceMonthly: number | null;
  kind: string;
  activatedAt: string | null;
  suspendedAt: string | null;
  planPeriodEnd: string | null;
}

/** Waktu (millis) bulan berikutnya di WIB untuk tanggal awal periode. */
function nextMonthParts(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * Periode berikutnya (bulan kalender WIB) setelah periodStart. `null` → bulan
 * berjalan WIB. Pure — di-test.
 */
export function nextMonthPeriod(
  periodStart: string | null,
  now: Date = new Date(),
): { periodStart: Date; periodEnd: Date } {
  if (!periodStart) {
    const start = currentMonthStartIso(now);
    const { year, month } = parseWibYearMonth(start);
    return monthPeriodRange(year, month);
  }
  const { year, month } = parseWibYearMonth(periodStart);
  const next = nextMonthParts(year, month);
  return monthPeriodRange(next.year, next.month);
}

function parseWibYearMonth(iso: string): { year: number; month: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { year: Number(get("year")), month: Number(get("month")) };
}

/**
 * Terbitkan invoice + order renewal bila periode berlangganan sudah habis.
 * Proses hanya utk tenant subscription yang aktif (activatedAt) & tidak
 * suspended; plan harus isActive dengan priceMonthly. Mengembalikan flag
 * apakah invoice/order baru dibuat.
 */
export async function ensureCurrentPeriod(
  tenantId: string,
  now: Date = new Date(),
): Promise<{ invoiceCreated: boolean; orderCreated: boolean }> {
  const tenant = await queryOne<RenewalTarget>(
    `SELECT t.id, t."planId", p.name AS "planName", p."priceMonthly", p.kind,
            t."activatedAt", t."suspendedAt", t."planPeriodEnd"
     FROM "Tenant" t LEFT JOIN "Plan" p ON p.id = t."planId"
     WHERE t.id = $1`,
    [tenantId],
  );
  if (!tenant) return { invoiceCreated: false, orderCreated: false };
  // Syarat renewal: subscription, sudah aktif, tidak suspended, price ada.
  if (tenant.kind !== "subscription") return { invoiceCreated: false, orderCreated: false };
  if (!tenant.activatedAt) return { invoiceCreated: false, orderCreated: false };
  if (tenant.suspendedAt) return { invoiceCreated: false, orderCreated: false };
  if (!tenant.priceMonthly) return { invoiceCreated: false, orderCreated: false };
  // Periode belum habis → tidak perlu renewal.
  if (tenant.planPeriodEnd && new Date(tenant.planPeriodEnd) >= now) {
    return { invoiceCreated: false, orderCreated: false };
  }

  // Periode berikutnya: dari planPeriodEnd terakhir (kalau sudah ada) else bulan berjalan.
  const next = nextMonthPeriod(tenant.planPeriodEnd, now);
  const periodStartIso = next.periodStart.toISOString();
  const periodEndIso = next.periodEnd.toISOString();

  // Cek invoice utk periode berjalan — sudah ada → skip (idempoten).
  const invoiceExists = await queryOne<{ id: string }>(
    'SELECT id FROM "Invoice" WHERE "tenantId" = $1 AND "periodStart" = $2',
    [tenantId, periodStartIso],
  );
  if (invoiceExists) return { invoiceCreated: false, orderCreated: false };

  // Expiry order dari setting (default 1440 menit).
  const expiryRaw = await getPlatformSetting("order_expiry_minutes");
  const expiryMinutes = typeof expiryRaw === "number" ? expiryRaw : 1440;
  const expiresAt = new Date(now.getTime() + expiryMinutes * 60_000).toISOString();

  // 1. Insert Invoice (registri tagihan bulanan).
  await query(
    `INSERT INTO "Invoice"
       (id, "tenantId", "planId", "planName", "priceMonthly", "periodStart", "periodEnd", status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'issued')`,
    [uuidv7(), tenantId, tenant.planId, tenant.planName, tenant.priceMonthly, periodStartIso, periodEndIso],
  );

  // 2. Insert Order renewal_subscription (skipGateway — bayar dibuat saat klik).
  const orderId = uuidv7();
  await query(
    `INSERT INTO "Order"
       (id, "tenantId", "userId", kind, status, "invoiceId", "planId", amount,
        "itemsJson", "periodStart", "periodEnd", gateway, "payMethod", "expiresAt", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'renewal_subscription', 'pending', $4, $5, $6, $7, $8, $9, 'tripay', $10, $11, now(), now())`,
    [
      orderId,
      tenantId,
      // userId: owner pertama tenant (penanggung tagihan).
      await findOwnerUserId(tenantId),
      (await findInvoiceIdByPeriod(tenantId, periodStartIso)),
      tenant.planId,
      tenant.priceMonthly,
      JSON.stringify([{ type: "plan", refId: tenant.planId, name: tenant.planName, quantity: 1, unitPrice: tenant.priceMonthly }]),
      periodStartIso,
      periodEndIso,
      "", // payMethod — diisi saat klik bayar
      expiresAt,
    ],
  );

  return { invoiceCreated: true, orderCreated: true };
}

async function findOwnerUserId(tenantId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM "User" WHERE "tenantId" = $1 AND role = 'owner' ORDER BY "createdAt" ASC LIMIT 1`,
    [tenantId],
  );
  return row?.id ?? null;
}

async function findInvoiceIdByPeriod(tenantId: string, periodStartIso: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM "Invoice" WHERE "tenantId" = $1 AND "periodStart" = $2 LIMIT 1',
    [tenantId, periodStartIso],
  );
  return row?.id ?? null;
}