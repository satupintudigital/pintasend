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
