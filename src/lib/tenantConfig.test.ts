import { describe, expect, it } from "vitest";
import { tenantAddonActiveWhere } from "./tenantConfig";

describe("tenantAddonActiveWhere", () => {
  it("tanpa alias → kondisi aktif & belum kedaluwarsa", () => {
    expect(tenantAddonActiveWhere()).toBe(
      'active = true AND ("activeUntil" IS NULL OR "activeUntil" > now())',
    );
  });

  it("dengan alias → prefix kolom alias", () => {
    expect(tenantAddonActiveWhere("a")).toBe(
      'a.active = true AND (a."activeUntil" IS NULL OR a."activeUntil" > now())',
    );
  });
});
