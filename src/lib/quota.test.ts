import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getTenantQuota,
  countDevices,
  countUsers,
  countMessagesThisMonth,
  checkDeviceQuota,
  checkUserQuota,
  checkMessageQuota,
} from "./quota";

const neonQuery = vi.fn(
  async (_text: string, _params?: unknown[]): Promise<Record<string, unknown>[]> => [],
);
vi.mock("@/lib/db", () => ({
  query: (_text: string, _params?: unknown[]) => neonQuery(_text, _params),
  queryOne: (_text: string, _params?: unknown[]) =>
    neonQuery(_text, _params).then((rows) => rows[0]),
}));

describe("quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset antrian mockResolvedValueOnce lintas test + pasang default kosong.
    neonQuery.mockReset();
    neonQuery.mockImplementation(async () => []);
  });

  it("getTenantQuota: join Plan; tanpa plan → null", async () => {
    neonQuery.mockResolvedValueOnce([
      { maxDevices: 3, maxUsers: 5, maxMessagesPerMonth: 500 },
    ]);
    const q = await getTenantQuota("t1");
    expect(q).toEqual({ maxDevices: 3, maxUsers: 5, maxMessagesPerMonth: 500 });
    expect(neonQuery.mock.calls[0][0]).toContain("Plan");

    neonQuery.mockResolvedValueOnce([]);
    expect(await getTenantQuota("t-noplan")).toBeNull();
  });

  it("countMessagesThisMonth memakai batas awal bulan (Asia/Jakarta)", async () => {
    neonQuery.mockResolvedValueOnce([{ count: 42 }]);
    const n = await countMessagesThisMonth("t1");
    expect(n).toBe(42);
    const [sql, params] = neonQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"createdAt" >= $2');
    expect(sql).toContain('"tenantId" = $1');
    expect(params[0]).toBe("t1");
    // Awal bulan berjalan dalam WIB: YYYY-MM-01T00:00:00+07:00.
    expect(params[1]).toMatch(/^\d{4}-\d{2}-01T00:00:00\+07:00$/);
  });

  it("checkDeviceQuota: lolos di bawah, blokir di atas/sama", async () => {
    neonQuery.mockResolvedValueOnce([{ maxDevices: 3, maxUsers: 5, maxMessagesPerMonth: 500 }]);
    neonQuery.mockResolvedValueOnce([{ count: 2 }]);
    expect(await checkDeviceQuota("t1")).toEqual({ ok: true, used: 2, max: 3 });

    neonQuery.mockResolvedValueOnce([{ maxDevices: 3, maxUsers: 5, maxMessagesPerMonth: 500 }]);
    neonQuery.mockResolvedValueOnce([{ count: 3 }]);
    expect(await checkDeviceQuota("t1")).toEqual({ ok: false, used: 3, max: 3 });
  });

  it("checkMessageQuota: maxMessagesPerMonth null = unlimited", async () => {
    neonQuery.mockResolvedValueOnce([{ maxDevices: 1, maxUsers: 1, maxMessagesPerMonth: null }]);
    neonQuery.mockResolvedValueOnce([{ count: 999 }]);
    expect(await checkMessageQuota("t1")).toEqual({ ok: true, used: 0, max: null });
  });

  it("checkUserQuota: tanpa plan → tidak diblokir (max null)", async () => {
    neonQuery.mockResolvedValueOnce([]);
    const r = await checkUserQuota("t-noplan");
    expect(r.ok).toBe(true);
    expect(r.max).toBeNull();
  });
});
