import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerTenantOwner, validateRegisterInput, EmailAlreadyTakenError } from "./register";
import { query } from "@/lib/db";
import { queryD1 } from "@/lib/d1";
import { createUser } from "@/lib/authStore";
import { sendWelcomeEmail } from "@/lib/email";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));
vi.mock("@/lib/d1", () => ({
  queryD1: vi.fn(async () => []),
  changesD1: vi.fn(async () => 1),
  queryD1One: vi.fn(async () => undefined),
}));
vi.mock("@/lib/authStore", () => ({
  createUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/tenantStore", () => ({
  syncTenantD1: vi.fn(async () => true),
}));
vi.mock("@/lib/email", () => ({
  sendWelcomeEmail: vi.fn(async () => {}),
}));

const q = query as unknown as ReturnType<typeof vi.fn>;
const d1q = queryD1 as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  q.mockReset();
  q.mockImplementation(async () => []);
  d1q.mockReset();
  d1q.mockImplementation(async () => []);
});

describe("validateRegisterInput", () => {
  it("validasi email/password/nama/tenant", () => {
    expect(validateRegisterInput({ name: "A", email: "a@b.id", password: "password123", tenantName: "PT X" })).toBeNull();
    expect(validateRegisterInput({ name: "A", email: "bad", password: "password123", tenantName: "PT X" })).toContain("email");
    expect(validateRegisterInput({ name: "A", email: "a@b.id", password: "short", tenantName: "PT X" })).toContain("Password");
    expect(validateRegisterInput({ name: "A", email: "a@b.id", password: "password123", tenantName: "X" })).toContain("tenant");
  });
});

describe("registerTenantOwner", () => {
  it("email duplikat → EmailAlreadyTakenError (tenant tidak dibuat)", async () => {
    q.mockImplementationOnce(async () => [{ id: "u1" }]); // SELECT duplikat
    await expect(
      registerTenantOwner({ name: "A", email: "a@b.id", password: "password123", tenantName: "PT X" }),
    ).rejects.toBeInstanceOf(EmailAlreadyTakenError);
    expect(q.mock.calls[0][0]).toContain('SELECT id FROM "User" WHERE email');
  });

  it("registrasi sukses: tenant + user (Neon+D1) + TenantBalance + email", async () => {
    q.mockImplementation(async () => []); // SELECT duplikat → kosong → proceed
    const res = await registerTenantOwner({ name: "Alice", email: "alice@b.id", password: "password123", tenantName: "PT Alice" });
    expect(res.tenantId).toBeTruthy();
    expect(res.userId).toBe("user-1");

    // INSERT Tenant (setelah SELECT cek duplikat)
    const tenantSql = q.mock.calls[1][0] as string;
    expect(tenantSql).toContain('INSERT INTO "Tenant"');
    // createUser dipanggil role owner
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ role: "owner", email: "alice@b.id" }));
    // TenantBalance init 0 (query terakhir)
    const balanceSql = q.mock.calls[q.mock.calls.length - 1][0] as string;
    expect(balanceSql).toContain('INSERT INTO "TenantBalance"');
    // Clone tenant ke D1 (activatedAt null — hardcoded NULL dalam SQL)
    const d1Sql = d1q.mock.calls[0][0] as string;
    expect(d1Sql).toContain("INSERT OR REPLACE INTO Tenant");
    expect(d1Sql).toContain("activatedAt");
    expect(d1q.mock.calls[0][1]).toEqual([res.tenantId, "PT Alice"]);
    // Email sambutan best-effort
    expect(sendWelcomeEmail).toHaveBeenCalledWith({ email: "alice@b.id", name: "Alice" });
  });
});