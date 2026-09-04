import { describe, it, expect } from "vitest";
import {
  ADDON_KEYS,
  CAMPAIGN_ADDON_KEY,
  isGrantableAddonKey,
  KNOWN_ADDON_KEYS,
  RANDOM_DELAY_ADDON_KEY,
  REMOVE_WATERMARK_ADDON_KEY,
} from "./addonKeys";

describe("addonKeys — single source", () => {
  it("konstanta per-key sesuai whitelist", () => {
    expect(RANDOM_DELAY_ADDON_KEY).toBe("random_delay");
    expect(REMOVE_WATERMARK_ADDON_KEY).toBe("remove_watermark");
    expect(CAMPAIGN_ADDON_KEY).toBe("campaign");
  });

  it("ADDON_KEYS = subset KNOWN_ADDON_KEYS, tanpa duplikat", () => {
    expect(ADDON_KEYS).toEqual(["random_delay", "remove_watermark"]);
    expect(new Set(ADDON_KEYS).size).toBe(ADDON_KEYS.length);
    for (const k of ADDON_KEYS) {
      expect(KNOWN_ADDON_KEYS).toContain(k);
    }
    expect(KNOWN_ADDON_KEYS).toContain(CAMPAIGN_ADDON_KEY);
  });

  it("isGrantableAddonKey menerima 2 whitelist, menolak campaign & random", () => {
    expect(isGrantableAddonKey("random_delay")).toBe(true);
    expect(isGrantableAddonKey("remove_watermark")).toBe(true);
    expect(isGrantableAddonKey("campaign")).toBe(false);
    expect(isGrantableAddonKey("hack_key")).toBe(false);
    expect(isGrantableAddonKey("")).toBe(false);
  });
});
