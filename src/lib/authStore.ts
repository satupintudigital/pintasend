import { query } from "@/lib/db";
import { queryD1 } from "@/lib/d1";
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

  // 1. Neon (source of truth)
  await query(
    'INSERT INTO "User" (id, "tenantId", email, name, "passwordHash", role, "createdAt", "updatedAt") ' +
      "VALUES ($1, $2, $3, $4, $5, $6, now(), now())",
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

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await query('UPDATE "User" SET "passwordHash" = $1, "updatedAt" = now() WHERE id = $2', [
    passwordHash,
    userId,
  ]);
  try {
    await queryD1("UPDATE User SET passwordHash = ?, updatedAt = ? WHERE id = ?", [
      passwordHash,
      new Date().toISOString(),
      userId,
    ]);
  } catch (e) {
    console.error("authStore: update D1 gagal, D1 stale:", e);
  }
}
