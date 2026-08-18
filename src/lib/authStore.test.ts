import { describe, expect, it, vi, beforeEach } from "vitest";
import { verifyApiKey } from "./authStore";
import { API_KEY_PREFIX } from "./apiKeys";

// Fake D1 dengan tabel ApiKey + Tenant (via mock @/lib/cf).
const fakeStmt = {
  bind: vi.fn(() => fakeStmt),
  all: vi.fn(async () => ({ results: [] as Record<string, unknown>[] })),
};
const fakeDb = {
  prepare: vi.fn(() => fakeStmt),
};
vi.mock("@/lib/cf", () => ({
  getBinding: vi.fn(async () => fakeDb),
}));
vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
}));

async function seedD1(rows: Record<string, unknown>[]) {
  fakeStmt.all.mockImplementation(async () => ({ results: rows }));
}

describe("verifyApiKey — gate suspend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("menolak key tenant yang di-suspend", async () => {
    const raw = `${API_KEY_PREFIX}${"a".repeat(48)}`;
    await seedD1([
      { id: "k1", tenantId: "t1", revokedAt: null, suspendedAt: "2026-08-18T00:00:00.000Z" },
    ]);
    const result = await verifyApiKey(raw);
    expect(result).toBeNull();
    const sql = (fakeDb.prepare.mock.calls[0] as unknown as [string])[0];
    expect(sql.toLowerCase()).toContain("join tenant");
    expect(sql.toLowerCase()).toContain("keyhash");
  });

  it("mengizinkan key tenant aktif", async () => {
    const raw = `${API_KEY_PREFIX}${"b".repeat(48)}`;
    await seedD1([{ id: "k2", tenantId: "t1", revokedAt: null, suspendedAt: null }]);
    const result = await verifyApiKey(raw);
    expect(result).toEqual({ tenantId: "t1" });
  });

  it("menolak key yang dicabut (revoked) walau tenant aktif", async () => {
    const raw = `${API_KEY_PREFIX}${"c".repeat(48)}`;
    await seedD1([
      { id: "k3", tenantId: "t1", revokedAt: "2026-08-18T00:00:00.000Z", suspendedAt: null },
    ]);
    const result = await verifyApiKey(raw);
    expect(result).toBeNull();
  });
});
