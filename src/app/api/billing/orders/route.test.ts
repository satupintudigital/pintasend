import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/tenantGate", () => ({ getTenantActivation: vi.fn() }));
vi.mock("@/lib/catalog", () => ({ getPublicCatalog: vi.fn() }));
vi.mock("@/lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing")>();
  return { ...actual, createOrder: vi.fn() };
});

import { auth } from "@/lib/auth";
import { getTenantActivation } from "@/lib/tenantGate";
import { getPublicCatalog } from "@/lib/catalog";
import { createOrder } from "@/lib/billing";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedActivation = vi.mocked(getTenantActivation);
const mockedCatalog = vi.mocked(getPublicCatalog);
const mockedCreateOrder = vi.mocked(createOrder);

const catalog = {
  plans: [
    { id: "plan-latte", name: "Latte", tagline: "Paling laris", kind: "subscription", priceMonthly: 150000, pricePerMessage: null, maxMessagesPerMonth: 500, features: [] },
    { id: "plan-mocha", name: "Mocha", tagline: "Unlimited", kind: "subscription", priceMonthly: 300000, pricePerMessage: null, maxMessagesPerMonth: null, features: [] },
    { id: "plan-espresso", name: "Espresso", tagline: "Bayar sesuai pakai", kind: "prepaid", priceMonthly: null, pricePerMessage: 400, maxMessagesPerMonth: null, features: [] },
  ],
  addons: [
    { key: "random_delay", name: "Random delay", tagline: "", priceMonthly: 25000 },
    { key: "remove_watermark", name: "Remove watermark", tagline: "", priceMonthly: null },
  ],
  settings: { activationFeeRp: 350000, creditPerMessageRp: 400, creditMinTopupRp: 20000, orderExpiryMinutes: 1440 },
};

const ownerSession = {
  user: { id: "u1", email: "owner@x.id", role: "owner", tenantId: "t1" },
};
const adminSession = {
  user: { id: "u2", email: "admin@x.id", role: "tenant_admin", tenantId: "t1" },
};
const memberSession = {
  user: { id: "u3", email: "member@x.id", role: "member", tenantId: "t1" },
};

const pendingActivation = { activatedAt: null, suspendedAt: null, planId: null, pending: true };
const activeActivation = {
  activatedAt: "2026-08-01T00:00:00Z",
  suspendedAt: null,
  planId: "plan-latte",
  pending: false,
};
const suspendedActivation = {
  activatedAt: "2026-08-01T00:00:00Z",
  suspendedAt: "2026-09-01T00:00:00Z",
  planId: "plan-latte",
  pending: false,
};

function orderResolved() {
  return {
    id: "ord-1",
    tenantId: "t1",
    userId: "u1",
    kind: "first_subscription",
    status: "pending",
    invoiceId: null,
    planId: "plan-latte",
    addonKey: null,
    amount: 525000,
    itemsJson: JSON.stringify([
      { type: "plan", refId: "plan-latte", name: "Latte", quantity: 1, unitPrice: 150000 },
      { type: "addon", refId: "random_delay", name: "Random delay", quantity: 1, unitPrice: 25000 },
    ]),
    periodStart: null,
    periodEnd: null,
    creditMessages: null,
    gateway: "tripay",
    gatewayRef: "REF-1",
    payCode: "7112345678",
    checkoutUrl: "https://tripay.test/checkout/REF-1",
    payMethod: "BRIVA0",
    expiresAt: "2026-09-05T00:00:00Z",
    paidAt: null,
    createdAt: "2026-09-04T00:00:00Z",
    updatedAt: "2026-09-04T00:00:00Z",
  };
}

function jsonReq(body: unknown): Request {
  return new Request("http://wavio.test/api/billing/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedCatalog.mockResolvedValue(catalog as never);
  mockedActivation.mockResolvedValue(pendingActivation as never);
  mockedCreateOrder.mockResolvedValue(orderResolved() as never);
});

