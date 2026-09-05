import { query } from "@/lib/db";
import { uuidv7 } from "@/lib/uuidv7";
import { tenantAddonActiveWhere } from "@/lib/tenantConfig";

export interface TenantListRow {
  id: string;
  name: string;
  createdAt: string;
  suspendedAt: string | null;
  planId: string | null;
  planName: string | null;
  delayEnabled: boolean;
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
      `SELECT t.id, t.name, t."createdAt", t."suspendedAt", t."planId", p.name AS "planName", t."delayEnabled",
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
  delayEnabled: boolean;
  delayAddonActive: boolean;
  watermarkAddonActive: boolean;
  messageRetentionDays: number;
  devices: number;
  users: number;
  messages: number;
}

export async function getTenantDetail(id: string): Promise<TenantDetailRow | null> {
  const rows = await query<TenantDetailRow>(
    `SELECT t.id, t.name, t."createdAt", t."suspendedAt", t."planId", p.name AS "planName",
            t."delayEnabled", t."messageRetentionDays",
            EXISTS(SELECT 1 FROM "TenantAddon" a
                   WHERE a."tenantId" = t.id AND a.key = 'random_delay' AND ${tenantAddonActiveWhere("a")}) AS "delayAddonActive",
            EXISTS(SELECT 1 FROM "TenantAddon" a
                   WHERE a."tenantId" = t.id AND a.key = 'remove_watermark' AND ${tenantAddonActiveWhere("a")}) AS "watermarkAddonActive",
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
  priceMonthly: number | null;
  maxDevices: number;
  maxUsers: number;
  maxMessagesPerMonth: number | null;
  includesDelay: boolean;
  isActive: boolean;
  /** Jenis plan: "subscription" (bulanan) | "prepaid" (per pesan). */
  kind: string;
  /** Tampil di katalog publik / halaman harga. */
  isPublic: boolean;
  /** Urutan tampil katalog (kecil = lebih dulu). */
  sortOrder: number;
}

export async function listPlans(): Promise<PlanRow[]> {
  return query<PlanRow>(
    'SELECT id, name, tagline, "priceDisplay", "priceMonthly", "maxDevices", "maxUsers", "maxMessagesPerMonth", "includesDelay", "isActive", kind, "isPublic", "sortOrder" FROM "Plan" ORDER BY "sortOrder" ASC, name ASC',
  );
}

export interface PlatformOrderRow {
  id: string;
  tenantId: string;
  tenantName: string;
  kind: string;
  status: string;
  amount: number;
  payMethod: string | null;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
}

// Daftar semua order (platform admin) — opsional filter status. Dipakai
// halaman /platform/orders + tombol Resync (POST /api/billing/sync).
export async function listPlatformOrders(status?: string, limit = 200): Promise<PlatformOrderRow[]> {
  return query<PlatformOrderRow>(
    `SELECT o.id, o."tenantId", t.name AS "tenantName", o.kind, o.status, o.amount,
            o."payMethod", o."createdAt", o."paidAt", o."expiresAt"
     FROM "Order" o JOIN "Tenant" t ON t.id = o."tenantId"
     WHERE ($1::text IS NULL OR o.status = $1)
     ORDER BY o."createdAt" DESC LIMIT $2`,
    [status ?? null, Math.min(500, Math.max(1, limit))],
  );
}

/** Plan aktif tenant saat ini (undefined = tenant tidak ditemukan). */
export async function getTenantPlanId(tenantId: string): Promise<string | null | undefined> {
  const rows = await query<{ planId: string | null }>(
    'SELECT "planId" FROM "Tenant" WHERE id = $1',
    [tenantId],
  );
  return rows[0]?.planId;
}

// Assign plan ke tenant (null = tanpa plan / tanpa kuota).
export async function setTenantPlan(tenantId: string, planId: string | null): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'UPDATE "Tenant" SET "planId" = $1, "planAssignedAt" = now() WHERE id = $2 RETURNING id',
    [planId, tenantId],
  );
  return rows.length > 0;
}

// Toggle config delay per tenant (platform admin).
export async function setTenantDelayEnabled(tenantId: string, enabled: boolean): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'UPDATE "Tenant" SET "delayEnabled" = $1 WHERE id = $2 RETURNING id',
    [enabled, tenantId],
  );
  return rows.length > 0;
}

