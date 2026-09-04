import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/billing", () => ({
  expireStaleOrders: vi.fn(),
  listPendingGatewayOrders: vi.fn(),
  finalizePaidOrder: vi.fn(),
  markOrderExpiredFromGateway: vi.fn(),
}));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: vi.fn() }));

import { auth } from "@/lib/auth";
import {
  expireStaleOrders,
  listPendingGatewayOrders,
  finalizePaidOrder,
  markOrderExpiredFromGateway,
} from "@/lib/billing";
import { getPaymentProvider } from "@/lib/payments";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedExpire = vi.mocked(expireStaleOrders);
const mockedList = vi.mocked(listPendingGatewayOrders);
const mockedFinalize = vi.mocked(finalizePaidOrder);
const mockedMarkExpired = vi.mocked(markOrderExpiredFromGateway);
const mockedProvider = vi.mocked(getPaymentProvider);

const platformSession = {
  user: { id: "u-p", email: "platform@wavio.test", role: "platform_admin", tenantId: "t-platform" },
};
const ownerSession = {
  user: { id: "u1", email: "owner@x.id", role: "owner", tenantId: "t1" },
};

function pendingOrder(id: string, gatewayRef: string) {
  return {
    id,
    tenantId: "t1",
    userId: "u1",
    kind: "topup",
    status: "pending",
    amount: 40000,
    payMethod: "QRIS2",
    gatewayRef,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedExpire.mockResolvedValue(0);
  mockedList.mockResolvedValue([]);
  mockedFinalize.mockResolvedValue({ ok: true });
  mockedMarkExpired.mockResolvedValue(true);
  mockedProvider.mockReturnValue({
    checkStatus: vi.fn(async () => ({ status: "UNPAID", paidAt: null })),
    createPayment: vi.fn(),
    verifyCallback: vi.fn(),
    listChannels: vi.fn(),
  } as never);
});

describe("POST /api/billing/sync", () => {
  it("tanpa session → 401; non-platform admin → 403", async () => {
    mockedAuth.mockResolvedValue(null as never);
    expect((await POST()).status).toBe(401);
    mockedAuth.mockResolvedValue(ownerSession as never);
    expect((await POST()).status).toBe(403);
  });

  it("platform admin: expire lokal + resync Tripay → paid / expired / masih pending", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedExpire.mockResolvedValueOnce(2);
    mockedList.mockResolvedValueOnce([
      pendingOrder("o1", "REF-A"),
      pendingOrder("o2", "REF-B"),
      pendingOrder("o3", "REF-C"),
    ] as never);
    const checkStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: "PAID", paidAt: "2026-09-04T05:00:00Z" })
      .mockResolvedValueOnce({ status: "EXPIRED", paidAt: null })
      .mockResolvedValueOnce({ status: "UNPAID", paidAt: null });
    mockedProvider.mockReturnValue({
      checkStatus,
      createPayment: vi.fn(),
      verifyCallback: vi.fn(),
      listChannels: vi.fn(),
    } as never);

    const res = await POST();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      expired: number;
      paid: number;
      expiredFromGateway: number;
      stillPending: number;
    };
    expect(data.expired).toBe(2);
    expect(data.paid).toBe(1);
    expect(data.expiredFromGateway).toBe(1);
    expect(data.stillPending).toBe(1);
    expect(mockedFinalize).toHaveBeenCalledWith(
      "o1",
      expect.objectContaining({ gatewayRef: "REF-A", payMethod: "QRIS2", paidAt: "2026-09-04T05:00:00Z" }),
    );
    expect(mockedMarkExpired).toHaveBeenCalledWith("o2");
    // o3 (UNPAID) tidak disentuh
    expect(mockedFinalize).toHaveBeenCalledTimes(1);
    expect(mockedMarkExpired).toHaveBeenCalledTimes(1);
  });

  it("checkStatus gagal → order masuk stillPending tanpa finalisasi", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedList.mockResolvedValueOnce([pendingOrder("o1", "REF-X")] as never);
    mockedProvider.mockReturnValue({
      checkStatus: vi.fn(async () => {
        throw new Error("timeout");
      }),
      createPayment: vi.fn(),
      verifyCallback: vi.fn(),
      listChannels: vi.fn(),
    } as never);
    const res = await POST();
    const data = (await res.json()) as { stillPending: number };
    expect(data.stillPending).toBe(1);
    expect(mockedFinalize).not.toHaveBeenCalled();
  });
});
