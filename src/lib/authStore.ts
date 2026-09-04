import { query } from "@/lib/db";
import { changesD1, queryD1, queryD1One } from "@/lib/d1";
import { uuidv7 } from "@/lib/uuidv7";
import { API_KEY_PREFIX, generateApiKeyRaw, hashApiKey } from "@/lib/apiKeys";

// Role yang boleh di-INSERT ke kolom User.role. Nilai di luar whitelist ditolak
// (deny-by-default) — validasi di lapisan store, bukan hanya route, agar tidak
// ada jalur create user yang bisa menyelipkan role arbitrer.
export const USER_ROLE_ALLOWLIST = [
  "member",
  "tenant_admin",
  "owner",
  "platform_admin",
] as const;
export type UserRole = (typeof USER_ROLE_ALLOWLIST)[number];

export class InvalidRoleError extends Error {
  constructor(role: string) {
    super(`Role tidak valid: ${role}`);
    this.name = "InvalidRoleError";
  }
}

/** Validasi role create user (default owner). Pure — aman di-unit-test. */
export function assertCreateRole(role?: string | null): UserRole {
  const r = role ?? "owner";
  if (!USER_ROLE_ALLOWLIST.includes(r as UserRole)) throw new InvalidRoleError(r);
  return r as UserRole;
}

export interface NewUser {
  tenantId: string;
  email: string;
  name: string;
  passwordHash: string;
  role?: string;
}

export interface UserD1Row {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

// Write-through: Neon = source of truth, D1 = replika auth.
// Gagal clone D1 → log saja; user tetap terbuat di Neon (D1 tertinggal
// sampai tulis berikutnya). Diterima utk MVP (lihat ADR).
export async function createUser(input: NewUser): Promise<{ id: string }> {
  const id = uuidv7();
  const now = new Date().toISOString();
  const role = assertCreateRole(input.role);

  // 1. Neon (source of truth) — tabel User Neon TIDAK punya kolom updatedAt
  // (lihat schema.prisma), jadi hanya createdAt di-set via default now().
  await query(
    'INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", role) ' +
      "VALUES ($1, $2, $3, $4, $5, $6)",
    [id, input.tenantId, input.email, input.name, input.passwordHash, role],
  );

  // 2. Clone ke D1
  try {
    await queryD1(
      "INSERT OR REPLACE INTO User (id, tenantId, email, name, passwordHash, role, createdAt, updatedAt) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, input.tenantId, input.email, input.name, input.passwordHash, role, now, now],
    );
  } catch (e) {
    console.error("authStore: clone D1 gagal, D1 stale:", e);
  }

  return { id };
}

export class EmailAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Email ${email} sudah terdaftar`);
    this.name = "EmailAlreadyExistsError";
  }
}

export interface NewUserWithTenant {
  tenantName: string;
  email: string;
  name: string;
  passwordHash: string;
  role?: string;
}

// Register admin: tiap user baru = tenant sendiri.
// Write-through: Neon source of truth (Tenant + User), lalu clone User ke D1.
// - Email dicek di Neon dulu (source of truth) agar tidak menabrak unique.
// - Kalau insert User gagal (mis. race email unik), Tenant orphan di-rollback.
// - Gagal clone D1 → log saja; user tetap valid di Neon (lihat ADR).
export async function createUserWithTenant(
  input: NewUserWithTenant,
): Promise<{ id: string; tenantId: string }> {
  const tenantId = uuidv7();
  const userId = uuidv7();
  const now = new Date().toISOString();
  const role = assertCreateRole(input.role);

  try {
    await query('INSERT INTO "Tenant" (id, name) VALUES ($1, $2)', [tenantId, input.tenantName]);
    // Insert user dengan ON CONFLICT (email) DO NOTHING + RETURNING: satu
    // round-trip Neon, race-free — kalau email sudah dipakai, tidak ada baris
    // dikembalikan → EmailAlreadyExistsError (tenant orphan di-rollback).
    const rows = await query<{ id: string }>(
      'INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", role) ' +
        "VALUES ($1, $2, $3, $4, $5, $6) " +
        'ON CONFLICT (email) DO NOTHING RETURNING id',
      [userId, tenantId, input.email, input.name, input.passwordHash, role],
    );
    if (rows.length === 0) {
      await query('DELETE FROM "Tenant" WHERE id = $1', [tenantId]).catch(() => {});
      throw new EmailAlreadyExistsError(input.email);
    }
  } catch (e) {
    // Rollback tenant orphan bila insert gagal (mis. error Neon lain).
    if (!(e instanceof EmailAlreadyExistsError)) {
      await query('DELETE FROM "Tenant" WHERE id = $1', [tenantId]).catch(() => {});
    }
    throw e;
  }

  // Clone ke D1 (write-through).
  try {
    await queryD1(
      "INSERT OR REPLACE INTO User (id, tenantId, email, name, passwordHash, role, createdAt, updatedAt) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [userId, tenantId, input.email, input.name, input.passwordHash, role, now, now],
    );
  } catch (e) {
    console.error("authStore: clone D1 gagal, D1 stale:", e);
  }

  return { id: userId, tenantId };
}

export interface AdminUserRow {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

// Daftar pengguna utk halaman admin — baca replika D1 (0 koneksi Neon).
// Semua user yang bisa login pasti ada di D1 (login baca D1), jadi daftar ini
// konsisten dengan jalur auth; D1 clone yang gagal sudah di-log (kasus langka).
//
// Mendukung pencarian (LIKE pada name/email) + pagination. Hanya 2 query D1
// per halaman (COUNT + SELECT) — tetap tanpa menyentuh Neon.
export async function listUsersPaginated(params: {
  query?: string;
  page?: number;
  limit?: number;
  tenantId?: string;
}): Promise<{ users: AdminUserRow[]; total: number }> {
  const limit = Math.min(100, Math.max(1, params.limit ?? 10));
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * limit;

  const q = (params.query ?? "").trim();
  // Escape wildcard LIKE (% _ \\) agar input user dicari literal, bukan
  // diinterpretasikan sebagai pola SQL (prepared statement aman dr injection,
  // tapi wildcard tak ter-escape bisa memicu full-scan + hasil tak terduga).
  const escaped = q.replace(/[%_\\]/g, (m) => `\\${m}`);
  const clauses: string[] = [];
  const args: unknown[] = [];
  // Scope tenant: daftar lintas tenant HANYA untuk platform admin via
  // /api/platform/* — pemanggil lain wajib mem-filter tenantId sendiri.
  if (params.tenantId) {
    clauses.push('"tenantId" = ?');
    args.push(params.tenantId);
  }
  if (q) {
    clauses.push("(name LIKE ? OR email LIKE ?)");
    args.push(`%${escaped}%`, `%${escaped}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const [countRows, userRows] = await Promise.all([
    queryD1<{ count: number }>(`SELECT COUNT(*) AS count FROM User ${where}`, args),
    queryD1<AdminUserRow>(
      `SELECT id, tenantId, email, name, role, createdAt FROM User ${where} ` +
        "ORDER BY createdAt DESC LIMIT ? OFFSET ?",
      [...args, limit, offset],
    ),
  ]);

