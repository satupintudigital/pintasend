import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  executeWatermarkAddonGet,
  executeWatermarkAddonSet,
  type WatermarkAddonContext,
} from "./watermarkAddon";

// ── Mocks ───────────────────────────────────────────────────────────────────
const setTenantAddonMock = vi.fn();
const tenantHasRemoveWatermarkMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock("@/lib/platform", () => ({
  setTenantAddon: (...args: unknown[]) => setTenantAddonMock(...args),
}));
vi.mock("@/lib/watermark", () => ({
  tenantHasRemoveWatermark: (...args: unknown[]) => tenantHasRemoveWatermarkMock(...args),
  WATERMARK_ADDON_KEY: "remove_watermark",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));
vi.mock("@/lib/requestLogger", () => ({
  logEvent: vi.fn(),
}));

const ctx: WatermarkAddonContext = { tenantId: "t1", keyId: "k1", requestId: "req-1" };

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue({ allowed: true });
});

afterEach(() => vi.restoreAllMocks());

describe("executeWatermarkAddonGet", () => {
  it("addon aktif → { active: true, watermark: false }", async () => {
    tenantHasRemoveWatermarkMock.mockResolvedValueOnce(true);
    const result = await executeWatermarkAddonGet(ctx);

    expect(result).toMatchObject({ ok: true, status: 200 });
    if (result.ok) {
      expect(result.body).toEqual({
        ok: true,
        addon: "remove_watermark",
        active: true,
        watermark: false,
      });
    }
    expect(tenantHasRemoveWatermarkMock).toHaveBeenCalledWith("t1");
  });

  it("addon nonaktif → { active: false, watermark: true }", async () => {
    tenantHasRemoveWatermarkMock.mockResolvedValueOnce(false);
    const result = await executeWatermarkAddonGet(ctx);

    expect(result).toMatchObject({ ok: true, status: 200 });
    if (result.ok) expect(result.body.watermark).toBe(true);
  });

  it("rate limit → 429 + retryAfterSec tanpa baca addon", async () => {
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false, retryAfterSec: 12 });
    const result = await executeWatermarkAddonGet(ctx);

    expect(result).toMatchObject({ ok: false, status: 429, retryAfterSec: 12 });
    expect(tenantHasRemoveWatermarkMock).not.toHaveBeenCalled();
  });

  it("error DB → 500", async () => {
    tenantHasRemoveWatermarkMock.mockRejectedValueOnce(new Error("db down"));
    const result = await executeWatermarkAddonGet(ctx);
    expect(result).toMatchObject({ ok: false, status: 500 });
  });
});

describe("executeWatermarkAddonSet", () => {
  it("grant (active:true) → upsert TenantAddon remove_watermark + body watermark:false", async () => {
    setTenantAddonMock.mockResolvedValueOnce(true);
    const result = await executeWatermarkAddonSet(true, ctx);

    expect(setTenantAddonMock).toHaveBeenCalledWith("t1", "remove_watermark", true);
    expect(result).toMatchObject({ ok: true, status: 200 });
    if (result.ok) {
      expect(result.body).toEqual({
        ok: true,
        addon: "remove_watermark",
        active: true,
        watermark: false,
      });
    }
  });

  it("cabut (active:false) → watermark kembali aktif", async () => {
    setTenantAddonMock.mockResolvedValueOnce(true);
    const result = await executeWatermarkAddonSet(false, ctx);

    expect(setTenantAddonMock).toHaveBeenCalledWith("t1", "remove_watermark", false);
    if (result.ok) expect(result.body.watermark).toBe(true);
  });

  it("tenant tidak ditemukan (upsert 0 baris) → 404", async () => {
    setTenantAddonMock.mockResolvedValueOnce(false);
    const result = await executeWatermarkAddonSet(true, ctx);
    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it("error DB → 500", async () => {
    setTenantAddonMock.mockRejectedValueOnce(new Error("db down"));
    const result = await executeWatermarkAddonSet(true, ctx);
    expect(result).toMatchObject({ ok: false, status: 500 });
  });

  it("rate limit → 429 + retryAfterSec tanpa tulis addon", async () => {
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false, retryAfterSec: 30 });
    const result = await executeWatermarkAddonSet(true, ctx);
    expect(result).toMatchObject({ ok: false, status: 429, retryAfterSec: 30 });
    expect(setTenantAddonMock).not.toHaveBeenCalled();
  });
});
