import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPublicCatalog } from "./catalog";
import { query } from "@/lib/db";
import { getPlatformSetting } from "@/lib/platformSettings";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));

vi.mock("@/lib/platformSettings", () => ({
  getPlatformSetting: vi.fn(async () => null),
}));

const q = query as unknown as ReturnType<typeof vi.fn>;
const gps = getPlatformSetting as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("getPublicCatalog", () => {
  it("hanya plan publik & addon aktif; prepaid diberi harga per pesan dari setting", async () => {
    // SELECT plans
    q.mockResolvedValueOnce([
      { id: "p1", name: "Espresso", tagline: "Per pesan", kind: "prepaid", priceMonthly: null, maxMessagesPerMonth: null },
      { id: "p2", name: "Latte", tagline: "Bulanan", kind: "subscription", priceMonthly: 150000, maxMessagesPerMonth: 500 },
    ]);
    // SELECT addons
    q.mockResolvedValueOnce([
      { key: "random_delay", name: "Random delay", tagline: "Jeda acak", priceMonthly: 25000 },
    ]);
    // settings — urutan pemanggilan getPlatformSetting
    gps.mockImplementation(async (k: string) => {
      const map: Record<string, number | null> = {
        activation_fee_rp: 350000,
        credit_price_per_message: 400,
        credit_min_topup_rp: 20000,
        order_expiry_minutes: 1440,
      };
      return map[k] ?? null;
    });

    const catalog = await getPublicCatalog();
    expect(catalog.plans).toHaveLength(2);
    const espresso = catalog.plans.find((p) => p.name === "Espresso");
    expect(espresso?.kind).toBe("prepaid");
    expect(espresso?.pricePerMessage).toBe(400);
    expect(espresso?.priceMonthly).toBeNull();
    const latte = catalog.plans.find((p) => p.name === "Latte");
    expect(latte?.pricePerMessage).toBeNull();
    expect(latte?.priceMonthly).toBe(150000);
    expect(latte?.features.length).toBeGreaterThan(0);
    expect(catalog.addons).toHaveLength(1);
    expect(catalog.addons[0].key).toBe("random_delay");
    expect(catalog.settings.activationFeeRp).toBe(350000);
    expect(catalog.settings.creditPerMessageRp).toBe(400);
    expect(catalog.settings.creditMinTopupRp).toBe(20000);
    expect(catalog.settings.orderExpiryMinutes).toBe(1440);
    // SQL urutan sort: ORDER BY sortOrder ASC, name ASC dan addon ORDER BY name ASC
    const planSql = q.mock.calls[0][0] as string;
    expect(planSql).toContain('"isPublic" = true');
    expect(planSql).toContain('"sortOrder" ASC');
    const addonSql = q.mock.calls[1][0] as string;
    expect(addonSql).toContain('"isActive" = true');
  });

  it("fallback default harga saat setting kosong", async () => {
    q.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    gps.mockResolvedValue(null);
    const catalog = await getPublicCatalog();
    expect(catalog.settings.activationFeeRp).toBe(350000);
    expect(catalog.settings.creditPerMessageRp).toBe(400);
    expect(catalog.settings.creditMinTopupRp).toBe(20000);
    expect(catalog.settings.orderExpiryMinutes).toBe(1440);
    expect(catalog.plans).toHaveLength(0);
  });
});