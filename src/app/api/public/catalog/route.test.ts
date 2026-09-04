import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/catalog", () => ({ getPublicCatalog: vi.fn() }));

import { getPublicCatalog } from "@/lib/catalog";
import { GET } from "./route";

const mockedCatalog = vi.mocked(getPublicCatalog);

const catalog = {
  plans: [
    { id: "plan-latte", name: "Latte", tagline: "", kind: "subscription", priceMonthly: 150000, pricePerMessage: null, maxMessagesPerMonth: 500, features: [] },
  ],
  addons: [{ key: "random_delay", name: "Random delay", tagline: "", priceMonthly: 25000 }],
  settings: { activationFeeRp: 350000, creditPerMessageRp: 400, creditMinTopupRp: 20000, orderExpiryMinutes: 1440 },
};

beforeEach(() => vi.clearAllMocks());

describe("GET /api/public/catalog", () => {
  it("200 tanpa auth, menyertakan katalog + Cache-Control", async () => {
    mockedCatalog.mockResolvedValue(catalog as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=60");
    const data = (await res.json()) as { catalog: typeof catalog };
    expect(data.catalog.plans).toHaveLength(1);
    expect(data.catalog.settings.creditPerMessageRp).toBe(400);
  });

  it("500 saat katalog gagal dimuat", async () => {
    mockedCatalog.mockRejectedValueOnce(new Error("db down"));
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