// Grant/revoke addon tenant (upsert). Key di-whitelist di lapisan route.
// Grant (active=true) = permanen → activeUntil di-reset NULL. Revoke
// (active=false) mempertahankan activeUntil lama (bila addon dibeli mandiri
// lalu dicabut admin, pembelian aslinya tidak hilang).
export async function setTenantAddon(
  tenantId: string,
  key: string,
  active: boolean,
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'INSERT INTO "TenantAddon" (id, "tenantId", key, active) VALUES ($1, $2, $3, $4) ' +
      'ON CONFLICT ("tenantId", key) DO UPDATE SET active = EXCLUDED.active, ' +
      '"activeUntil" = CASE WHEN EXCLUDED.active THEN NULL ELSE "TenantAddon"."activeUntil" END, ' +
      '"updatedAt" = now() ' +
      "RETURNING id",
    [uuidv7(), tenantId, key, active],
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
  name?: string;
  tagline?: string;
  priceDisplay?: string;
  kind?: string;
  priceMonthly?: number | null;
  maxDevices?: number;
  maxUsers?: number;
  maxMessagesPerMonth?: number | null;
  includesDelay?: boolean;
  isActive?: boolean;
  isPublic?: boolean;
  sortOrder?: number;
}

// Update sebagian kuota plan. Hanya kolom yang di-set yang diubah.
export async function updatePlan(id: string, patch: PlanPatch): Promise<boolean> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined) {
    args.push(patch.name);
    sets.push(`name = $${args.length}`);
  }
  if (patch.tagline !== undefined) {
    args.push(patch.tagline);
    sets.push(`tagline = $${args.length}`);
  }
  if (patch.priceDisplay !== undefined) {
    args.push(patch.priceDisplay);
    sets.push(`"priceDisplay" = $${args.length}`);
  }
  if (patch.kind !== undefined) {
    args.push(patch.kind);
    sets.push(`kind = $${args.length}`);
  }
  if (patch.priceMonthly !== undefined) {
    args.push(patch.priceMonthly);
    sets.push(`"priceMonthly" = $${args.length}`);
  }
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
  if (patch.includesDelay !== undefined) {
    args.push(patch.includesDelay);
    sets.push(`"includesDelay" = $${args.length}`);
  }
  if (patch.isActive !== undefined) {
    args.push(patch.isActive);
    sets.push(`"isActive" = $${args.length}`);
  }
  if (patch.isPublic !== undefined) {
    args.push(patch.isPublic);
    sets.push(`"isPublic" = $${args.length}`);
  }
  if (patch.sortOrder !== undefined) {
    args.push(Math.floor(patch.sortOrder));
    sets.push(`"sortOrder" = $${args.length}`);
  }
  if (!sets.length) return false;
  args.push(id);
  const rows = await query<{ id: string }>(
    `UPDATE "Plan" SET ${sets.join(", ")} WHERE id = $${args.length} RETURNING id`,
    args,
  );
  return rows.length > 0;
}

// ─── Kelola katalog plan & addon (platform admin, P1) ───────────────────────
// Kolom isActive/isPublic sudah ada (tidak butuh migrasi). Catalog publik
// (src/lib/catalog.ts) otomatis memfilter isActive=true & isPublic=true, jadi
// mengarsipkan plan/addon langsung menghilangkannya dari halaman harga/checkout
// tanpa menyentuh tenant yang sudah memakai.

/** Validasi input create plan dari body request. Pure — mudah di-unit-test. */
export function parsePlanCreateBody(
  raw: unknown,
): { ok: true; plan: PlanCreateInput } | { ok: false; error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 80) return { ok: false, error: "Nama plan wajib 1–80 karakter" };
  if (
    b.kind !== undefined &&
    b.kind !== "subscription" &&
    b.kind !== "prepaid"
  ) {
    return { ok: false, error: "kind harus 'subscription' atau 'prepaid'" };
  }
  const kind = b.kind === "prepaid" ? "prepaid" : "subscription";
  const int = (v: unknown, d: number, label: string): number => {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.floor(v);
    if (v === undefined) return d;
    throw new Error(`${label} harus angka ≥ 0`);
  };
  try {
    const plan: PlanCreateInput = {
      name,
      kind,
      tagline: typeof b.tagline === "string" ? b.tagline.trim() : "",
      priceDisplay: typeof b.priceDisplay === "string" ? b.priceDisplay.trim() : name,
      priceMonthly:
        b.priceMonthly === null || b.priceMonthly === undefined
          ? null
          : int(b.priceMonthly, 0, "priceMonthly"),
      maxDevices: int(b.maxDevices, 1, "maxDevices"),
      maxUsers: int(b.maxUsers, 1, "maxUsers"),
      maxMessagesPerMonth:
        b.maxMessagesPerMonth === null || b.maxMessagesPerMonth === undefined
          ? null
          : int(b.maxMessagesPerMonth, 0, "maxMessagesPerMonth"),
      includesDelay: b.includesDelay === true,
      isActive: b.isActive !== false,
      isPublic: b.isPublic !== false,
      sortOrder: typeof b.sortOrder === "number" && b.sortOrder >= 0 ? Math.floor(b.sortOrder) : 0,
    };
    return { ok: true, plan };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Input plan tidak valid" };
  }
}

