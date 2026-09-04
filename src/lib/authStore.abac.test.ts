import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createUser,
  createUserWithTenant,
  InvalidRoleError,
  assertCreateRole,
} from "./authStore";

const fakeStmt = {
  bind: vi.fn(() => fakeStmt),
  all: vi.fn(async () => ({ results: [] as Record<string, unknown>[] })),
};
const fakeDb = { prepare: vi.fn(() => fakeStmt) };
vi.mock("@/lib/cf", () => ({ getBinding: vi.fn(async () => fakeDb) }));
vi.mock("@/lib/db", () => ({ query: vi.fn(async () => []) }));

describe("assertCreateRole — whitelist role create user", () => {
  beforeEach(() => vi.clearAllMocks());

  it("menerima member, tenant_admin, owner, platform_admin", () => {
    expect(assertCreateRole("member")).toBe("member");
    expect(assertCreateRole("tenant_admin")).toBe("tenant_admin");
    expect(assertCreateRole("owner")).toBe("owner");
    expect(assertCreateRole("platform_admin")).toBe("platform_admin");
  });
  it("default ke owner saat kosong (jalur register)", () => {
    expect(assertCreateRole(undefined)).toBe("owner");
    expect(assertCreateRole(null)).toBe("owner");
  });
  it("menolak role tak dikenal dengan InvalidRoleError", () => {
    expect(() => assertCreateRole("superuser")).toThrow(InvalidRoleError);
    expect(() => assertCreateRole("")).toThrow(InvalidRoleError);
  });
});

describe("createUser — whitelist di-enforce sebelum INSERT", () => {
  beforeEach(() => vi.clearAllMocks());

  it("role invalid → InvalidRoleError & query tidak pernah dipanggil", async () => {
    await expect(
      createUser({ tenantId: "t1", email: "x@y.z", name: "X", passwordHash: "h", role: "hacker" }),
    ).rejects.toBeInstanceOf(InvalidRoleError);
    const { query } = await import("@/lib/db");
    expect(query).not.toHaveBeenCalled();
  });

  it("role valid (tenant_admin) → diteruskan ke INSERT", async () => {
    const { query } = await import("@/lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await createUser({ tenantId: "t1", email: "ta@x.y", name: "TA", passwordHash: "h", role: "tenant_admin" });
    const sql = (query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO "User"');
    expect((query as ReturnType<typeof vi.fn>).mock.calls[0][1]).toContain("tenant_admin");
  });
});

describe("createUserWithTenant — tetap default owner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tanpa role → owner (bukan error)", async () => {
    const { query } = await import("@/lib/db");
    (query as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "u1" }]);
    await createUserWithTenant({ tenantName: "Toko", email: "o@x.y", name: "O", passwordHash: "h" });
    expect(query).toHaveBeenCalled();
  });
});
