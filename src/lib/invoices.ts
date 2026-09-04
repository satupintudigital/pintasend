// ─── Invoice registri tagihan bulanan (simulasi) ────────────────────────────
// MVP: belum integrasi payment gateway — platform admin men-generate tagihan
// per bulan utk tenant ber-plan (snapshot nama + harga saat terbit), lalu
// menandai paid/void manual. Idempoten: satu invoice per tenant per periode.
// Periode mengikuti bulan kalender WIB (lihat src/lib/monthPeriod.ts).

import { query } from "@/lib/db";
import { uuidv7 } from "@/lib/uuidv7";
import { isValidPeriod, monthPeriodRange } from "@/lib/monthPeriod";

export interface InvoiceRow {
  id: string;
  tenantId: string;
  tenantName: string;
  planId: string | null;
  planName: string;
  priceMonthly: number | null;
  periodStart: string;
  periodEnd: string;
  status: string; // issued | paid | void
  paidAt: string | null;
  createdAt: string;
}

export interface GenerateResult {
  created: number;
  skipped: number;
}

interface TenantPlanTarget {
  id: string;
  planId: string;
  planName: string;
  priceMonthly: number | null;
}

/**
 * Generate invoice bulan tertentu utk tenant ber-plan & aktif (tidak
 * suspended). Idempoten: tenant yang sudah punya invoice periode tsb di-skip.
 */
export async function generateMonthlyInvoices(
  year: number,
  month: number,
): Promise<GenerateResult> {
  if (!isValidPeriod(year, month)) {
    throw new Error("Periode tidak valid");
  }
  const { periodStart, periodEnd } = monthPeriodRange(year, month);
  const isoStart = periodStart.toISOString();
  const isoEnd = periodEnd.toISOString();

  const tenants = await query<TenantPlanTarget>(
    `SELECT t.id, t."planId", p.name AS "planName", p."priceMonthly"
     FROM "Tenant" t JOIN "Plan" p ON p.id = t."planId"
     WHERE t."suspendedAt" IS NULL AND t."planId" IS NOT NULL`,
  );
  if (tenants.length === 0) return { created: 0, skipped: 0 };

  // Deteksi duplikat: tenant yang sudah punya invoice di periode tsb.
  const existing = await query<{ tenantId: string }>(
    `SELECT "tenantId" FROM "Invoice" WHERE "periodStart" = $1`,
    [isoStart],
  );
  const haveInvoice = new Set(existing.map((r) => r.tenantId));

  const targets = tenants.filter((t) => !haveInvoice.has(t.id));
  if (targets.length === 0) return { created: 0, skipped: tenants.length };

  const values: string[] = [];
  const args: unknown[] = [];
  for (const t of targets) {
    values.push(
      `($${args.length + 1}, $${args.length + 2}, $${args.length + 3}, $${args.length + 4}, $${args.length + 5}, $${args.length + 6}, $${args.length + 7}, 'issued')`,
    );
    args.push(
      uuidv7(),
      t.id,
      t.planId,
      t.planName,
      t.priceMonthly,
      isoStart,
      isoEnd,
    );
  }
  await query(
    `INSERT INTO "Invoice"
       (id, "tenantId", "planId", "planName", "priceMonthly", "periodStart", "periodEnd", status)
     VALUES ${values.join(", ")}`,
    args,
  );
  return { created: targets.length, skipped: tenants.length - targets.length };
}

export interface InvoiceQuery {
  tenantId?: string;
  status?: string;
  year?: number;
  month?: number;
  page?: number;
  limit?: number;
}

export async function listInvoices(params: InvoiceQuery = {}): Promise<{
  invoices: InvoiceRow[];
  total: number;
}> {
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * limit;

  const clauses: string[] = [];
  const args: unknown[] = [];

  const push = (sql: string, v: unknown) => {
    clauses.push(`${sql} = $${args.length + 1}`);
    args.push(v);
  };
  if (params.tenantId) push('i."tenantId"', params.tenantId);
  if (params.status) push("i.status", params.status);
  if (params.year && params.month && isValidPeriod(params.year, params.month)) {
    const { periodStart, periodEnd } = monthPeriodRange(params.year, params.month);
    clauses.push(`i."periodStart" = $${args.length + 1}`);
    args.push(periodStart.toISOString());
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [countRows, rows] = await Promise.all([
    query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM "Invoice" i ${where}`,
      args,
    ),
    query<InvoiceRow>(
      `SELECT i.id, i."tenantId", t.name AS "tenantName", i."planId", i."planName",
              i."priceMonthly", i."periodStart", i."periodEnd", i.status, i."paidAt", i."createdAt"
       FROM "Invoice" i LEFT JOIN "Tenant" t ON t.id = i."tenantId"
       ${where} ORDER BY i."periodStart" DESC, i."createdAt" DESC
       LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    ),
  ]);
  return { invoices: rows, total: Number(countRows[0]?.count ?? 0) };
}

/** Void invoice berstatus issued (bukan paid — sudah dianggap lunas). */
export async function voidInvoice(id: string): Promise<{ ok: boolean; reason?: string }> {
  const rows = await query<{ id: string }>(
    `UPDATE "Invoice" SET status = 'void', "updatedAt" = now()
     WHERE id = $1 AND status = 'issued' RETURNING id`,
    [id],
  );
  if (rows.length === 0) {
    return { ok: false, reason: "Invoice tidak ditemukan atau sudah diproses" };
  }
  return { ok: true };
}

/** Tandai lunas invoice berstatus issued. */
export async function markInvoicePaid(id: string): Promise<{ ok: boolean; reason?: string }> {
  const rows = await query<{ id: string }>(
    `UPDATE "Invoice" SET status = 'paid', "paidAt" = now(), "updatedAt" = now()
     WHERE id = $1 AND status = 'issued' RETURNING id`,
    [id],
  );
  if (rows.length === 0) {
    return { ok: false, reason: "Invoice tidak ditemukan atau sudah diproses" };
  }
  return { ok: true };
}

// ── CSV export (helper pure, ter-test) ──────────────────────────────────────

export const INVOICE_CSV_HEADER =
  "periodeStart,tenantId,tenantName,planName,priceMonthly,status,paidAt";

function csvEscape(v: string | number | null | undefined): string {
  const s = (v ?? "").toString().trim();
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Serialisasi invoice → CSV lengkap (header + baris). */
export function exportInvoicesCsv(rows: InvoiceRow[]): string {
  const lines = rows.map((r) =>
    [
      csvEscape(r.periodStart),
      csvEscape(r.tenantId),
      csvEscape(r.tenantName),
      csvEscape(r.planName),
      csvEscape(r.priceMonthly),
      csvEscape(r.status),
      csvEscape(r.paidAt),
    ].join(","),
  );
  return [INVOICE_CSV_HEADER, ...lines].join("\n") + "\n";
}