describe("POST /api/billing/orders — guard session", () => {
  it("tanpa session → 401", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await POST(jsonReq({ kind: "addon", addonKey: "random_delay", payMethod: "QRIS2" }));
    expect(res.status).toBe(401);
    expect(mockedCreateOrder).not.toHaveBeenCalled();
  });

  it("role member → 403", async () => {
    mockedAuth.mockResolvedValue(memberSession as never);
    const res = await POST(jsonReq({ kind: "addon", addonKey: "random_delay", payMethod: "QRIS2" }));
    expect(res.status).toBe(403);
    expect(mockedCreateOrder).not.toHaveBeenCalled();
  });

  it("body bukan JSON / kind tidak dikenal → 400", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    const res = await POST(jsonReq({ kind: "hack", payMethod: "QRIS2" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/billing/orders — first_subscription", () => {
  it("tenant pending + plan subscription valid → createOrder & 201 dengan redirectUrl", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    const res = await POST(
      jsonReq({
        kind: "first_subscription",
        planId: "plan-latte",
        addonKeys: ["random_delay"],
        payMethod: "BRIVA0",
      }),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { order: { status: string }; redirectUrl: string };
    expect(data.order.status).toBe("pending");
    expect(data.redirectUrl).toBe("https://tripay.test/checkout/REF-1");
    expect(mockedCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        userId: "u1",
        kind: "first_subscription",
        planId: "plan-latte",
        payMethod: "BRIVA0",
        items: [
          { type: "addon", refId: "random_delay", name: "Random delay", quantity: 1, unitPrice: 25000 },
        ],
      }),
    );
  });

  it("tanpa planId → 400", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    const res = await POST(jsonReq({ kind: "first_subscription", payMethod: "BRIVA0" }));
    expect(res.status).toBe(400);
    expect(mockedCreateOrder).not.toHaveBeenCalled();
  });

  it("plan prepaid (Espresso) tidak valid utk first_subscription → 400", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    const res = await POST(jsonReq({ kind: "first_subscription", planId: "plan-espresso", payMethod: "QRIS2" }));
    expect(res.status).toBe(400);
  });

  it("addonKeys memuat addon non-berbayar → 400", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    const res = await POST(
      jsonReq({ kind: "first_subscription", planId: "plan-latte", addonKeys: ["remove_watermark"], payMethod: "QRIS2" }),
    );
    expect(res.status).toBe(400);
    expect(mockedCreateOrder).not.toHaveBeenCalled();
  });

  it("tenant sudah aktif → 400 (pakai menu Langganan)", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedActivation.mockResolvedValue(activeActivation as never);
    const res = await POST(jsonReq({ kind: "first_subscription", planId: "plan-latte", payMethod: "QRIS2" }));
    expect(res.status).toBe(400);
    expect(mockedCreateOrder).not.toHaveBeenCalled();
  });

  it("tenant suspended → 403 TENANT_SUSPENDED", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedActivation.mockResolvedValue(suspendedActivation as never);
    const res = await POST(jsonReq({ kind: "first_subscription", planId: "plan-latte", payMethod: "QRIS2" }));
    expect(res.status).toBe(403);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe("TENANT_SUSPENDED");
  });
});

describe("POST /api/billing/orders — renewal_subscription", () => {
  it("plan sesuai planId tenant → createOrder (tombol Bayar Sekarang)", async () => {
    mockedAuth.mockResolvedValue(adminSession as never);
    mockedActivation.mockResolvedValue(activeActivation as never);
    const res = await POST(jsonReq({ kind: "renewal_subscription", planId: "plan-latte", payMethod: "BRIVA0" }));
    expect(res.status).toBe(201);
    expect(mockedCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "renewal_subscription", planId: "plan-latte", userId: "u2" }),
    );
  });

  it("plan berbeda dari plan tenant → 400", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedActivation.mockResolvedValue(activeActivation as never);
    const res = await POST(jsonReq({ kind: "renewal_subscription", planId: "plan-mocha", payMethod: "QRIS2" }));
    expect(res.status).toBe(400);
    expect(mockedCreateOrder).not.toHaveBeenCalled();
  });

  it("tenant pending → 403 TENANT_PENDING", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    const res = await POST(jsonReq({ kind: "renewal_subscription", planId: "plan-latte", payMethod: "QRIS2" }));
    expect(res.status).toBe(403);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe("TENANT_PENDING");
  });
});

