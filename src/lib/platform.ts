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

export interface TenantDetailRow {
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

export async function getTenantDetail(id: string): Promise<TenantDetailRow | null> {
  const rows = await query<TenantDetailRow>(
    `SELECT t.id, t.name, t."createdAt", t."suspendedAt", t."planId", p.name AS "planName",
            (SELECT COUNT(*)::int FROM "Device" d WHERE d."tenantId" = t.id) AS devices,
            (SELECT COUNT(*)::int FROM "User" u WHERE u."tenantId" = t.id) AS users,
            (SELECT COUNT(*)::int FROM "MessageLog" m WHERE m."tenantId" = t.id) AS messages
     FROM "Tenant" t LEFT JOIN "Plan" p ON p.id = t."planId" WHERE t.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface PlanRow {
  id: string;
  name: string;
  tagline: string;
  priceDisplay: string;
  maxDevices: number;
  maxUsers: number;
  maxMessagesPerMonth: number | null;
  isActive: boolean;
}

export async function listPlans(): Promise<PlanRow[]> {
  return query<PlanRow>(
    'SELECT id, name, tagline, "priceDisplay", "maxDevices", "maxUsers", "maxMessagesPerMonth", "isActive" FROM "Plan" ORDER BY name ASC',
  );
}

// Assign plan ke tenant (null = tanpa plan / tanpa kuota).
export async function setTenantPlan(tenantId: string, planId: string | null): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'UPDATE "Tenant" SET "planId" = $1, "planAssignedAt" = now() WHERE id = $2 RETURNING id',
    [planId, tenantId],
  );
  return rows.length > 0;
}

export interface PlatformMetrics {
  messagesPerDay: { day: string; count: number }[];
  deviceStatus: { status: string; count: number }[];
  topTenants: { id: string; name: string; messages: number }[];
}

// Metrik lintas tenant — agregasi Neon. Dipakai halaman /platform (ringkasan)
// dan /platform/metrics. Jalur admin, bukan hot path.
export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const [messagesPerDay, deviceStatus, topTenants] = await Promise.all([
    query<{ day: string; count: number }>(
      `SELECT TO_CHAR("createdAt" AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
       FROM "MessageLog" WHERE "createdAt" >= now() - interval '30 days'
       GROUP BY day ORDER BY day ASC`,
    ),
    query<{ status: string; count: number }>(
      'SELECT status, COUNT(*)::int AS count FROM "Device" GROUP BY status ORDER BY count DESC',
    ),
    query<{ id: string; name: string; messages: number }>(
      `SELECT t.id, t.name, COUNT(m.id)::int AS messages
       FROM "MessageLog" m JOIN "Tenant" t ON t.id = m."tenantId"
       GROUP BY t.id, t.name ORDER BY messages DESC LIMIT 5`,
    ),
  ]);
  return { messagesPerDay, deviceStatus, topTenants };
}

export interface PlanPatch {
  maxDevices?: number;
  maxUsers?: number;
  maxMessagesPerMonth?: number | null;
  isActive?: boolean;
}

// Update sebagian kuota plan. Hanya kolom yang di-set yang diubah.
export async function updatePlan(id: string, patch: PlanPatch): Promise<boolean> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.maxDevices !== undefined) {
    args.push(patch.maxDevices);
    sets.push(`"maxDevices" = $${args.length}`);
  }
  if (patch.maxUsers !== undefined) {
    args.push(patch.maxUsers);
    sets.push(`"maxUsers" = $${args.length}`);
  }
  if (patch.maxMessagesPerMonth !== undefined) {
    args.push(patch.maxMessagesPerMonth);
    sets.push(`"maxMessagesPerMonth" = $${args.length}`);
  }
  if (patch.isActive !== undefined) {
    args.push(patch.isActive);
    sets.push(`"isActive" = $${args.length}`);
  }
  if (!sets.length) return false;
  args.push(id);
  const rows = await query<{ id: string }>(
    `UPDATE "Plan" SET ${sets.join(", ")} WHERE id = $${args.length} RETURNING id`,
    args,
  );
  return rows.length > 0;
}
