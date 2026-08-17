import { query } from "@/lib/db";
import { changesD1, queryD1 } from "@/lib/d1";
import { uuidv7 } from "@/lib/uuidv7";

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
  const role = input.role ?? "owner";

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
  const role = input.role ?? "owner";

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
export async function listUsers(): Promise<AdminUserRow[]> {
  return queryD1<AdminUserRow>(
    "SELECT id, tenantId, email, name, role, createdAt FROM User ORDER BY createdAt DESC",
  );
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
