import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAllPlatformDevices } from "./platform";
import { query } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
}));

describe("listAllPlatformDevices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mengambil daftar device dengan query dan filter status", async () => {
    vi.mocked(query)
      .mockResolvedValueOnce([{ count: 1 }]) // count query
      .mockResolvedValueOnce([
        {
          id: "dev-1",
          label: "HP Kasir",
          tenantId: "t-1",
          tenantName: "Toko Sembako",
          status: "ready",
          phoneNumber: "62812345678",
          openwaSessionId: "owa-1",
          messagesIn: 5,
          messagesOut: 20,
          messagesTotal: 25,
          updatedAt: "2026-10-08T00:00:00Z",
          createdAt: "2026-10-01T00:00:00Z",
        },
      ]); // rows query
    const res = await listAllPlatformDevices({ q: "Kasir", status: "ready", page: 1, limit: 10 });

    expect(res.total).toBe(1);
    expect(res.devices).toHaveLength(1);
    expect(res.devices[0].label).toBe("HP Kasir");
    expect(res.devices[0].tenantName).toBe("Toko Sembako");
    expect(res.devices[0].messagesIn).toBe(5);
    expect(res.devices[0].messagesOut).toBe(20);
    expect(res.devices[0].messagesTotal).toBe(25);
    expect(query).toHaveBeenCalledTimes(2);

    const [countCall, rowsCall] = vi.mocked(query).mock.calls;
    const countSql = countCall[0] as string;
    const rowsSql = rowsCall[0] as string;

    // Pastikan SQL memakai d.phone dan bukan d."phoneNumber"
    expect(countSql).toContain("d.phone");
    expect(countSql).not.toContain('d."phoneNumber"');
    expect(rowsSql).toContain('d.phone AS "phoneNumber"');
    expect(rowsSql).not.toContain('d."phoneNumber"');
    expect(rowsSql).toContain('m.direction = \'incoming\'');
    expect(rowsSql).toContain('m.direction = \'outgoing\'');
  });
});
