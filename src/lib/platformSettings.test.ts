import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PLATFORM_SETTING_KEYS,
  platformSettingType,
  getPlatformSetting,
  setPlatformSetting,
  listPlatformSettings,
  encodeSettingValue,
} from "./platformSettings";
import { query } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));

const q = query as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("platformSettings", () => {
  it("whitelist memuat 8 key dengan tipe benar", () => {
    expect(platformSettingType("platform_name")).toBe("string");
    expect(platformSettingType("watermark_footnote")).toBe("string");
    expect(platformSettingType("allow_public_registration")).toBe("boolean");
    expect(platformSettingType("message_retention_default_days")).toBe("number");
    expect(platformSettingType("activation_fee_rp")).toBe("number");
    expect(platformSettingType("credit_price_per_message")).toBe("number");
    expect(platformSettingType("credit_min_topup_rp")).toBe("number");
    expect(platformSettingType("order_expiry_minutes")).toBe("number");
    expect(platformSettingType("unknown_key")).toBeNull();
    expect(Object.keys(PLATFORM_SETTING_KEYS)).toHaveLength(8);
  });

  it("encodeSettingValue: batas nominal & order expiry diterapkan", async () => {
    expect(encodeSettingValue("activation_fee_rp", -1).ok).toBe(false);
    expect(encodeSettingValue("credit_price_per_message", 11_000_000).ok).toBe(false);
    expect(encodeSettingValue("order_expiry_minutes", 10).ok).toBe(false);
    expect(encodeSettingValue("order_expiry_minutes", 10080).ok).toBe(true);
    expect(encodeSettingValue("credit_min_topup_rp", 20000).ok).toBe(true);
  });

  it("getPlatformSetting: fallback default bila baris kosong", async () => {
    q.mockResolvedValueOnce([]);
    const v = await getPlatformSetting("platform_name");
    expect(v).toBe("Wavio");
    expect(q.mock.calls[0][1]).toEqual(["platform_name"]);
  });

  it("getPlatformSetting: value JSON di-parse sesuai tipe key", async () => {
    q.mockResolvedValueOnce([{ key: "allow_public_registration", value: "true" }]);
    expect(await getPlatformSetting("allow_public_registration")).toBe(true);
    q.mockResolvedValueOnce([{ key: "message_retention_default_days", value: "45" }]);
    expect(await getPlatformSetting("message_retention_default_days")).toBe(45);
  });

  it("setPlatformSetting: upsert menyimpan JSON string (value sudah encode)", async () => {
    q.mockResolvedValueOnce([{ key: "platform_name" }]);
    await setPlatformSetting({
      key: "platform_name",
      value: JSON.stringify("Wavio Pro"),
      updatedBy: "u1",
    });
    const sql = q.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO "PlatformSetting"');
    expect(sql).toContain("ON CONFLICT");
    expect(q.mock.calls[0][1]).toEqual(["platform_name", '"Wavio Pro"', "u1"]);
  });

  it("listPlatformSettings: seluruh baris dikembalikan", async () => {
    q.mockResolvedValueOnce([{ key: "platform_name", value: '"X"', updatedBy: null }]);
    const rows = await listPlatformSettings();
    expect(rows).toHaveLength(1);
  });
});
