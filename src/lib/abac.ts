// ─── Attribute-Based Access Control (role gate terpusat) ─────────────────────
// Single source of truth untuk otorisasi role di seluruh route Wavio.
// Tujuan: menghilangkan duplikasi blok `role !== "platform_admin"` yang tersebar
// di 20+ route & menjaga konsistensi kebijakan akses saat role bertambah.
//
// Hierarki (semakin tinggi semakin luas hak tenant-scoped):
//   member (0) < tenant_admin (1) < owner (2) < platform_admin (3)
//
// Role disimpan sebagai STRING di DB (bukan enum PostgreSQL) — validasi &
// interpretasi dilakukan di lapisan ini (lihat ADR). Role yang tidak dikenal
// dinormalisasi ke "member" (deny-by-default), bukan error.
//
// Semua fungsi di file ini murni (tanpa import DB) — aman di-unit-test & aman
// dipakai dari server/edge.

export type Role = "member" | "tenant_admin" | "owner" | "platform_admin";

export const ROLE_ORDER: Record<Role, number> = {
  member: 0,
  tenant_admin: 1,
  owner: 2,
  platform_admin: 3,
};

/** Principal hasil parse session NextAuth — dipakai semua helper di bawah. */
export interface Principal {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  tenantId: string;
}

const KNOWN_ROLES = new Set<Role>(["member", "tenant_admin", "owner", "platform_admin"]);

/** Normalisasi role string (nilai tak dikenal/kosong → "member"). */
export function normalizeRole(role: string | undefined | null): Role {
  return role && KNOWN_ROLES.has(role as Role) ? (role as Role) : "member";
}

/** Bandingkan posisi role pada hierarki (member < tenant_admin < owner < platform_admin). */
export function roleAtLeast(role: Role, min: Role): boolean {
  return ROLE_ORDER[role] >= ROLE_ORDER[min];
}

/** Apakah principal adalah operator platform (lintas-tenant). */
export function isPlatformAdmin(p: Principal): boolean {
  return p.role === "platform_admin";
}

/** Apakah principal punya hak owner-level pada tenant (owner | platform_admin). */
export function isTenantOwnerOrAbove(p: Principal): boolean {
  return isPlatformAdmin(p) || p.role === "owner";
}

/**
 * Akses ke tenant tertentu:
 * - platform_admin → tenant mana pun (termasuk null = aksi platform-wide).
 * - selain itu → hanya tenant sendiri.
 */
export function canAccessTenant(p: Principal, tenantId: string | null | undefined): boolean {
  if (isPlatformAdmin(p)) return true;
  return !!tenantId && tenantId === p.tenantId;
}

/**
 * Hak kelola member tenant (invite, ganti role, reset password, hapus):
 * - owner | tenant_admin dari tenant tsb, atau platform_admin (lintas-tenant).
 */
export function canManageTenantMembers(p: Principal, tenantId: string | null | undefined): boolean {
  if (isPlatformAdmin(p)) return true;
  if (!tenantId || tenantId !== p.tenantId) return false;
  return p.role === "owner" || p.role === "tenant_admin";
}

export interface SessionLike {
  user?: {
    id?: string;
    email?: string | null;
    name?: string | null;
    role?: string | null;
    tenantId?: string | null;
  } | null;
}

/** Parse session NextAuth → Principal (null bila tidak ada user). */
export function parsePrincipal(session: SessionLike | null): Principal | null {
  const u = session?.user;
  if (!u?.id) return null;
  return {
    id: u.id,
    email: u.email ?? null,
    name: u.name ?? null,
    role: normalizeRole(u.role),
    tenantId: u.tenantId ?? "",
  };
}

/** Response baku 401 (konsisten dengan pesan yang dipakai route existing). */
export function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

/** Response baku 403 (konsisten dengan pesan yang dipakai route existing). */
export function forbidden(message = "Forbidden"): Response {
  return Response.json({ error: message }, { status: 403 });
}
