import { query } from "@/lib/db";
import { changesD1, queryD1One } from "@/lib/d1";
import { uuidv7 } from "@/lib/uuidv7";

export interface SetTenantSuspendedResult {
  updated: boolean;
  d1Ok: boolean;
}

// Suspend/aktifkan tenant — write-through Neon (source of truth) → D1.
// D1 hanya menyimpan (id, name, suspendedAt) — cukup utk gate login & API key
// (ADR-9). Name diambil dari D1 agar INSERT OR REPLACE tidak menghapus nama.
export async function setTenantSuspended(
  tenantId: string,
  suspendedAt: string | null,
): Promise<SetTenantSuspendedResult> {
  const rows = await query<{ id: string }>(
    'UPDATE "Tenant" SET "suspendedAt" = $1 WHERE id = $2 RETURNING id',
    [suspendedAt, tenantId],
  );
  if (rows.length === 0) return { updated: false, d1Ok: false };

  const nameRow = await queryD1One<{ name: string }>(
    "SELECT name FROM Tenant WHERE id = ?",
    [tenantId],
  );
  const name = nameRow?.name ?? "Tenant";
  try {
    const changes = await changesD1(
      "INSERT OR REPLACE INTO Tenant (id, name, suspendedAt) VALUES (?, ?, ?)",
      [tenantId, name, suspendedAt],
    );
    return { updated: true, d1Ok: changes > 0 };
  } catch (e) {
    console.error("tenantStore: clone D1 gagal, D1 stale:", e);
    return { updated: true, d1Ok: false };
  }
}

// SSO wizard: temukan-atau-buat Tenant Wavio dari storeId NalaNiaga.
// ON CONFLICT (nalaniagaStoreId) DO NOTHING + SELECT → idempotent & race-free.
export async function findOrCreateTenantByNalaniaga(
  storeId: string,
  storeName: string,
): Promise<{ id: string }> {
  const inserted = await query<{ id: string }>(
    'INSERT INTO "Tenant" (id, name, "nalaniagaStoreId") VALUES ($1, $2, $3) ' +
      'ON CONFLICT ("nalaniagaStoreId") DO NOTHING RETURNING id',
    [uuidv7(), storeName.slice(0, 100), storeId],
  );
  if (inserted[0]) return { id: inserted[0].id };
  const rows = await query<{ id: string }>(
    'SELECT id FROM "Tenant" WHERE "nalaniagaStoreId" = $1',
    [storeId],
  );
  return { id: rows[0].id };
}
