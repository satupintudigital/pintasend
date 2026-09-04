// ─── Saldo pesan prepaid (paket Espresso) ───────────────────────────────────
// TenantBalance = saldo saat ini; CreditLedger = jejak +/_ (topup / pemakaian)
// dengan refId unik agar potong/top-up idempoten (callback ganda aman).

import { query, queryOne } from "@/lib/db";
import { uuidv7 } from "@/lib/uuidv7";

/** Baca saldo pesan saat ini (0 bila belum pernah ada baris). */
export async function getBalance(tenantId: string): Promise<number> {
  const row = await queryOne<{ balance: number }>(
    'SELECT balance FROM "TenantBalance" WHERE "tenantId" = $1',
    [tenantId],
  );
  return row?.balance ?? 0;
}

/**
 * Tambah saldo (top-up). Upsert atomik TenantBalance + tulis CreditLedger.
 * refId ledger = orderId agar satu order hanya menulis satu baris
 * (dijaga UNIQUE partial index; finalisasi sekali via status guard di billing).
 */
export async function addCredit(input: {
  tenantId: string;
  messages: number;
  orderId?: string | null;
  reason?: string;
}): Promise<number> {
  const rows = await query<{ balance: number }>(
    'INSERT INTO "TenantBalance" ("tenantId", balance) VALUES ($1, $2) ' +
      'ON CONFLICT ("tenantId") DO UPDATE SET balance = "TenantBalance".balance + EXCLUDED.balance, "updatedAt" = now() ' +
      "RETURNING balance",
    [input.tenantId, input.messages],
  );
  const balance = rows[0]?.balance ?? input.messages;
  await query(
    'INSERT INTO "CreditLedger" (id, "tenantId", "orderId", delta, reason, "refId") VALUES ($1, $2, $3, $4, $5, $6) ' +
      "ON CONFLICT (\"refId\") WHERE \"refId\" IS NOT NULL DO NOTHING",
    [uuidv7(), input.tenantId, input.orderId ?? null, input.messages, input.reason ?? "topup", input.orderId ?? null],
  );
  return balance;
}

/**
 * Potong saldo (kirim 1 pesan prepaid). UPDATE atomik bersyarat saldo cukup;
 * 0 baris → gagal (ok:false) tanpa ledger. Sukses → tulis CreditLedger -delta
 * dengan refId unik (idempoten via ON CONFLICT DO NOTHING).
 */
export async function spendCredit(input: {
  tenantId: string;
  messages: number;
  refId: string;
  reason?: string;
}): Promise<{ ok: boolean; balance: number }> {
  const rows = await query<{ balance: number }>(
    'UPDATE "TenantBalance" SET balance = balance - $2, "updatedAt" = now() ' +
      'WHERE "tenantId" = $1 AND balance >= $2 RETURNING balance',
    [input.tenantId, input.messages],
  );
  const row = rows[0];
  if (!row) return { ok: false, balance: await getBalance(input.tenantId) };
  await query(
    'INSERT INTO "CreditLedger" (id, "tenantId", delta, reason, "refId") VALUES ($1, $2, $3, $4, $5) ' +
      'ON CONFLICT ("refId") WHERE "refId" IS NOT NULL DO NOTHING',
    [uuidv7(), input.tenantId, -input.messages, input.reason ?? "send", input.refId],
  );
  return { ok: true, balance: row.balance };
}