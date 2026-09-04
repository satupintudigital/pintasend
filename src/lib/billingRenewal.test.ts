import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensureCurrentPeriod, nextMonthPeriod, type RenewalTarget } from "./billingRenewal";
import { query, queryOne } from "@/lib/db";
import { getPlatformSetting } from "@/lib/platformSettings";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));
vi.mock("@/lib/platformSettings", () => ({
  getPlatformSetting: vi.fn(async () => null),
}));

const q = query as unknown as ReturnType<typeof vi.fn>;
const q1 = queryOne as unknown as ReturnType<typeof vi.fn>;
const gps = getPlatformSetting as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  q.mockReset();
  q1.mockReset();
  q.mockImplementation(async () => []);
  q1.mockImplementation(async () => undefined);
  gps.mockImplementation(async () => null);
});

const now = new Date("2026-09-04T10:00:00.000Z");

function target(extra: Partial<RenewalTarget> = {}): RenewalTarget {
  return {
    id: "tenant-1",
    planId: "plan-latte",
    planName: "Latte",
    priceMonthly: 150000,
    kind: "subscription",
    activatedAt: "2026-01-01T00:00:00.000Z",
    suspendedAt: null,
    planPeriodEnd: "2026-08-31T17:00:00.000Z", // 2026-09-01 00:00 WIB — sudah lewat
    ...extra,
  };
}

describe("nextMonthPeriod (pure)", () => {
  it("bulan berikutnya setelah periode berjalan (WIB shift)", () => {
    const p = nextMonthPeriod("2026-09-01T00:00:00+07:00");
    // 2026-10-01 00:00 WIB = 2026-09-30 17:00 UTC
    expect(p.periodStart.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    // 2026-11-01 00:00 WIB = 2026-10-31 17:00 UTC
    expect(p.periodEnd.toISOString()).toBe("2026-10-31T17:00:00.000Z");
  });

  it("wrap Desember → Januari tahun berikutnya", () => {
    const p = nextMonthPeriod("2026-12-01T00:00:00+07:00");
    // 2027-01-01 00:00 WIB = 2026-12-31 17:00 UTC
    expect(p.periodStart.toISOString()).toBe("2026-12-31T17:00:00.000Z");
    // 2027-02-01 00:00 WIB = 2027-01-31 17:00 UTC
    expect(p.periodEnd.toISOString()).toBe("2027-01-31T17:00:00.000Z");
  });

  it("null → bulan berjalan WIB", () => {
    const p = nextMonthPeriod(null, now);
    // 2026-09-01 00:00 WIB = 2026-08-31 17:00 UTC
    expect(p.periodStart.toISOString()).toBe("2026-08-31T17:00:00.000Z");
  });
});

describe("ensureCurrentPeriod", () => {
  it("subscription periode habis → insert Invoice + Order renewal (skipGateway) sekali", async () => {
    q1.mockResolvedValueOnce(target()); // SELECT tenant join plan
    q1.mockResolvedValueOnce(undefined); // cek Invoice existing → tidak ada
    q.mockResolvedValueOnce([]); // INSERT Invoice
    q.mockResolvedValueOnce([]); // INSERT Order
    // settings: order_expiry_minutes → null → default 1440

    const res = await ensureCurrentPeriod("tenant-1", now);
    expect(res).toEqual({ invoiceCreated: true, orderCreated: true });

    const invoiceSql = q.mock.calls[0][0] as string;
    expect(invoiceSql).toContain('INSERT INTO "Invoice"');
    expect(invoiceSql).toContain('"periodStart"');
    const orderSql = q.mock.calls[1][0] as string;
    expect(orderSql).toContain('INSERT INTO "Order"');
    expect(orderSql).toContain("renewal_subscription");
    expect(orderSql).toContain("'pending'");
    // Order dibuat TANPA memanggil provider — gatewayRef null, expiresAt diset
    expect(q.mock.calls[1][1]).toContain("tenant-1");
  });

  it("periode belum habis → skip", async () => {
    q1.mockResolvedValueOnce(target({ planPeriodEnd: "2026-09-30T17:00:00.000Z" }));
    const res = await ensureCurrentPeriod("tenant-1", now);
    expect(res).toEqual({ invoiceCreated: false, orderCreated: false });
    expect(q).not.toHaveBeenCalled();
  });

  it("tenant prepaid / pending / suspended → skip", async () => {
    q1.mockResolvedValueOnce(target({ kind: "prepaid" }));
    expect((await ensureCurrentPeriod("tenant-1", now)).orderCreated).toBe(false);

    q1.mockResolvedValueOnce(target({ activatedAt: null }));
    expect((await ensureCurrentPeriod("tenant-1", now)).orderCreated).toBe(false);

    q1.mockResolvedValueOnce(target({ suspendedAt: "2026-08-01T00:00:00.000Z" }));
    expect((await ensureCurrentPeriod("tenant-1", now)).orderCreated).toBe(false);
  });

  it("Invoice utk periode tsb sudah ada → skip (tidak dobel)", async () => {
    q1.mockResolvedValueOnce(target());
    q1.mockResolvedValueOnce({ id: "inv-existing" }); // sudah ada invoice
    const res = await ensureCurrentPeriod("tenant-1", now);
    expect(res).toEqual({ invoiceCreated: false, orderCreated: false });
    expect(q).not.toHaveBeenCalled();
  });

  it("tenant tidak ditemukan / plan inactive → skip", async () => {
    q1.mockResolvedValueOnce(target({ priceMonthly: null })); // plan non-aktif/harga null
    expect((await ensureCurrentPeriod("tenant-1", now)).orderCreated).toBe(false);
  });
});