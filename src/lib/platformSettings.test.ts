import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PLATFORM_SETTING_KEYS,
  platformSettingType,
  getPlatformSetting,
  setPlatformSetting,
  listPlatformSettings,
} from "./platformSettings";
import { query } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));

const q = query as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("platformSettings", () => {
  it("whitelist memuat 4 key dengan tipe benar", () => {
    expect(platformSettingType("platform_name")).toBe("string");
    expect(platformSettingType("watermark_footnote")).toBe("string");
    expect(platformSettingType("allow_public_registration")).toBe("boolean");
    expect(platformSettingType("message_retention_default_days")).toBe("number");
    expect(platformSettingType("unknown_key")).toBeNull();
    expect(Object.keys(PLATFORM_SETTING_KEYS)).toHaveLength(4);
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
