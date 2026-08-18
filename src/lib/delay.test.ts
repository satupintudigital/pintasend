import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DELAY_MAX_MS,
  DELAY_MIN_MS,
  getTenantDelayInfo,
  randomDelayMs,
  resolveDelayActive,
} from "./delay";

const neonQuery = vi.fn(async (_text: string, _params?: unknown[]) => []);
vi.mock("@/lib/db", () => ({
  query: (_t: string, _p?: unknown[]) => neonQuery(_t, _p),
  queryOne: (_t: string, _p?: unknown[]) => neonQuery(_t, _p).then((rows: unknown[]) => rows[0]),
}));

describe("delay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    neonQuery.mockReset();
    neonQuery.mockImplementation(async () => []);
  });

  it("randomDelayMs selalu dalam rentang 3.000–10.000 ms", () => {
    for (let i = 0; i < 200; i++) {
      const v = randomDelayMs();
      expect(v).toBeGreaterThanOrEqual(DELAY_MIN_MS);
      expect(v).toBeLessThanOrEqual(DELAY_MAX_MS);
    }
  });

  it("randomDelayMs mencapai batas bawah & atas (Math.random 0 dan ~1)", () => {
    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValue(0);
    expect(randomDelayMs()).toBe(DELAY_MIN_MS);
    spy.mockReturnValue(0.9999999999);
    expect(randomDelayMs()).toBe(DELAY_MAX_MS);
    spy.mockRestore();
  });

  it("resolveDelayActive: aktif hanya bila enabled DAN entitled", () => {
    expect(resolveDelayActive(true, true, false).active).toBe(true); // via plan
    expect(resolveDelayActive(true, false, true).active).toBe(true); // via addon
    expect(resolveDelayActive(true, false, false).active).toBe(false); // tidak entitled
    expect(resolveDelayActive(false, true, false).active).toBe(false); // dimatikan admin
    expect(resolveDelayActive(false, false, true).active).toBe(false);
    const info = resolveDelayActive(true, false, true);
    expect(info).toEqual({ enabled: true, entitled: true, active: true });
  });

  it("getTenantDelayInfo: peta baris Neon → DelayInfo", async () => {
    neonQuery.mockResolvedValueOnce([
      { delayEnabled: true, includesDelay: false, addonActive: true },
    ]);
    expect(await getTenantDelayInfo("t1")).toEqual({
      enabled: true,
      entitled: true,
      active: true,
    });
    expect(neonQuery.mock.calls[0][0]).toContain("TenantAddon");
  });

  it("getTenantDelayInfo: tenant tanpa plan / tidak ditemukan → nonaktif", async () => {
    neonQuery.mockResolvedValueOnce([{ delayEnabled: false, includesDelay: null, addonActive: null }]);
    expect(await getTenantDelayInfo("t2")).toEqual({
      enabled: false,
      entitled: false,
      active: false,
    });
    neonQuery.mockResolvedValueOnce([]);
    expect(await getTenantDelayInfo("t-hilang")).toEqual({
      enabled: false,
      entitled: false,
      active: false,
    });
  });
});
