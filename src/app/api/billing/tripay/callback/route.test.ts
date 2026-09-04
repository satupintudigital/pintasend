import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/payments", () => ({ getPaymentProvider: vi.fn() }));
vi.mock("@/lib/billing", () => ({
  finalizePaidOrder: vi.fn(),
  getOrderAnyScope: vi.fn(),
  markOrderExpiredFromGateway: vi.fn(),
}));

import { getPaymentProvider } from "@/lib/payments";
import { finalizePaidOrder, getOrderAnyScope, markOrderExpiredFromGateway } from "@/lib/billing";
import { POST } from "./route";

const mockedProvider = vi.mocked(getPaymentProvider);
const mockedFinalize = vi.mocked(finalizePaidOrder);
const mockedGetOrder = vi.mocked(getOrderAnyScope);
const mockedMarkExpired = vi.mocked(markOrderExpiredFromGateway);

function stubProvider(verifyCallback: ReturnType<typeof vi.fn>) {
  mockedProvider.mockReturnValue({
    verifyCallback,
    createPayment: vi.fn(),
    checkStatus: vi.fn(),
    listChannels: vi.fn(),
  } as never);
}

function callbackReq(body: unknown, signature: string | null = "abc"): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature !== null) headers["X-Callback-Signature"] = signature;
  return new Request("http://x/api/billing/tripay/callback", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function orderRow(id: string) {
  return {
    id,
    tenantId: "t1",
    userId: "u1",
    kind: "topup",
    status: "pending",
    amount: 40000,
    gatewayRef: "REF-GW-1",
    payMethod: "QRIS2",
    payCode: null,
    checkoutUrl: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedFinalize.mockResolvedValue({ ok: true });
  mockedMarkExpired.mockResolvedValue(true);
});

describe("POST /api/billing/tripay/callback", () => {
  it("signature tidak sah → 401, finalize tidak dipanggil", async () => {
    stubProvider(vi.fn(async () => null));
    const res = await POST(callbackReq({ event: "payment_status", data: { merchant_ref: "ord-1", status: "PAID" } }));
    expect(res.status).toBe(401);
    expect(mockedGetOrder).not.toHaveBeenCalled();
    expect(mockedFinalize).not.toHaveBeenCalled();
  });

  it("PAID & order ditemukan → finalizePaidOrder dgn order + callbackRaw tersimpan", async () => {
    stubProvider(vi.fn(async () => ({ merchantRef: "ord-1", status: "PAID" })));
    mockedGetOrder.mockResolvedValueOnce(orderRow("ord-1") as never);
    const bodyText = JSON.stringify({ event: "payment_status", data: { merchant_ref: "ord-1", status: "PAID" } });

    const res = await POST(callbackReq(JSON.parse(bodyText)));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
    expect(mockedGetOrder).toHaveBeenCalledWith("ord-1");
    expect(mockedFinalize).toHaveBeenCalledWith(
      "ord-1",
      expect.objectContaining({ gatewayRef: "REF-GW-1", payMethod: "QRIS2", callbackRaw: bodyText }),
    );
    expect(mockedMarkExpired).not.toHaveBeenCalled();
  });

  it("PAID tapi order tidak dikenal → 200 tanpa finalize (hindari info leak & retry)", async () => {
    stubProvider(vi.fn(async () => ({ merchantRef: "ord-999", status: "PAID" })));
    mockedGetOrder.mockResolvedValueOnce(null as never);
    const res = await POST(callbackReq({ merchant_ref: "ord-999", status: "PAID" }));
    expect(res.status).toBe(200);
    expect(mockedFinalize).not.toHaveBeenCalled();
  });

  it("EXPIRED → markOrderExpiredFromGateway", async () => {
    stubProvider(vi.fn(async () => ({ merchantRef: "ord-2", status: "EXPIRED" })));
    mockedGetOrder.mockResolvedValueOnce(orderRow("ord-2") as never);
    const res = await POST(callbackReq({ merchant_ref: "ord-2", status: "EXPIRED" }));
    expect(res.status).toBe(200);
    expect(mockedMarkExpired).toHaveBeenCalledWith("ord-2");
    expect(mockedFinalize).not.toHaveBeenCalled();
  });

  it("UNPAID / FAILED → 200 tanpa aksi", async () => {
    stubProvider(vi.fn(async () => ({ merchantRef: "ord-3", status: "UNPAID" })));
    mockedGetOrder.mockResolvedValueOnce(orderRow("ord-3") as never);
    const res = await POST(callbackReq({ merchant_ref: "ord-3", status: "UNPAID" }));
    expect(res.status).toBe(200);
    expect(mockedFinalize).not.toHaveBeenCalled();
    expect(mockedMarkExpired).not.toHaveBeenCalled();
  });

  it("panggilan ganda PAID → keduanya 200 (idempotensi di finalizePaidOrder)", async () => {
    stubProvider(vi.fn(async () => ({ merchantRef: "ord-4", status: "PAID" })));
    mockedGetOrder.mockResolvedValue(orderRow("ord-4") as never);
    const body = { merchant_ref: "ord-4", status: "PAID" };

    const r1 = await POST(callbackReq(body));
    const r2 = await POST(callbackReq(body));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(mockedFinalize).toHaveBeenCalledTimes(2);
  });
});
