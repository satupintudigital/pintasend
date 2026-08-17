import { getBinding } from "@/lib/cf";

interface D1DatabaseLike {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      all(): Promise<{ results: unknown[] }>;
    };
  };
}

// Helper eksekusi SQL di D1 (wavio-auth). Prepared statement wajib —
// jangan pernah interpolasi nilai ke dalam SQL.
export async function queryD1<T extends object>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getBinding<D1DatabaseLike>("WAVIO_AUTH_DB");
  const stmt = db.prepare(sql).bind(...params);
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
