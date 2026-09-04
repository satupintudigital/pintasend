import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  inviteTenantMember,
  listTenantMembers,
  updateTenantMemberRole,
  removeTenantMember,
  resetTenantMemberPassword,
} from "./tenantMembers";
import { query, queryOne } from "@/lib/db";

// Fake D1 (cf binding) — meta.changes default 1 agar write-through D1 dianggap sukses.
const fakeStmt = {
  bind: vi.fn(() => fakeStmt),
  all: vi.fn(async () => ({ results: [] as Record<string, unknown>[], meta: { changes: 1 } })),
};
const fakeDb = { prepare: vi.fn(() => fakeStmt) };
vi.mock("@/lib/cf", () => ({ getBinding: vi.fn(async () => fakeDb) }));
vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));
vi.mock("@/lib/email", () => ({ sendWelcomeEmail: vi.fn(async () => {}) }));

const q = query as unknown as ReturnType<typeof vi.fn>;
const qo = queryOne as unknown as ReturnType<typeof vi.fn>;

// Reset deterministik: kosongkan queue + pasang implementasi dasar ([] / undefined).
function baseQuery() {
  q.mockReset();
  q.mockImplementation(async () => []);
  qo.mockReset();
  qo.mockImplementation(async () => undefined);
}

const OWNER = { id: "o1", email: "owner@a.id", name: "Owner", role: "owner", tenantId: "tA" } as const;
const TA = { id: "ta1", email: "ta@a.id", name: "TA", role: "tenant_admin", tenantId: "tA" } as const;
const PLATFORM = {
  id: "p1",
  email: "p@wavio.test",
  name: "P",
  role: "platform_admin",
  tenantId: "tP",
} as const;

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "u1",
    tenantId: "tA",
    email: "m@a.id",
    name: "Member",
    role: "member",
    createdAt: "2026-01-01",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  baseQuery();
});

describe("inviteTenantMember", () => {
  it("menolak role owner & platform_admin via jalur member", async () => {
    const r1 = await inviteTenantMember(
      { tenantId: "tA", name: "X", email: "x@a.id", password: "password123", role: "owner" },
      OWNER,
    );
    expect(r1.ok).toBe(false);
    expect(r1.status).toBe(400);
    const r2 = await inviteTenantMember(
      { tenantId: "tA", name: "X", email: "x@a.id", password: "password123", role: "platform_admin" },
      OWNER,
    );
    expect(r2.ok).toBe(false);
    expect(q).not.toHaveBeenCalled();
  });

  it("invite member sukses (tanpa plan → kuota tidak diblokir)", async () => {
    const r = await inviteTenantMember(
      { tenantId: "tA", name: "M", email: "m@a.id", password: "password123", role: "member" },
      OWNER,
    );
    expect(r.ok).toBe(true);
    expect((r as { data?: { id: string } }).data?.id).toBeTruthy();
  });

  it("email duplikat → 409", async () => {
    // Tanpa plan (queryOne default undefined) → kuota lolos tanpa countUsers;
    // INSERT user (query) → duplicate key.
    q.mockImplementationOnce(async () => {
      throw new Error("duplicate key value violates unique constraint");
    });
    const r = await inviteTenantMember(
      { tenantId: "tA", name: "M", email: "dup@a.id", password: "password123", role: "tenant_admin" },
      OWNER,
    );
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
  });
});

describe("listTenantMembers", () => {
  it("mendelegasikan ke listUsersPaginated dengan scope tenant (baca D1)", async () => {
    const result = await listTenantMembers("tA", { page: 1, limit: 10 });
    expect(result).toEqual({ users: [], total: 0 });
    const sql = (fakeDb.prepare.mock.calls[0] as unknown as [string])[0];
    expect(sql).toContain("FROM User");
    expect(sql).toContain('"tenantId" = ?');
  });
});

describe("updateTenantMemberRole", () => {
  it("menolak role di luar member/tenant_admin", async () => {
    const r = await updateTenantMemberRole("u1", "tA", "owner");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(q).not.toHaveBeenCalled();
  });
  it("target owner tidak bisa diubah lewat jalur member", async () => {
    q.mockImplementationOnce(async () => [row({ role: "owner" })]);
    const r = await updateTenantMemberRole("u1", "tA", "member");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });
  it("role sama → no-op sukses", async () => {
    q.mockImplementationOnce(async () => [row({ role: "tenant_admin" })]);
    const r = await updateTenantMemberRole("u1", "tA", "tenant_admin");
    expect(r.ok).toBe(true);
    expect(q).toHaveBeenCalledTimes(1);
  });
  it("member → tenant_admin sukses (Neon + D1)", async () => {
    q.mockImplementationOnce(async () => [row()]); // getUserInTenant
    q.mockImplementationOnce(async () => [{ id: "u1" }]); // UPDATE RETURNING id
    const r = await updateTenantMemberRole("u1", "tA", "tenant_admin");
    expect(r.ok).toBe(true);
    const updateSql = q.mock.calls[1][0] as string;
    expect(updateSql).toContain('UPDATE "User" SET role');
    expect(updateSql).toContain('"tenantId" = $3');
    expect(q.mock.calls[1][1]).toContain("tenant_admin");
  });
  it("user dari tenant lain → 404 (scope check getUserInTenant)", async () => {
    const r = await updateTenantMemberRole("uB", "tA", "member");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });
});

describe("removeTenantMember", () => {
  it("menolak menghapus diri sendiri", async () => {
    const r = await removeTenantMember("o1", "tA", OWNER);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(q).not.toHaveBeenCalled();
  });
  it("menolak menghapus owner/platform_admin", async () => {
    q.mockImplementationOnce(async () => [row({ role: "owner" })]);
    const r = await removeTenantMember("u1", "tA", TA);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });
  it("hapus member sukses", async () => {
    q.mockImplementationOnce(async () => [row()]); // getUserInTenant
    q.mockImplementationOnce(async () => [{ id: "u1" }]); // DELETE RETURNING id
    const r = await removeTenantMember("u1", "tA", OWNER);
    expect(r.ok).toBe(true);
    const delSql = q.mock.calls[1][0] as string;
    expect(delSql).toContain('DELETE FROM "User"');
    expect(delSql).toContain('"tenantId" = $2');
  });
});

describe("resetTenantMemberPassword", () => {
  it("user lintas-tenant → 404", async () => {
    const r = await resetTenantMemberPassword("uB", "tA", "password123");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
  });
  it("reset password member tenant sama → sukses", async () => {
    q.mockImplementationOnce(async () => [row()]); // getUserInTenant
    q.mockImplementationOnce(async () => [{ id: "u1" }]); // UPDATE password RETURNING id
    const r = await resetTenantMemberPassword("u1", "tA", "newpass1234");
    expect(r.ok).toBe(true);
    const sql = q.mock.calls[1][0] as string;
    expect(sql).toContain('UPDATE "User" SET "passwordHash"');
  });
});

describe("actor platform", () => {
  it("platform_admin bisa invite untuk tenant lain (role member)", async () => {
    const r = await inviteTenantMember(
      { tenantId: "tX", name: "M", email: "m@x.id", password: "password123", role: "member" },
      PLATFORM,
    );
    expect(r.ok).toBe(true);
  });
});
