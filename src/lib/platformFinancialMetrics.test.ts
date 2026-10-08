import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPlatformMetrics } from "./platform";
import { query } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
}));

const q = query as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("getPlatformMetrics financial metrics", () => {
  it("mengembalikan objek financial dengan mrr, totalRevenueMtd, totalOrdersPaid, prepaidVolume", async () => {
    q.mockResolvedValueOnce([{ day: "2026-10-01", count: 10 }]); // messagesPerDay
    q.mockResolvedValueOnce([{ status: "connected", count: 5 }]); // deviceStatus
    q.mockResolvedValueOnce([{ id: "t1", name: "Tenant 1", messages: 100 }]); // topTenants
    q.mockResolvedValueOnce([
      { mrr: 1500000, totalRevenueMtd: 4500000, totalOrdersPaid: 3, prepaidVolume: 5000 },
    ]); // financial

    const metrics = await getPlatformMetrics();

    expect(metrics.financial).toEqual({
      mrr: 1500000,
      totalRevenueMtd: 4500000,
      totalOrdersPaid: 3,
      prepaidVolume: 5000,
    });
    expect(q).toHaveBeenCalledTimes(4);
    // Verifikasi query financial mencakup mrr, totalRevenueMtd, totalOrdersPaid, prepaidVolume
    const financialCall = q.mock.calls[3][0] as string;
    expect(financialCall).toContain('AS mrr');
    expect(financialCall).toContain('AS "totalRevenueMtd"');
    expect(financialCall).toContain('AS "totalOrdersPaid"');
    expect(financialCall).toContain('AS "prepaidVolume"');
  });

  it("menangani hasil query financial kosong dengan nilai default 0", async () => {
    q.mockResolvedValueOnce([]); // messagesPerDay
    q.mockResolvedValueOnce([]); // deviceStatus
    q.mockResolvedValueOnce([]); // topTenants
    q.mockResolvedValueOnce([]); // financial empty

    const metrics = await getPlatformMetrics();

    expect(metrics.financial).toEqual({
      mrr: 0,
      totalRevenueMtd: 0,
      totalOrdersPaid: 0,
      prepaidVolume: 0,
    });
  });
});
