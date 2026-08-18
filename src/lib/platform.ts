import { query } from "@/lib/db";

export interface TenantListRow {
  id: string;
  name: string;
  createdAt: string;
  suspendedAt: string | null;
  planId: string | null;
  planName: string | null;
  devices: number;
  users: number;
  messages: number;
}

// Daftar tenant + statistik (platform admin). Baca Neon (source of truth).
// Jalur admin berfrekuensi rendah — tidak terikat aturan 0-koneksi jalur hot.
export async function listTenants(params: {
  q?: string;
  page?: number;
  limit?: number;
}): Promise<{ tenants: TenantListRow[]; total: number }> {
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const page = Math.max(1, params.page ?? 1);
  const offset = limit * (page - 1);
  const q = (params.q ?? "").trim();
  // Escape wildcard LIKE (% _ \) agar input dicari literal.
  const escaped = q.replace(/[%_\\]/g, (m) => `\\${m}`);

  const where = q ? "WHERE t.name ILIKE $1" : "";
  const whereArgs = q ? [`%${escaped}%`] : [];

  const [countRows, tenantRows] = await Promise.all([
    query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM "Tenant" t ${where}`,
      whereArgs,
    ),
    query<TenantListRow>(
      `SELECT t.id, t.name, t."createdAt", t."suspendedAt", t."planId", p.name AS "planName",
              (SELECT COUNT(*)::int FROM "Device" d WHERE d."tenantId" = t.id) AS devices,
              (SELECT COUNT(*)::int FROM "User" u WHERE u."tenantId" = t.id) AS users,
              (SELECT COUNT(*)::int FROM "MessageLog" m WHERE m."tenantId" = t.id) AS messages
       FROM "Tenant" t LEFT JOIN "Plan" p ON p.id = t."planId"
       ${where} ORDER BY t."createdAt" DESC LIMIT $${whereArgs.length + 1} OFFSET $${whereArgs.length + 2}`,
      [...whereArgs, limit, offset],
    ),
  ]);

  return { tenants: tenantRows, total: Number(countRows[0]?.count ?? 0) };
}
