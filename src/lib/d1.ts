import { getBinding } from "@/lib/cf";

interface D1DatabaseLike {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      all(): Promise<{ results: unknown[]; meta?: { changes?: number } }>;
    };
  };
}

// D1 hanya menerima scalar (null | number | string | ArrayBuffer). Nilai Date
// (mis. dari row Neon) dikonversi ke ISO string; undefined → null.
export function d1Value(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined) return null;
  return v;
}

// Helper eksekusi SQL di D1 (pintasend-auth). Prepared statement wajib —
// jangan pernah interpolasi nilai ke dalam SQL.
export async function queryD1<T extends object>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getBinding<D1DatabaseLike>("PINTSEND_AUTH_DB");
  const stmt = db.prepare(sql).bind(...params.map(d1Value));
  const { results } = await stmt.all();
  return results as T[];
}

export async function queryD1One<T extends object>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await queryD1<T>(sql, params);
  return rows[0];
}

// Jalankan statement & kembalikan jumlah baris yang berubah (meta.changes).
// Dipakai utk deteksi "0 baris ter-ubah" (mis. UPDATE utk id yang tak ada di
// D1) — UPDATE yang tidak menyentuh baris TIDAK melempar error di D1.
export async function changesD1(sql: string, params: unknown[] = []): Promise<number> {
  const db = await getBinding<D1DatabaseLike>("PINTSEND_AUTH_DB");
  const stmt = db.prepare(sql).bind(...params.map(d1Value));
  const { meta } = await stmt.all();
  return meta?.changes ?? 0;
}
