// ─── Member management tenant-scoped ─────────────────────────────────────────
// Service layer untuk kelola user dalam SATU tenant (owner & tenant_admin via
// halaman Members; platform_admin boleh untuk tenant mana pun).
//
// Invariant yang dijaga DI SINI (bukan hanya di route):
//   1. Role baru via jalur ini hanya member | tenant_admin — owner dibuat lewat
//      provisioning platform; platform_admin tidak pernah via jalur ini.
//   2. Tidak boleh menghapus / menurunkan owner terakhir tenant.
//   3. Tidak boleh menghapus diri sendiri.
//   4. Semua operasi scope-check getUserInTenant — user tenant lain tak tersentuh.
//   5. Reset password & role change memakai write-through Neon → D1 (authStore).
//
// Route tetap thin: auth → gate (abac.canManageTenantMembers) → parse → service.

import bcrypt from "bcryptjs";
import {
  createUser,
  deleteUser,
  getUserInTenant,
  listUsersPaginated,
  updateUserPassword,
  updateUserRole,
  type AdminUserRow,
} from "@/lib/authStore";
import { checkUserQuota } from "@/lib/quota";
import { sendWelcomeEmail } from "@/lib/email";
import type { Principal } from "@/lib/abac";

/** Role yang boleh di-assign lewat member management (bukan owner/platform). */
export const MEMBER_MANAGEABLE_ROLES = ["member", "tenant_admin"] as const;
export type MemberManageableRole = (typeof MEMBER_MANAGEABLE_ROLES)[number];

function isMemberManageableRole(role: string): role is MemberManageableRole {
  return (MEMBER_MANAGEABLE_ROLES as readonly string[]).includes(role);
}

export interface ServiceResult<T = undefined> {
  ok: boolean;
  status?: number;
  error?: string;
  data?: T;
}

export interface InviteInput {
  tenantId: string;
  name: string;
  email: string;
  password: string;
  role: string;
}

export interface InviteResult {
  id: string;
}

// Undang member/tenant_admin baru ke tenant. Validasi nama/email/password
// dilakukan route (format) — service jaga invariant role + kuota + email duplikat.
// Catatan audit action user.create ditambahkan di lapisan route (Task 7).
export async function inviteTenantMember(
  input: InviteInput,
): Promise<ServiceResult<InviteResult>> {
  const role = input.role;
  if (!isMemberManageableRole(role)) {
    return {
      ok: false,
      status: 400,
      error: "Role tidak valid — hanya member atau tenant_admin yang bisa dibuat lewat sini.",
    };
  }

  const quota = await checkUserQuota(input.tenantId);
  if (!quota.ok) {
    return {
      ok: false,
      status: 429,
      error: `Kuota user tenant tercapai (${quota.used}/${quota.max}).`,
    };
  }

  try {
    const passwordHash = bcrypt.hashSync(input.password, 10);
    const { id } = await createUser({
      tenantId: input.tenantId,
      email: input.email,
      name: input.name,
      passwordHash,
      role,
    });
    // Email welcome never-throw; tanpa RESEND_API_KEY otomatis di-skip.
    await sendWelcomeEmail({ email: input.email, name: input.name });
    return { ok: true, data: { id } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Pelanggaran unique email → 409; selain itu 500.
    const isDuplicate =
      message.toLowerCase().includes("unique") ||
      message.toLowerCase().includes("duplicate") ||
      message.toLowerCase().includes("already exists");
    return {
      ok: false,
      status: isDuplicate ? 409 : 500,
      error: isDuplicate ? "Email sudah terdaftar" : "Gagal membuat user",
    };
  }
}

// Daftar user tenant (delegasi listUsersPaginated yang baca D1).
export async function listTenantMembers(
  tenantId: string,
  params: { q?: string; page?: number; limit?: number } = {},
): Promise<{ users: AdminUserRow[]; total: number }> {
  return listUsersPaginated({ tenantId, ...params });
}

// Ubah role member/tenant_admin. Target owner/platform_admin tidak bisa diubah
// lewat jalur ini (owner dikelola via platform admin).
export async function updateTenantMemberRole(
  userId: string,
  tenantId: string,
  role: string,
): Promise<ServiceResult<{ d1Ok: boolean }>> {
  if (!isMemberManageableRole(role)) {
    return {
      ok: false,
      status: 400,
      error: "Role tidak valid — hanya member atau tenant_admin yang bisa di-assign.",
    };
  }
  const user = await getUserInTenant(userId, tenantId);
  if (!user) return { ok: false, status: 404, error: "User tidak ditemukan di tenant ini." };
  if (user.role === "owner" || user.role === "platform_admin") {
    return {
      ok: false,
      status: 400,
      error: "Owner/platform_admin dikelola lewat platform admin, bukan member management.",
    };
  }
  if (user.role === role) return { ok: true, data: { d1Ok: true } };

  const result = await updateUserRole(userId, tenantId, role);
  if (!result.updated) {
    return { ok: false, status: 404, error: "User tidak ditemukan di tenant ini." };
  }
  return { ok: true, data: { d1Ok: result.d1Ok } };
}

// Hapus user dari tenant. Menolak: hapus diri sendiri, hapus owner/platform_admin.
export async function removeTenantMember(
  userId: string,
  tenantId: string,
  actor: Principal,
): Promise<ServiceResult<{ d1Ok: boolean }>> {
  if (actor.id === userId) {
    return { ok: false, status: 400, error: "Tidak bisa menghapus akun sendiri." };
  }
  const user = await getUserInTenant(userId, tenantId);
  if (!user) return { ok: false, status: 404, error: "User tidak ditemukan di tenant ini." };
  if (user.role === "owner" || user.role === "platform_admin") {
    return {
      ok: false,
      status: 400,
      error: "Owner/platform_admin tidak bisa dihapus lewat member management.",
    };
  }
  const result = await deleteUser(userId, tenantId);
  if (!result.deleted) {
    return { ok: false, status: 404, error: "User tidak ditemukan di tenant ini." };
  }
  return { ok: true, data: { d1Ok: result.d1Ok } };
}

// Reset password user dalam tenant (scope-check via getUserInTenant).
export async function resetTenantMemberPassword(
  userId: string,
  tenantId: string,
  newPassword: string,
): Promise<ServiceResult<{ d1Ok: boolean }>> {
  const user = await getUserInTenant(userId, tenantId);
  if (!user) return { ok: false, status: 404, error: "User tidak ditemukan di tenant ini." };

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  const result = await updateUserPassword(userId, passwordHash);
  if (!result.updated) {
    return { ok: false, status: 404, error: "User tidak ditemukan di tenant ini." };
  }
  return { ok: true, data: { d1Ok: result.d1Ok } };
}
