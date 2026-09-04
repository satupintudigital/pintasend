import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canAccessTenant,
  canManageTenantMembers,
  isPlatformAdmin,
  normalizeRole,
  parsePrincipal,
  roleAtLeast,
} from "./abac";

// ── 1. ABAC murni (role matrix) ─────────────────────────────────────────────
describe("abac — matriks role & scope", () => {
  const p = (role: string, tenantId = "tA") => ({
    id: "u1",
    email: "x@y.z",
    name: null,
    role: normalizeRole(role),
    tenantId,
  });

  it("tenant_admin & owner bisa kelola member tenant SENDIRI; member tidak", () => {
    expect(canManageTenantMembers(p("owner"), "tA")).toBe(true);
    expect(canManageTenantMembers(p("tenant_admin"), "tA")).toBe(true);
    expect(canManageTenantMembers(p("member"), "tA")).toBe(false);
    expect(canManageTenantMembers(p("owner"), "tB")).toBe(false); // tenant lain
    expect(canManageTenantMembers(p("owner"), null)).toBe(false);
  });

  it("platform_admin punya akses lintas-tenant; owner tidak", () => {
    expect(isPlatformAdmin(p("platform_admin"))).toBe(true);
    expect(canAccessTenant(p("platform_admin"), "tB")).toBe(true);
    expect(canAccessTenant(p("platform_admin"), null)).toBe(true);
    expect(canAccessTenant(p("owner"), "tB")).toBe(false);
  });

  it("roleAtLeast menghormati hierarki", () => {
    expect(roleAtLeast(p("member").role, "member")).toBe(true);
    expect(roleAtLeast(p("tenant_admin").role, "tenant_admin")).toBe(true);
    expect(roleAtLeast(p("owner").role, "tenant_admin")).toBe(true);
    expect(roleAtLeast(p("tenant_admin").role, "owner")).toBe(false);
  });

  it("parsePrincipal menolak session tanpa user.id", () => {
    expect(parsePrincipal(null)).toBeNull();
    expect(parsePrincipal({ user: null })).toBeNull();
    expect(parsePrincipal({ user: { id: "u1", role: "owner" } })?.role).toBe("owner");
  });
});

// ── 2. Route sampel: scope tenant diambil dari SESSION, bukan params/body ───
// Mock service member-management; assert argumen tenantId selalu tenantId sesi
// (resource milik tenant lain tidak bisa dijangkau karena service scoped).
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/tenantMembers", () => ({
  updateTenantMemberRole: vi.fn(async () => ({ ok: true, data: { d1Ok: true } })),
  removeTenantMember: vi.fn(async () => ({ ok: true, data: { d1Ok: true } })),
  resetTenantMemberPassword: vi.fn(async () => ({ ok: true, data: { d1Ok: true } })),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  clientIp: () => "127.0.0.1",
  rateLimitResponse: () => Response.json({ error: "rate limited" }, { status: 429 }),
}));
vi.mock("@/lib/audit", () => ({ recordAuditFromSession: vi.fn(async () => {}) }));

import { auth } from "@/lib/auth";
import {
  removeTenantMember,
  updateTenantMemberRole,
  resetTenantMemberPassword,
} from "@/lib/tenantMembers";
import { PATCH } from "@/app/api/admin/users/[id]/route";
import { DELETE } from "@/app/api/admin/users/[id]/route";
import { PATCH as RESET_PW } from "@/app/api/admin/users/[id]/password/route";

const mockedAuth = vi.mocked(auth);
const mockedUpdate = vi.mocked(updateTenantMemberRole);
const mockedRemove = vi.mocked(removeTenantMember);
const mockedReset = vi.mocked(resetTenantMemberPassword);

// Session milik tenant A (owner) mencoba menyentuh resource milik tenant B.
const sessionA = {
  user: { id: "uA", email: "ownerA@x.y", name: "A", role: "owner", tenantId: "tA" },
};
const targetUserB = "uB-target-tenant-lain";
const params = { params: Promise.resolve({ id: targetUserB }) };

function jsonReq(body: unknown, url = "http://x") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("cross-tenant regression — resource tenant B lewat sesi tenant A", () => {
  it("PATCH role: tenantId yang dikirim ke service = tA (scope sesi), bukan dari body", async () => {
    mockedAuth.mockResolvedValue(sessionA as never);
    // Body memuat tenantId B — dicoba dikirim attacker, HARUS diabaikan.
    const res = await PATCH(
      jsonReq({ role: "tenant_admin", tenantId: "tB" }),
      params,
    );
    expect(res.status).toBe(200);
    // Service menerima tenantId dari parsePrincipal(sesi) = tA.
    expect(mockedUpdate).toHaveBeenCalledWith("uB-target-tenant-lain", "tA", "tenant_admin");
  });

  it("DELETE member: scope service = tA; user tB tak ditemukan di tenant → 404 (tidak bocor)", async () => {
    mockedAuth.mockResolvedValue(sessionA as never);
    mockedRemove.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "User tidak ditemukan di tenant ini.",
    });
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), params);
    expect(res.status).toBe(404);
    expect(mockedRemove).toHaveBeenCalledWith("uB-target-tenant-lain", "tA", expect.anything());
  });

  it("reset password: dipanggil dengan tenantId sesi; user tenant lain → 404", async () => {
    mockedAuth.mockResolvedValue(sessionA as never);
    mockedReset.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: "User tidak ditemukan di tenant ini.",
    });
    const res = await RESET_PW(jsonReq({ password: "rahasia123", tenantId: "tB" }), params);
    expect(res.status).toBe(404);
    expect(mockedReset).toHaveBeenCalledWith("uB-target-tenant-lain", "tA", "rahasia123");
  });
});