  return {
    users: userRows,
    total: Number(countRows[0]?.count ?? 0),
  };
}

export interface ApiKeyRow {
  id: string;
  tenantId: string;
  label: string;
  keyHash: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface PublicApiKeyRow {
  id: string;
  tenantId: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function toPublic(row: ApiKeyRow): PublicApiKeyRow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    label: row.label,
    prefix: row.prefix,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
  };
}

// Buat API key — write-through Neon (source of truth) → clone D1.
// Mengembalikan raw key SEKALI (untuk ditampilkan ke admin). d1Ok=false
// berarti clone D1 gagal → key mungkin langsung ditolak verifyApiKey (baca D1)
// sampai re-sync job (workers/d1-resync) menjalankannya.
export async function createApiKey(input: {
  tenantId: string;
  label: string;
}): Promise<{ id: string; raw: string; prefix: string; d1Ok: boolean }> {
  const id = uuidv7();
  const now = new Date().toISOString();
  const { raw, prefix } = generateApiKeyRaw();
  const keyHash = await hashApiKey(raw);

  await query(
    'INSERT INTO "ApiKey" (id, "tenantId", label, "keyHash", prefix) VALUES ($1, $2, $3, $4, $5)',
    [id, input.tenantId, input.label, keyHash, prefix],
  );

  try {
    await queryD1(
      "INSERT OR REPLACE INTO ApiKey (id, tenantId, label, keyHash, prefix, createdAt, lastUsedAt, revokedAt) " +
        "VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)",
      [id, input.tenantId, input.label, keyHash, prefix, now],
    );
    return { id, raw, prefix, d1Ok: true };
  } catch (e) {
    console.error("authStore: clone ApiKey D1 gagal, D1 stale:", e);
    return { id, raw, prefix, d1Ok: false };
  }
}

// Daftar API key milik tenant — baca D1 (0 koneksi Neon). Tanpa keyHash.
export async function listApiKeys(tenantId: string): Promise<PublicApiKeyRow[]> {
  const rows = await queryD1<ApiKeyRow>(
    "SELECT id, tenantId, label, keyHash, prefix, createdAt, lastUsedAt, revokedAt " +
      "FROM ApiKey WHERE tenantId = ? ORDER BY createdAt DESC",
    [tenantId],
  );
  return rows.map(toPublic);
}

