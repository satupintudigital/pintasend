import { describe, it, expect } from "vitest";
import type { Role } from "./abac";
import {
  normalizeRole,
  canAccessTenant,
  canManageTenantMembers,
  isTenantOwnerOrAbove,
  isPlatformAdmin,
  roleAtLeast,
  parsePrincipal,
  unauthorized,
  forbidden,
} from "./abac";

describe("normalizeRole", () => {
  it("mengembalikan role valid apa adanya", () => {
    expect(normalizeRole("owner")).toBe("owner");
    expect(normalizeRole("tenant_admin")).toBe("tenant_admin");
    expect(normalizeRole("member")).toBe("member");
    expect(normalizeRole("platform_admin")).toBe("platform_admin");
  });
  it("role tidak dikenal / kosong / null jatuh ke member", () => {
    expect(normalizeRole("superuser")).toBe("member");
    expect(normalizeRole("")).toBe("member");
    expect(normalizeRole(undefined)).toBe("member");
    expect(normalizeRole(null)).toBe("member");
  });
});

describe("roleAtLeast", () => {
  it("membandingkan hierarki role", () => {
    expect(roleAtLeast("owner", "owner")).toBe(true);
    expect(roleAtLeast("owner", "member")).toBe(true);
    expect(roleAtLeast("member", "owner")).toBe(false);
    expect(roleAtLeast("tenant_admin", "owner")).toBe(false);
    expect(roleAtLeast("tenant_admin", "tenant_admin")).toBe(true);
    expect(roleAtLeast("platform_admin", "owner")).toBe(true);
  });
});

describe("isPlatformAdmin / isTenantOwnerOrAbove", () => {
  const p = (role: Role) =>
    ({ id: "u1", email: "a@b.c", name: "A", role, tenantId: "t1" }) as const;
  it("isPlatformAdmin hanya true untuk platform_admin", () => {
    expect(isPlatformAdmin(p("platform_admin"))).toBe(true);
    expect(isPlatformAdmin(p("owner"))).toBe(false);
    expect(isPlatformAdmin(p("member"))).toBe(false);
  });
  it("isTenantOwnerOrAbove true untuk owner & platform_admin, false untuk member/tenant_admin", () => {
    expect(isTenantOwnerOrAbove(p("owner"))).toBe(true);
    expect(isTenantOwnerOrAbove(p("platform_admin"))).toBe(true);
    expect(isTenantOwnerOrAbove(p("tenant_admin"))).toBe(false);
    expect(isTenantOwnerOrAbove(p("member"))).toBe(false);
  });
});

describe("canAccessTenant", () => {
  const ownerA = { id: "u1", email: "o@a.id", name: "O", role: "owner", tenantId: "tA" } as const;
  const memberA = { id: "u2", email: "m@a.id", name: "M", role: "member", tenantId: "tA" } as const;
  const adminB = { id: "u3", email: "b@b.id", name: "B", role: "tenant_admin", tenantId: "tB" } as const;
  const platform = { id: "u9", email: "p@pintasend.test", name: "P", role: "platform_admin", tenantId: "tP" } as const;

  it("owner/member/tenant_admin hanya akses tenant sendiri", () => {
    expect(canAccessTenant(ownerA, "tA")).toBe(true);
    expect(canAccessTenant(memberA, "tA")).toBe(true);
    expect(canAccessTenant(adminB, "tB")).toBe(true);
    expect(canAccessTenant(ownerA, "tB")).toBe(false);
    expect(canAccessTenant(adminB, "tA")).toBe(false);
  });
  it("platform_admin akses tenant mana pun", () => {
    expect(canAccessTenant(platform, "tA")).toBe(true);
    expect(canAccessTenant(platform, "tZ")).toBe(true);
    expect(canAccessTenant(platform, null)).toBe(true);
  });
  it("tenantId kosong untuk non-platform → false", () => {
    expect(canAccessTenant(ownerA, null)).toBe(false);
    expect(canAccessTenant(ownerA, undefined)).toBe(false);
  });
});

describe("canManageTenantMembers", () => {
  const ownerA = { id: "u1", email: "o@a.id", name: "O", role: "owner", tenantId: "tA" } as const;
  const tAdminA = { id: "u2", email: "ta@a.id", name: "TA", role: "tenant_admin", tenantId: "tA" } as const;
  const memberA = { id: "u3", email: "m@a.id", name: "M", role: "member", tenantId: "tA" } as const;
  const tAdminB = { id: "u4", email: "tb@b.id", name: "TB", role: "tenant_admin", tenantId: "tB" } as const;
  const platform = { id: "u9", email: "p@pintasend.test", name: "P", role: "platform_admin", tenantId: "tP" } as const;

  it("owner & tenant_admin tenant tsb boleh kelola member", () => {
    expect(canManageTenantMembers(ownerA, "tA")).toBe(true);
    expect(canManageTenantMembers(tAdminA, "tA")).toBe(true);
  });
  it("member tidak boleh; tenant_admin tenant lain tidak boleh", () => {
    expect(canManageTenantMembers(memberA, "tA")).toBe(false);
    expect(canManageTenantMembers(tAdminB, "tA")).toBe(false);
  });
  it("platform_admin boleh kelola member tenant mana pun", () => {
    expect(canManageTenantMembers(platform, "tA")).toBe(true);
    expect(canManageTenantMembers(platform, null)).toBe(true);
  });
});

describe("parsePrincipal", () => {
  it("session null / user null → null", () => {
    expect(parsePrincipal(null)).toBeNull();
    expect(parsePrincipal({ user: null })).toBeNull();
  });
  it("session user lengkap → principal", () => {
    const p = parsePrincipal({
      user: { id: "u1", email: "x@y.z", name: "X", role: "owner", tenantId: "t1" },
    });
    expect(p).toMatchObject({ id: "u1", email: "x@y.z", role: "owner", tenantId: "t1" });
  });
  it("role tidak dikenal dinormalisasi ke member", () => {
    const p = parsePrincipal({ user: { id: "u1", role: "hacker", tenantId: "t1" } });
    expect(p?.role).toBe("member");
  });
});

describe("helper response", () => {
  it("unauthorized → 401 dengan body error", async () => {
    const r = unauthorized();
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "Unauthorized" });
  });
  it("forbidden → 403", async () => {
    const r = forbidden();
    expect(r.status).toBe(403);
  });
});