export interface PlanCreateInput {
  name: string;
  kind: string;
  tagline: string;
  priceDisplay: string;
  priceMonthly: number | null;
  maxDevices: number;
  maxUsers: number;
  maxMessagesPerMonth: number | null;
  includesDelay: boolean;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
}

/** Buat plan baru (platform admin). Mengembalikan baris lengkap bila sukses. */
export async function createPlan(input: PlanCreateInput): Promise<PlanRow | null> {
  const rows = await query<PlanRow>(
    `INSERT INTO "Plan" (id, name, tagline, "priceDisplay", "priceMonthly", kind,
       "isPublic", "sortOrder", "maxDevices", "maxUsers", "maxMessagesPerMonth",
       "includesDelay", "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
     RETURNING id, name, tagline, "priceDisplay", "priceMonthly", "maxDevices",
       "maxUsers", "maxMessagesPerMonth", "includesDelay", "isActive", kind,
       "isPublic", "sortOrder"`,
    [
      uuidv7(),
      input.name,
      input.tagline,
      input.priceDisplay,
      input.priceMonthly,
      input.kind,
      input.isPublic,
      input.sortOrder,
      input.maxDevices,
      input.maxUsers,
      input.maxMessagesPerMonth,
      input.includesDelay,
      input.isActive,
    ],
  );
  return rows[0] ?? null;
}

export interface AddonRow {
  key: string;
  name: string;
  tagline: string;
  priceMonthly: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface AddonPatch {
  name?: string;
  tagline?: string;
  priceMonthly?: number | null;
  isActive?: boolean;
}

/** Daftar semua addon (termasuk non-aktif) — platform admin. */
export async function listAddons(): Promise<AddonRow[]> {
  return query<AddonRow>(
    'SELECT key, name, tagline, "priceMonthly", "isActive", "createdAt" FROM "Addon" ORDER BY "isActive" DESC, name ASC',
  );
}

export interface AddonCreateInput {
  key: string;
  name: string;
  tagline: string;
  priceMonthly: number | null;
  isActive: boolean;
}

/** Validasi input addon dari body request. Pure — mudah di-unit-test. */
export function parseAddonCreateBody(
  raw: unknown,
): { ok: true; addon: AddonCreateInput } | { ok: false; error: string } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const key = typeof b.key === "string" ? b.key.trim().toLowerCase() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!/^[a-z0-9_]{2,64}$/.test(key)) {
    return { ok: false, error: "key addon wajib 2–64 karakter (huruf kecil, angka, underscore)" };
  }
  if (!name || name.length > 80) return { ok: false, error: "Nama addon wajib 1–80 karakter" };
  let priceMonthly: number | null = null;
  if (b.priceMonthly !== null && b.priceMonthly !== undefined) {
    if (typeof b.priceMonthly !== "number" || !Number.isFinite(b.priceMonthly) || b.priceMonthly < 0) {
      return { ok: false, error: "priceMonthly harus angka ≥ 0 atau null" };
    }
    priceMonthly = Math.floor(b.priceMonthly);
  }
  return {
    ok: true,
    addon: {
      key,
      name,
      tagline: typeof b.tagline === "string" ? b.tagline.trim() : "",
      priceMonthly,
      isActive: b.isActive !== false,
    },
  };
}

/** Buat addon baru. Konflik key → false. */
export async function createAddon(input: AddonCreateInput): Promise<boolean> {
  const rows = await query<{ key: string }>(
    `INSERT INTO "Addon" (id, key, name, tagline, "priceMonthly", "isActive", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())
     ON CONFLICT (key) DO NOTHING RETURNING key`,
    [uuidv7(), input.key, input.name, input.tagline, input.priceMonthly, input.isActive],
  );
  return rows.length > 0;
}

/** Update sebagian addon. Hanya kolom yang di-set yang diubah. */
export async function updateAddon(key: string, patch: AddonPatch): Promise<boolean> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (patch.name !== undefined) {
    args.push(patch.name);
    sets.push(`name = $${args.length}`);
  }
  if (patch.tagline !== undefined) {
    args.push(patch.tagline);
    sets.push(`tagline = $${args.length}`);
  }
  if (patch.priceMonthly !== undefined) {
    args.push(patch.priceMonthly);
    sets.push(`"priceMonthly" = $${args.length}`);
  }
  if (patch.isActive !== undefined) {
    args.push(patch.isActive);
    sets.push(`"isActive" = $${args.length}`);
  }
  if (!sets.length) return false;
  args.push(key);
  const rows = await query<{ key: string }>(
    `UPDATE "Addon" SET ${sets.join(", ")}, "updatedAt" = now() WHERE key = $${args.length} RETURNING key`,
    args,
  );
  return rows.length > 0;
}
