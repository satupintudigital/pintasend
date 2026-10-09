import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTenantDashboardOverview } from "./dashboard";
import { query, queryOne } from "@/lib/db";
import { getTenantQuota } from "@/lib/quota";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock("@/lib/quota", () => ({
  getTenantQuota: vi.fn(),
  monthStartWib: vi.fn().mockReturnValue("2026-10-01T00:00:00+07:00"),
}));

const mockedQuery = vi.mocked(query);
const mockedQueryOne = vi.mocked(queryOne);
const mockedQuota = vi.mocked(getTenantQuota);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTenantDashboardOverview", () => {
  it("aggregates metrics, 7-day trend, recent messages, and device list", async () => {
    mockedQuota.mockResolvedValue({
      maxDevices: 5,
      maxUsers: 10,
      maxMessagesPerMonth: 5000,
    });

    mockedQueryOne
      .mockResolvedValueOnce({ ready: 2, total: 3 }) // devicesSummary
      .mockResolvedValueOnce({ count: 42 }) // todayCount
      .mockResolvedValueOnce({ count: 35 }) // yesterdayCount
      .mockResolvedValueOnce({ count: 320 }) // monthCount
      .mockResolvedValueOnce({ count: 150 }) // contactsCount
      .mockResolvedValueOnce({ count: 4 }) // botRulesCount
      .mockResolvedValueOnce({ count: 1 }) // campaignsCount
      .mockResolvedValueOnce({ balance: 2500, planName: "Latte" }); // balanceAndPlan

    mockedQuery
      .mockResolvedValueOnce([
        {
          id: "m1",
          direction: "outgoing",
          chatId: "628123456789@c.us",
          body: "Halo selamat siang",
          status: "sent",
          triggeredAt: "2026-10-09T10:00:00.000Z",
          deviceLabel: "Kasir",
        },
      ])
      .mockResolvedValueOnce([
        {
          dateStr: "2026-10-09",
          direction: "outgoing",
          count: 20,
        },
        {
          dateStr: "2026-10-09",
          direction: "incoming",
          count: 5,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "d1",
          label: "Kasir",
          phone: "628123456789",
          status: "ready",
          updatedAt: "2026-10-09T10:00:00.000Z",
        },
      ]);

    const result = await getTenantDashboardOverview("t1");

    expect(result.metrics).toEqual({
      readyDevices: 2,
      totalDevices: 3,
      todayMessages: 42,
      yesterdayMessages: 35,
      monthMessages: 320,
      maxMessagesPerMonth: 5000,
      maxDevices: 5,
      totalContacts: 150,
      activeBotRules: 4,
      runningCampaigns: 1,
      balance: 2500,
      planName: "Latte",
    });

    expect(result.trend7Days).toHaveLength(7);
    expect(result.recentMessages).toHaveLength(1);
    expect(result.recentMessages[0].chatId).toBe("628123456789@c.us");
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0].label).toBe("Kasir");
  });
});
