import { query, queryOne } from "@/lib/db";

export interface QuotaInfo {
  maxDevices: number;
  maxUsers: number;
  maxMessagesPerMonth: number | null;
}

interface QuotaRow {
  maxDevices: number | null;
  maxUsers: number | null;
  maxMessagesPerMonth: number | null;
}

// Awal bulan berjalan di Asia/Jakarta → ISO offset WIB. Bulan kalender WIB
// (spec §5): pesan dihitung per bulan kalender, bukan periode berjalan.
export function monthStartWib(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // Tanggal 1 bulan berjalan (bukan hari ini) — kuota pesan per bulan kalender.
  return `${get("year")}-${get("month")}-01T00:00:00+07:00`;
}

function toQuota(row: QuotaRow): QuotaInfo {
  return {
    maxDevices: row.maxDevices ?? 0,
    maxUsers: row.maxUsers ?? 0,
    maxMessagesPerMonth: row.maxMessagesPerMonth ?? null,
  };
}

// Quota tenant = join Tenant → Plan. Tanpa plan → null (tidak dikuota —
// aman saat migrasi, tenant lama tidak terpotong).
export async function getTenantQuota(tenantId: string): Promise<QuotaInfo | null> {
  const row = await queryOne<QuotaRow>(
    'SELECT p."maxDevices", p."maxUsers", p."maxMessagesPerMonth" FROM "Tenant" t ' +
      'LEFT JOIN "Plan" p ON p.id = t."planId" WHERE t.id = $1',
    [tenantId],
  );
  return row ? toQuota(row) : null;
}

export async function countDevices(tenantId: string): Promise<number> {
  const rows = await query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM "Device" WHERE "tenantId" = $1',
    [tenantId],
  );
  return rows[0]?.count ?? 0;
}

export async function countUsers(tenantId: string): Promise<number> {
  const rows = await query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM "User" WHERE "tenantId" = $1',
    [tenantId],
  );
  return rows[0]?.count ?? 0;
}

export async function countMessagesThisMonth(tenantId: string): Promise<number> {
  const rows = await query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM "MessageLog" WHERE "tenantId" = $1 AND "createdAt" >= $2',
    [tenantId, monthStartWib()],
  );
  return rows[0]?.count ?? 0;
}

export type QuotaCheck = { ok: boolean; used: number; max: number | null };

export async function checkDeviceQuota(tenantId: string): Promise<QuotaCheck> {
  const quota = await getTenantQuota(tenantId);
  if (!quota) return { ok: true, used: 0, max: null };
  const used = await countDevices(tenantId);
  return { ok: used < quota.maxDevices, used, max: quota.maxDevices };
}

export async function checkUserQuota(tenantId: string): Promise<QuotaCheck> {
  const quota = await getTenantQuota(tenantId);
  if (!quota) return { ok: true, used: 0, max: null };
  const used = await countUsers(tenantId);
  return { ok: used < quota.maxUsers, used, max: quota.maxUsers };
}

export async function checkMessageQuota(tenantId: string): Promise<QuotaCheck> {
  const quota = await getTenantQuota(tenantId);
  if (!quota) return { ok: true, used: 0, max: null };
  // null = unlimited (Espresso per-pesan, Mocha) — tidak pernah diblokir.
  if (quota.maxMessagesPerMonth === null) return { ok: true, used: 0, max: null };
  const used = await countMessagesThisMonth(tenantId);
  return { ok: used < quota.maxMessagesPerMonth, used, max: quota.maxMessagesPerMonth };
}