export interface RevokeApiKeyResult {
  /** Key ditemukan & dicabut di Neon (source of truth). */
  revoked: boolean;
  /** Clone status revoke ke D1 sukses (false → D1 masih anggap aktif, key mungkin masih lolos verify). */
  d1Ok: boolean;
}

// Revoke API key — Neon source of truth → clone D1.
// Cek meta.changes di D1 agar d1Ok jujur (pola sama dengan updateUserPassword).
export async function revokeApiKey(id: string, tenantId: string): Promise<RevokeApiKeyResult> {
  const rows = await query<{ id: string }>(
    'UPDATE "ApiKey" SET "revokedAt" = now() WHERE id = $1 AND "tenantId" = $2 RETURNING id',
    [id, tenantId],
  );
  if (rows.length === 0) return { revoked: false, d1Ok: false };
  try {
    const changes = await changesD1("UPDATE ApiKey SET revokedAt = ? WHERE id = ?", [
      new Date().toISOString(),
      id,
    ]);
    return { revoked: true, d1Ok: changes > 0 };
  } catch (e) {
    console.error("authStore: revoke D1 gagal, D1 stale:", e);
    return { revoked: true, d1Ok: false };
  }
}

// Verifikasi API key untuk akses API publik — baca D1 (0 koneksi Neon).
// Mencocokkan hash SHA-256 key yang masuk; key yang di-revoke ditolak.
// Mengembalikan tenantId + keyId — keyId dipakai rate limit per API key
// (bukan per tenant+IP) di jalur kirim v1/messages.
// lastUsedAt di-update di D1 best-effort (fire-and-forget, 0 Neon). Catatan:
// re-sync job (Neon → D1) akan mereset lastUsedAt ke NULL karena Neon adalah
// source of truth untuk kolom ini — metadata tampilan, bukan data kritis.
export async function verifyApiKey(raw: string): Promise<{ tenantId: string; keyId: string } | null> {
  if (!raw.startsWith(API_KEY_PREFIX)) return null;
  const keyHash = await hashApiKey(raw);
  const row = await queryD1One<{
    id: string;
    tenantId: string;
    revokedAt: string | null;
    suspendedAt: string | null;
  }>(
    "SELECT k.id, k.tenantId, k.revokedAt, t.suspendedAt FROM ApiKey k " +
      "LEFT JOIN Tenant t ON k.tenantId = t.id WHERE k.keyHash = ?",
    [keyHash],
  );
  if (!row) return null;
  if (row.revokedAt) return null;
  // Tenant nonaktif (suspended) → tolak semua pemakaian API key tenant itu.
  if (row.suspendedAt) return null;
  // Best-effort: tidak memblokir respons bila update gagal.
  changesD1("UPDATE ApiKey SET lastUsedAt = ? WHERE id = ?", [
    new Date().toISOString(),
    row.id,
  ]).catch((e) => console.error("authStore: update lastUsedAt D1 gagal:", e));
  return { tenantId: row.tenantId, keyId: row.id };
}

export interface UpdatePasswordResult {
  /** User ditemukan di Neon & password berhasil diubah. */
  updated: boolean;
  /** Clone password ke D1 sukses (false → login baca D1 akan pakai password lama). */
  d1Ok: boolean;
}

// Reset password — write-through: Neon source of truth → clone D1.
export async function updateUserPassword(
  userId: string,
  passwordHash: string,
): Promise<UpdatePasswordResult> {
  // RETURNING id → bisa deteksi user tak ditemukan (404 di API) tanpa SELECT
  // tambahan. Catatan: tabel User Neon tidak punya kolom updatedAt (schema
  // Prisma), jadi hanya passwordHash yang di-update di Neon; D1 (yang punya
  // updatedAt) tetap di-set agar replika akurat.
  const rows = await query<{ id: string }>(
    'UPDATE "User" SET "passwordHash" = $1 WHERE id = $2 RETURNING id',
    [passwordHash, userId],
  );
  if (rows.length === 0) return { updated: false, d1Ok: false };

  try {
    // D1 UPDATE yang tak menyentuh baris TIDAK error — cek meta.changes agar
    // d1Ok jujur: baris user harus benar-benar ter-update di replika.
    const changes = await changesD1("UPDATE User SET passwordHash = ?, updatedAt = ? WHERE id = ?", [
      passwordHash,
      new Date().toISOString(),
      userId,
    ]);
    return { updated: true, d1Ok: changes > 0 };
  } catch (e) {
    console.error("authStore: update D1 gagal, D1 stale:", e);
    return { updated: true, d1Ok: false };
  }
}
