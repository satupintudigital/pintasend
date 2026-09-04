// ─── Registrasi publik tenant owner (self-serve) ───────────────────────────
// Membuat Tenant (activatedAt NULL = pending) + User role owner, ditulis ke
// Neon (source of truth) lalu di-clone ke D1 (auth). TenantBalance di-init 0.
// Email sambutan best-effort (tidak menggagalkan registrasi).

import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { queryD1 } from "@/lib/d1";
import { uuidv7 } from "@/lib/uuidv7";
import { createUser } from "@/lib/authStore";
import { syncTenantD1 } from "@/lib/tenantStore";
import { sendWelcomeEmail } from "@/lib/email";

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  tenantName: string;
}

export class EmailAlreadyTakenError extends Error {
  constructor(email: string) {
    super(`Email ${email} sudah terdaftar`);
    this.name = "EmailAlreadyTakenError";
  }
}

export function validateRegisterInput(input: RegisterInput): string | null {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const tenantName = input.tenantName.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Format email tidak valid";
  if (name.length < 1 || name.length > 100) return "Nama harus 1..100 karakter";
  if (tenantName.length < 3 || tenantName.length > 100) return "Nama tenant harus 3..100 karakter";
  if (input.password.length < 8) return "Password minimal 8 karakter";
  return null;
}

/**
 * Daftarkan owner + tenant baru (pending). Neon source of truth → D1 clone.
 * Email duplikat (Neon unique) → EmailAlreadyTakenError; tenant orphan
 * di-rollback seperti pola createUserWithTenant.
 */
export async function registerTenantOwner(
  input: RegisterInput,
): Promise<{ tenantId: string; userId: string }> {
  const email = input.email.trim().toLowerCase();
  const tenantName = input.tenantName.trim();
  const name = input.name.trim();

  const tenantId = uuidv7();
  const passwordHash = bcrypt.hashSync(input.password, 10);

  // Cek duplikat email (Neon = source of truth).
  const existing = await query<{ id: string }>('SELECT id FROM "User" WHERE email = $1', [email]);
  if (existing.length > 0) throw new EmailAlreadyTakenError(email);

  let userId = "";
  try {
    await query('INSERT INTO "Tenant" (id, name) VALUES ($1, $2)', [tenantId, tenantName]);
    const user = await createUser({
      tenantId,
      email,
      name,
      passwordHash,
      role: "owner",
    });
    userId = user.id;
  } catch (e) {
    if (!(e instanceof EmailAlreadyTakenError)) {
      await query('DELETE FROM "Tenant" WHERE id = $1', [tenantId]).catch(() => {});
    }
    throw e;
  }

  // Inisialisasi saldo + clone tenant ke D1 (activatedAt null → gate pending).
  await query(
    'INSERT INTO "TenantBalance" ("tenantId", balance) VALUES ($1, 0) ON CONFLICT ("tenantId") DO NOTHING',
    [tenantId],
  ).catch(() => {});
  await queryD1(
    "INSERT OR REPLACE INTO Tenant (id, name, suspendedAt, activatedAt) VALUES (?, ?, NULL, NULL)",
    [tenantId, tenantName],
  ).catch((e) => console.error("register: clone tenant D1 gagal:", e));

  await sendWelcomeEmail({ email, name });

  return { tenantId, userId };
}