describe("POST /api/billing/orders — addon", () => {
  it("tenant aktif + addon berbayar → createOrder", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedActivation.mockResolvedValue(activeActivation as never);
    const res = await POST(jsonReq({ kind: "addon", addonKey: "random_delay", payMethod: "DANA" }));
    expect(res.status).toBe(201);
    expect(mockedCreateOrder).toHaveBeenCalledWith(expect.objectContaining({ kind: "addon", addonKey: "random_delay" }));
  });

  it("addon non-berbayar → 400", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedActivation.mockResolvedValue(activeActivation as never);
    const res = await POST(jsonReq({ kind: "addon", addonKey: "remove_watermark", payMethod: "DANA" }));
    expect(res.status).toBe(400);
  });

  it("tanpa addonKey → 400", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedActivation.mockResolvedValue(activeActivation as never);
    const res = await POST(jsonReq({ kind: "addon", payMethod: "DANA" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/billing/orders — topup", () => {
  it("tenant aktif, jumlah valid → createOrder tanpa planId", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedActivation.mockResolvedValue(activeActivation as never);
    const res = await POST(jsonReq({ kind: "topup", creditMessages: 100, payMethod: "QRIS2" }));
    expect(res.status).toBe(201);
    expect(mockedCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "topup", creditMessages: 100, planId: undefined }),
    );
  });

  it("di bawah minimal top-up → 400", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedActivation.mockResolvedValue(activeActivation as never);
    const res = await POST(jsonReq({ kind: "topup", creditMessages: 10, payMethod: "QRIS2" }));
    expect(res.status).toBe(400);
    expect(mockedCreateOrder).not.toHaveBeenCalled();
  });

  it("tenant pending tanpa planId → 400 minta pilih Espresso", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    const res = await POST(jsonReq({ kind: "topup", creditMessages: 100, payMethod: "QRIS2" }));
    expect(res.status).toBe(400);
    expect(mockedCreateOrder).not.toHaveBeenCalled();
  });

  it("tenant pending + planId prepaid → createOrder dgn planId (aktivasi Espresso)", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    const res = await POST(jsonReq({ kind: "topup", planId: "plan-espresso", creditMessages: 100, payMethod: "QRIS2" }));
    expect(res.status).toBe(201);
    expect(mockedCreateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "topup", planId: "plan-espresso", creditMessages: 100 }),
    );
  });

  it("tenant pending + planId subscription → 400", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    const res = await POST(jsonReq({ kind: "topup", planId: "plan-latte", creditMessages: 100, payMethod: "QRIS2" }));
    expect(res.status).toBe(400);
  });

  it("creditMessages bukan integer positif → 400", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedActivation.mockResolvedValue(activeActivation as never);
    const res = await POST(jsonReq({ kind: "topup", creditMessages: -5, payMethod: "QRIS2" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/billing/orders — error mapping", () => {
  it("createOrder throws PLAN_INVALID → 400", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedActivation.mockResolvedValue(activeActivation as never);
    mockedCreateOrder.mockRejectedValueOnce(new Error("PLAN_INVALID"));
    const res = await POST(jsonReq({ kind: "addon", addonKey: "random_delay", payMethod: "QRIS2" }));
    expect(res.status).toBe(400);
  });

  it("createOrder throws tidak dikenal → 500", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedActivation.mockResolvedValue(activeActivation as never);
    mockedCreateOrder.mockRejectedValueOnce(new Error("ups"));
    const res = await POST(jsonReq({ kind: "addon", addonKey: "random_delay", payMethod: "QRIS2" }));
    expect(res.status).toBe(500);
  });
});
