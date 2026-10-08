import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTenantDetail } from "./platform";
import { query } from "./db";

vi.mock("./db", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

describe("getTenantDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("berhasil memuat detail tenant tanpa error sintaks SQL comment", async () => {
    const mockedQuery = vi.mocked(query);
    mockedQuery.mockResolvedValueOnce([
      {
        id: "t-1",
        name: "Tenant Test",
        createdAt: "2026-10-01",
        suspendedAt: null,
        planId: "p-1",
        planName: "Latte",
        delayEnabled: false,
        messageRetentionDays: 30,
        delayAddonActive: false,
        watermarkAddonActive: false,
        devices: 1,
        users: 1,
        messages: 10,
      },
    ]);

    const res = await getTenantDetail("t-1");
    expect(res).not.toBeNull();
    expect(res?.id).toBe("t-1");
    expect(res?.name).toBe("Tenant Test");

    const sql = mockedQuery.mock.calls[0][0];
    // Pastikan tidak ada JS line comment // di dalam string SQL
    expect(sql).not.toContain("//");
  });
});
