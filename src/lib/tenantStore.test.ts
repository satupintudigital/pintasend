import { describe, expect, it, vi, beforeEach } from "vitest";
import { setTenantSuspended } from "./tenantStore";

const neonQuery = vi.fn(
  async (_text: string, _params?: unknown[]): Promise<{ id: string }[]> => [{ id: "t1" }],
);
const d1Changes = vi.fn(async (_sql: string, _params?: unknown[]): Promise<number> => 1);
// Catatan: referensi ke mock di dalam factory harus lewat arrow function yang
// dieksekusi saat dipanggil (vi.mock di-hoist ke atas file → TDZ error kalau
// langsung mereferensikan konstanta).
vi.mock("@/lib/db", () => ({
  query: (_text: string, _params?: unknown[]) => neonQuery(_text, _params),
}));
vi.mock("@/lib/d1", () => ({
  changesD1: (_sql: string, _params?: unknown[]) => d1Changes(_sql, _params),
  queryD1: async () => [] as unknown[],
  queryD1One: async () => ({ name: "Wavio Demo" }),
}));

describe("tenantStore.setTenantSuspended", () => {
  beforeEach(() => vi.clearAllMocks());

  it("update Neon lalu clone ke D1 (suspend)", async () => {
    const r = await setTenantSuspended("t1", "2026-08-18T00:00:00.000Z");
    expect(r).toEqual({ updated: true, d1Ok: true });
    expect(neonQuery.mock.calls[0][0]).toContain('"suspendedAt"');
    expect(d1Changes.mock.calls[0][0]).toContain("INSERT OR REPLACE INTO Tenant");
    expect(d1Changes.mock.calls[0][1]).toEqual(["t1", "Wavio Demo", "2026-08-18T00:00:00.000Z"]);
  });

  it("activate (suspendedAt null) ikut di-clone ke D1", async () => {
    const r = await setTenantSuspended("t1", null);
    expect(r).toEqual({ updated: true, d1Ok: true });
    expect(d1Changes.mock.calls[0][1]).toEqual(["t1", "Wavio Demo", null]);
  });

  it("tenant tidak ditemukan → updated false, tanpa clone D1", async () => {
    neonQuery.mockResolvedValueOnce([]);
    const r = await setTenantSuspended("nope", null);
    expect(r.updated).toBe(false);
    expect(d1Changes).not.toHaveBeenCalled();
  });

  it("clone D1 gagal → d1Ok false (updated tetap true)", async () => {
    d1Changes.mockRejectedValueOnce(new Error("d1 down"));
    const r = await setTenantSuspended("t1", null);
    expect(r.updated).toBe(true);
    expect(r.d1Ok).toBe(false);
  });
});
