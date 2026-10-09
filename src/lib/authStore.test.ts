import { describe, expect, it, vi, beforeEach } from "vitest";
import { query } from "@/lib/db";
import { verifyApiKey } from "./authStore";
import { API_KEY_PREFIX } from "./apiKeys";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
}));

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
      { id: "k1", tenantId: "t1", revokedAt: null, suspendedAt: "2026-08-18T00:00:00.000Z", activatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const result = await verifyApiKey(raw);
    expect(result).toBeNull();
    const sql = (fakeDb.prepare.mock.calls[0] as unknown as [string])[0];
    expect(sql.toLowerCase()).toContain("join tenant");
    expect(sql.toLowerCase()).toContain("keyhash");
    expect(sql.toLowerCase()).toContain("activatedat");
  });

  it("mengizinkan key tenant aktif & mengembalikan keyId (utk rate limit per key)", async () => {
    const raw = `${API_KEY_PREFIX}${"b".repeat(48)}`;
    await seedD1([{ id: "k2", tenantId: "t1", revokedAt: null, suspendedAt: null, activatedAt: "2026-01-01T00:00:00.000Z" }]);
    const result = await verifyApiKey(raw);
    expect(result).toEqual({ tenantId: "t1", keyId: "k2" });
  });

  it("menolak key tenant pending (activatedAt NULL)", async () => {
    const raw = `${API_KEY_PREFIX}${"d".repeat(48)}`;
    await seedD1([{ id: "k4", tenantId: "t1", revokedAt: null, suspendedAt: null, activatedAt: null }]);
    const result = await verifyApiKey(raw);
    expect(result).toBeNull();
  });

  it("menolak key yang dicabut (revoked) walau tenant aktif", async () => {
    const raw = `${API_KEY_PREFIX}${"c".repeat(48)}`;
    await seedD1([
      { id: "k3", tenantId: "t1", revokedAt: "2026-08-18T00:00:00.000Z", suspendedAt: null, activatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const result = await verifyApiKey(raw);
    expect(result).toBeNull();
  });

  it("fallback ke Neon & auto-repair D1 saat D1 miss", async () => {
    const raw = `${API_KEY_PREFIX}${"e".repeat(48)}`;
    await seedD1([]); // D1 kosong

    vi.mocked(query).mockResolvedValueOnce([
      {
        id: "k5",
        tenantId: "t5",
        label: "Neon Key",
        keyHash: "dummy",
        prefix: "pintasend_ee",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
        tenantName: "Tenant 5",
        suspendedAt: null,
        activatedAt: "2026-01-01T00:00:00.000Z",
      },
    ] as never);

    const result = await verifyApiKey(raw);
    expect(result).toEqual({ tenantId: "t5", keyId: "k5" });
  });

  it("fallback ke Neon saat D1 query throw error", async () => {
    const raw = `${API_KEY_PREFIX}${"f".repeat(48)}`;
    fakeStmt.all.mockRejectedValueOnce(new Error("D1 connection lost"));

    vi.mocked(query).mockResolvedValueOnce([
      {
        id: "k6",
        tenantId: "t6",
        label: "Neon Key 2",
        keyHash: "dummy2",
        prefix: "pintasend_ff",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
        tenantName: "Tenant 6",
        suspendedAt: null,
        activatedAt: "2026-01-01T00:00:00.000Z",
      },
    ] as never);

    const result = await verifyApiKey(raw);
    expect(result).toEqual({ tenantId: "t6", keyId: "k6" });
  });
});
