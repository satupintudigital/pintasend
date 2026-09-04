import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/billing", () => ({ getOrder: vi.fn(), expireStaleOrders: vi.fn() }));

import { auth } from "@/lib/auth";
import { getOrder, expireStaleOrders } from "@/lib/billing";
import { GET } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedGetOrder = vi.mocked(getOrder);
const mockedExpire = vi.mocked(expireStaleOrders);

const ownerSession = {
  user: { id: "u1", email: "owner@x.id", role: "owner", tenantId: "t1" },
};
const memberSession = {
  user: { id: "u3", email: "member@x.id", role: "member", tenantId: "t1" },
};

function orderRow(id: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    tenantId: "t1",
    userId: "u1",
    kind: "first_subscription",
    status: "pending",
    amount: 150000,
    payCode: null,
    checkoutUrl: "https://tripay.test/checkout/X",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(), // +1 jam
    paidAt: null,
    ...over,
  };
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/billing/orders/[id]", () => {
  it("tanpa session → 401", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET(new Request("http://x/api/billing/orders/o1"), params("o1"));
    expect(res.status).toBe(401);
  });

  it("role member → 403", async () => {
    mockedAuth.mockResolvedValue(memberSession as never);
    const res = await GET(new Request("http://x/api/billing/orders/o1"), params("o1"));
    expect(res.status).toBe(403);
  });

  it("order tidak ditemukan → 404", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedGetOrder.mockResolvedValueOnce(null as never);
    const res = await GET(new Request("http://x/api/billing/orders/o1"), params("o1"));
    expect(res.status).toBe(404);
  });

  it("pending belum expire → 200 dgn expiresInSec > 0, tanpa expireStaleOrders", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedGetOrder.mockResolvedValueOnce(orderRow("o1") as never);
    const res = await GET(new Request("http://x/api/billing/orders/o1"), params("o1"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { order: { status: string; expiresInSec: number } };
    expect(data.order.status).toBe("pending");
    expect(data.order.expiresInSec).toBeGreaterThan(0);
    expect(mockedExpire).not.toHaveBeenCalled();
    expect(mockedGetOrder).toHaveBeenCalledTimes(1);
    expect(mockedGetOrder).toHaveBeenCalledWith("t1", "o1");
  });

  it("pending sudah lewat expiresAt → expireStaleOrders dijalankan & status direfresh", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedGetOrder
      .mockResolvedValueOnce(orderRow("o1", { expiresAt: new Date(Date.now() - 1000).toISOString() }) as never)
      .mockResolvedValueOnce(orderRow("o1", { status: "expired", expiresAt: new Date(Date.now() - 1000).toISOString() }) as never);
    mockedExpire.mockResolvedValueOnce(1);
    const res = await GET(new Request("http://x/api/billing/orders/o1"), params("o1"));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { order: { status: string; expiresInSec: number | null } };
    expect(data.order.status).toBe("expired");
    expect(data.order.expiresInSec).toBeNull();
    expect(mockedExpire).toHaveBeenCalledWith(expect.any(Date));
    expect(mockedGetOrder).toHaveBeenCalledTimes(2);
  });

  it("order paid → 200 expiresInSec null", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedGetOrder.mockResolvedValueOnce(orderRow("o1", { status: "paid", paidAt: new Date().toISOString() }) as never);
    const res = await GET(new Request("http://x/api/billing/orders/o1"), params("o1"));
    const data = (await res.json()) as { order: { status: string; expiresInSec: number | null } };
    expect(data.order.status).toBe("paid");
    expect(data.order.expiresInSec).toBeNull();
    expect(mockedExpire).not.toHaveBeenCalled();
  });
});
