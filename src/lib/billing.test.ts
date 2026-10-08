import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createOrder,
  finalizePaidOrder,
  expireStaleOrders,
  markOrderExpiredFromGateway,
  getOrder,
  getOrderAnyScope,
  findPendingOrder,
  listPendingGatewayOrders,
  periodEndForStart,
  type OrderRow,
} from "./billing";
import { query, queryOne } from "@/lib/db";
import { getPublicCatalog } from "@/lib/catalog";
import { getPaymentProvider } from "@/lib/payments";
import { addCredit } from "@/lib/credit";
import { recordAudit } from "@/lib/audit";
import { syncTenantD1 } from "@/lib/tenantStore";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));
vi.mock("@/lib/catalog", () => ({
  getPublicCatalog: vi.fn(async () => ({
    plans: [
      { id: "plan-latte", name: "Latte", tagline: "", kind: "subscription", priceMonthly: 150000, pricePerMessage: null, maxMessagesPerMonth: 500, features: [] },
      { id: "plan-espresso", name: "Espresso", tagline: "", kind: "prepaid", priceMonthly: null, pricePerMessage: 400, maxMessagesPerMonth: null, features: [] },
    ],
    addons: [
      { key: "random_delay", name: "Random delay", tagline: "", priceMonthly: 25000 },
    ],
    settings: {
      activationFeeRp: 350000,
      creditPerMessageRp: 400,
      creditMinTopupRp: 20000,
      orderExpiryMinutes: 1440,
    },
  })),
}));
vi.mock("@/lib/payments", () => ({
  getPaymentProvider: vi.fn(),
}));
vi.mock("@/lib/credit", () => ({
  addCredit: vi.fn(async () => 0),
}));
vi.mock("@/lib/audit", () => ({
  recordAudit: vi.fn(async () => undefined),
}));
vi.mock("@/lib/tenantStore", () => ({
  syncTenantD1: vi.fn(async () => true),
}));

const q = query as unknown as ReturnType<typeof vi.fn>;
const q1 = queryOne as unknown as ReturnType<typeof vi.fn>;
const provider = {
  createPayment: vi.fn(async () => ({
    gatewayRef: "REF-GW-1",
    payCode: "711234567890",
    checkoutUrl: "https://tripay.co.id/checkout/REF-GW-1",
    payMethod: "BRIVA0",
    qrString: null,
  })),
  verifyCallback: vi.fn(),
  checkStatus: vi.fn(),
  listChannels: vi.fn(),
};

const now = new Date("2026-09-04T10:00:00.000Z");

function row(id: string, extra: Partial<OrderRow> = {}): OrderRow {
  return {
    id,
    tenantId: "tenant-1",
    userId: "user-1",
    kind: "first_subscription",
    status: "pending",
    invoiceId: null,
    planId: "plan-latte",
    addonKey: null,
    amount: 500000,
    itemsJson: "[]",
    periodStart: null,
    periodEnd: null,
    creditMessages: null,
    gateway: "tripay",
    gatewayRef: null,
    payCode: null,
    checkoutUrl: null,
    payMethod: "BRIVA0",
    expiresAt: null,
    paidAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // mockReset membersihkan antrean mockResolvedValueOnce antar-test.
  q.mockReset();
  q1.mockReset();
  q.mockImplementation(async () => []);
  q1.mockImplementation(async () => undefined);
  (getPaymentProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue(provider);
});

describe("createOrder", () => {
  it("first_subscription: amount = plan + addon + activationFee; panggil provider & simpan gateway", async () => {
    q1
      .mockResolvedValueOnce({ id: "tenant-1", name: "PT Contoh", activatedAt: null }) // tenant
      .mockResolvedValueOnce(undefined); // findPendingOrder → tidak ada
    q.mockResolvedValueOnce([]); // INSERT order
    q.mockResolvedValueOnce([{ id: "ord-1" }]); // UPDATE gateway fields

    const order = await createOrder({
      tenantId: "tenant-1",
      userId: "user-1",
      kind: "first_subscription",
      planId: "plan-latte",
      items: [
        { type: "plan", refId: "plan-latte", name: "Paket Latte", quantity: 1, unitPrice: 150000 },
        { type: "activation", name: "Biaya aktivasi", quantity: 1, unitPrice: 350000 },
        { type: "addon", refId: "random_delay", name: "Random delay", quantity: 1, unitPrice: 25000 },
      ],
      payMethod: "BRIVA0",
      returnUrl: "https://pintasend.test/checkout",
    });

    expect(order.amount).toBe(525000); // 150000 + 350000 + 25000
    expect(provider.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ merchantRef: order.id, amount: 525000, method: "BRIVA0" }),
    );
    expect(order.gatewayRef).toBe("REF-GW-1");
    expect(order.checkoutUrl).toBe("https://tripay.co.id/checkout/REF-GW-1");
    expect(order.payMethod).toBe("BRIVA0");
    expect(order.status).toBe("pending");
    expect(order.expiresAt).not.toBeNull();
  });

  it("topup: amount = creditMessages × creditPerMessageRp (server-side)", async () => {
    q1
      .mockResolvedValueOnce({ id: "tenant-1", name: "PT Contoh", activatedAt: "2026-01-01" })
      .mockResolvedValueOnce(undefined);
    q.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "ord-2" }]);

    const order = await createOrder({
      tenantId: "tenant-1",
      userId: "user-1",
      kind: "topup",
      creditMessages: 100,
      items: [{ type: "credit", name: "Top-up 100 pesan", quantity: 100, unitPrice: 1 }], // harga client diabaikan
      payMethod: "QRIS2",
      returnUrl: "https://pintasend.test/checkout",
    });

    expect(order.amount).toBe(40000); // 100 × 400
    expect(order.creditMessages).toBe(100);
  });

  it("pending duplikat dgn gateway → kembalikan order lama tanpa membuat Tripay baru", async () => {
    q1
      .mockResolvedValueOnce({ id: "tenant-1", name: "PT Contoh", activatedAt: null })
      .mockResolvedValueOnce(row("ord-lama", { status: "pending", gatewayRef: "REF-OLD" }));

    const order = await createOrder({
      tenantId: "tenant-1",
      userId: "user-1",
      kind: "first_subscription",
      planId: "plan-latte",
      items: [{ type: "plan", refId: "plan-latte", name: "Paket Latte", quantity: 1, unitPrice: 150000 }],
      payMethod: "BRIVA0",
      returnUrl: "https://pintasend.test/checkout",
    });

    expect(order.id).toBe("ord-lama");
    expect(query).not.toHaveBeenCalled(); // tidak ada INSERT/UPDATE
    expect(provider.createPayment).not.toHaveBeenCalled();
  });

  it("existing pending renewal tanpa gateway → attach payment (skipGateway=false, gatewayRef null)", async () => {
    q1
      .mockResolvedValueOnce({ id: "tenant-1", name: "PT Contoh", activatedAt: "2026-01-01" }) // tenant
      .mockResolvedValueOnce(row("ord-renew", { kind: "renewal_subscription", gatewayRef: null, payCode: null, checkoutUrl: null })); // findPendingOrder
    q.mockResolvedValueOnce([{ id: "ord-renew" }]); // UPDATE gateway fields (bukan INSERT)

    const order = await createOrder({
      tenantId: "tenant-1",
      userId: "user-1",
      kind: "renewal_subscription",
      planId: "plan-latte",
      items: [{ type: "plan", refId: "plan-latte", name: "Paket Latte", quantity: 1, unitPrice: 150000 }],
      payMethod: "BRIVA0",
      returnUrl: "https://pintasend.test/checkout",
      skipGateway: false,
    });

    expect(order.id).toBe("ord-renew");
    expect(order.gatewayRef).toBe("REF-GW-1");
    expect(provider.createPayment).toHaveBeenCalled();
    const sql = q.mock.calls[0][0] as string;
    expect(sql).toContain('UPDATE "Order"');
    expect(sql).not.toContain('INSERT INTO "Order"');
  });

  it("skipGateway=true → pending tanpa memanggil provider (gatewayRef null)", async () => {
    q1
      .mockResolvedValueOnce({ id: "tenant-1", name: "PT Contoh", activatedAt: null })
      .mockResolvedValueOnce(undefined);
    q.mockResolvedValueOnce([]);

    const order = await createOrder({
      tenantId: "tenant-1",
      userId: "user-1",
      kind: "renewal_subscription",
      planId: "plan-latte",
      items: [{ type: "plan", refId: "plan-latte", name: "Paket Latte", quantity: 1, unitPrice: 150000 }],
      payMethod: "BRIVA0",
      returnUrl: "https://pintasend.test/checkout",
      skipGateway: true,
    });

    expect(order.gatewayRef).toBeNull();
    expect(provider.createPayment).not.toHaveBeenCalled();
  });

  it("plan tidak subscription → error", async () => {
    q1.mockResolvedValueOnce({ id: "tenant-1", name: "PT Contoh", activatedAt: null });
    await expect(
      createOrder({
        tenantId: "tenant-1",
        userId: "user-1",
        kind: "first_subscription",
        planId: "plan-espresso",
        items: [{ type: "plan", refId: "plan-espresso", name: "Espresso", quantity: 1, unitPrice: 0 }],
        payMethod: "BRIVA0",
        returnUrl: "https://pintasend.test/checkout",
      }),
    ).rejects.toThrow();
  });

  it("topup dgn planId prepaid (aktivasi Espresso) → planId tersimpan di order", async () => {
    q1
      .mockResolvedValueOnce({ id: "tenant-1", name: "PT Contoh", activatedAt: null }) // tenant pending
      .mockResolvedValueOnce(undefined); // findPendingOrder
    q.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "ord-tp" }]);

    const order = await createOrder({
      tenantId: "tenant-1",
      userId: "user-1",
      kind: "topup",
      planId: "plan-espresso",
      creditMessages: 100,
      items: [{ type: "credit", name: "Top-up 100 pesan", quantity: 100, unitPrice: 400 }],
      payMethod: "QRIS2",
      returnUrl: "https://pintasend.test/checkout",
    });

    expect(order.planId).toBe("plan-espresso");
    expect(order.amount).toBe(40000);
    const insertSql = q.mock.calls[0][0] as string;
    expect(insertSql).toContain('INSERT INTO "Order"');
    expect(q.mock.calls[0][1]).toContain("plan-espresso");
  });

  it("topup dgn planId non-prepaid → error PLAN_INVALID", async () => {
    q1.mockResolvedValueOnce({ id: "tenant-1", name: "PT Contoh", activatedAt: null });
    await expect(
      createOrder({
        tenantId: "tenant-1",
        userId: "user-1",
        kind: "topup",
        planId: "plan-latte", // subscription — tidak valid utk topup
        creditMessages: 100,
        items: [],
        payMethod: "QRIS2",
        returnUrl: "https://pintasend.test/checkout",
      }),
    ).rejects.toThrow("PLAN_INVALID");
  });
});

describe("finalizePaidOrder", () => {
  it("first_subscription: activatedAt/planId/planPeriodEnd + upsert addon + sync D1 + audit; idempoten (2x ok)", async () => {
    // Panggilan pertama — queryOne default undefined utk SELECT tenant.
    q1.mockResolvedValueOnce({ id: "tenant-1", name: "PT Contoh", suspendedAt: null }); // SELECT tenant
    q.mockResolvedValueOnce([
      row("ord-f1", { itemsJson: JSON.stringify([{ type: "addon", refId: "random_delay", name: "Random delay", quantity: 1, unitPrice: 25000 }]) }),
    ]); // claim UPDATE ... RETURNING * (calls[0])
    q.mockResolvedValueOnce([]); // UPDATE Tenant (calls[1])
    q.mockResolvedValueOnce([]); // UPSERT TenantAddon (calls[2])

    const r1 = await finalizePaidOrder("ord-f1", { gatewayRef: "REF-GW-1", payMethod: "BRIVA0", paidAt: now.toISOString() });
    expect(r1.ok).toBe(true);

    const claimSql = q.mock.calls[0][0] as string;
    expect(claimSql).toContain("status = 'paid'");
    expect(claimSql).toContain("AND status = 'pending'");
    const tenantSql = q.mock.calls[1][0] as string;
    expect(tenantSql).toContain('UPDATE "Tenant"');
    expect(tenantSql).toContain('"activatedAt"');
    const addonSql = q.mock.calls[2][0] as string;
    expect(addonSql).toContain('INSERT INTO "TenantAddon"');
    expect(addonSql).toContain("ON CONFLICT");
    expect(syncTenantD1).toHaveBeenCalledWith(expect.objectContaining({ id: "tenant-1" }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.order.paid", targetId: "ord-f1" }));

    // Panggilan kedua (callback ganda) → status bukan pending → tidak ada efek lagi
    vi.clearAllMocks();
    (getPaymentProvider as unknown as ReturnType<typeof vi.fn>).mockReturnValue(provider);
    q.mockResolvedValueOnce([]); // claim → 0 baris
    const r2 = await finalizePaidOrder("ord-f1", { gatewayRef: "REF-GW-1" });
    expect(r2.ok).toBe(true);
    expect(q).toHaveBeenCalledTimes(1); // tidak ada efek
    expect(syncTenantD1).not.toHaveBeenCalled();
  });

  it("renewal_subscription: invoice paid + plan period diperpanjang", async () => {
    q.mockResolvedValueOnce([
      row("ord-r1", {
        kind: "renewal_subscription",
        invoiceId: "inv-1",
        planId: "plan-latte",
        periodEnd: new Date("2026-10-01T00:00:00+07:00").toISOString(),
      }),
    ]); // claim (calls[0])
    q.mockResolvedValueOnce([]); // UPDATE Tenant (calls[1])
    q.mockResolvedValueOnce([]); // UPDATE Invoice (calls[2])

    const res = await finalizePaidOrder("ord-r1", { paidAt: now.toISOString() });
    expect(res.ok).toBe(true);
    const invoiceSql = q.mock.calls[2][0] as string;
    expect(invoiceSql).toContain('UPDATE "Invoice"');
    expect(invoiceSql).toContain("status = 'issued'");
  });

  it("topup: addCredit dipanggil dengan orderId", async () => {
    q.mockResolvedValueOnce([
      row("ord-t1", { kind: "topup", creditMessages: 100, tenantId: "tenant-1" }),
    ]);
    q.mockResolvedValueOnce([{ id: "tenant-1", name: "PT Contoh", suspendedAt: null }]);

    const res = await finalizePaidOrder("ord-t1", { paidAt: now.toISOString() });
    expect(res.ok).toBe(true);
    expect(addCredit).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      messages: 100,
      orderId: "ord-t1",
      reason: "topup",
    });
  });

  it("topup pertama dgn planId: tenant pending → aktif + assign plan prepaid + sync D1", async () => {
    q.mockResolvedValueOnce([
      row("ord-t2", { kind: "topup", planId: "plan-espresso", creditMessages: 50, tenantId: "tenant-1" }),
    ]); // claim (calls[0])
    q1.mockResolvedValueOnce({
      id: "tenant-1",
      name: "PT Contoh",
      suspendedAt: null,
      activatedAt: null,
    }); // SELECT tenant
    q.mockResolvedValueOnce([{ id: "tenant-1" }]); // UPDATE aktivasi (calls[1])

    const res = await finalizePaidOrder("ord-t2", { paidAt: now.toISOString() });
    expect(res.ok).toBe(true);
    const actSql = q.mock.calls[1][0] as string;
    expect(actSql).toContain('UPDATE "Tenant"');
    expect(actSql).toContain('"activatedAt" IS NULL');
    expect(q.mock.calls[1][1]).toContain("plan-espresso");
    expect(syncTenantD1).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tenant-1", activatedAt: expect.any(String) }),
    );
    expect(addCredit).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", messages: 50 }),
    );
  });

  it("topup dgn planId tapi tenant sudah aktif → tidak assign ulang plan", async () => {
    q.mockResolvedValueOnce([
      row("ord-t3", { kind: "topup", planId: "plan-espresso", creditMessages: 50, tenantId: "tenant-1" }),
    ]); // claim
    q1.mockResolvedValueOnce({
      id: "tenant-1",
      name: "PT Contoh",
      suspendedAt: null,
      activatedAt: "2026-01-01T00:00:00Z",
    }); // SELECT tenant — sudah aktif

    const res = await finalizePaidOrder("ord-t3", { paidAt: now.toISOString() });
    expect(res.ok).toBe(true);
    expect(syncTenantD1).not.toHaveBeenCalled();
    // Hanya claim + addCredit — tidak ada UPDATE Tenant
    const updateSqls = q.mock.calls.map((c) => String(c[0]));
    expect(updateSqls.filter((s) => s.includes('UPDATE "Tenant"'))).toHaveLength(0);
    expect(addCredit).toHaveBeenCalled();
  });
});

describe("expire & mark", () => {
  it("expireStaleOrders mengembalikan jumlah yang di-expire", async () => {
    q.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    const n = await expireStaleOrders(now);
    expect(n).toBe(2);
    const sql = q.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'expired'");
    expect(sql).toContain('"expiresAt" < $1');
  });

  it("markOrderExpiredFromGateway hanya dari pending", async () => {
    q.mockResolvedValueOnce([{ id: "ord-x" }]);
    expect(await markOrderExpiredFromGateway("ord-x")).toBe(true);
    const sql = q.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'pending'");
    q.mockResolvedValueOnce([]);
    expect(await markOrderExpiredFromGateway("ord-x")).toBe(false);
  });
});

describe("getters", () => {
  it("getOrder scoped tenant; getOrderAnyScope tanpa scope", async () => {
    q1.mockResolvedValueOnce(row("o1"));
    const scoped = await getOrder("tenant-1", "o1");
    expect(scoped?.id).toBe("o1");
    expect(q1.mock.calls[0][1]).toEqual(["o1", "tenant-1"]);

    q1.mockResolvedValueOnce(row("o1"));
    const unscoped = await getOrderAnyScope("o1");
    expect(unscoped?.id).toBe("o1");
    expect(q1.mock.calls[1][1]).toEqual(["o1"]);
  });

  it("findPendingOrder: kind+ref yang sama & belum expire", async () => {
    q1.mockResolvedValueOnce(row("p1", { status: "pending" }));
    const found = await findPendingOrder({ tenantId: "tenant-1", kind: "first_subscription", planId: "plan-latte" });
    expect(found?.id).toBe("p1");
    const sql = q1.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain('"planId"');
  });

  it("listPendingGatewayOrders: hanya pending yang punya gatewayRef", async () => {
    q.mockResolvedValueOnce([row("o1", { status: "pending", gatewayRef: "REF-1" }), row("o2", { gatewayRef: "REF-2" })]);
    const found = await listPendingGatewayOrders();
    expect(found.map((o) => o.id)).toEqual(["o1", "o2"]);
    const sql = q.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain('"gatewayRef" IS NOT NULL');
  });
});

describe("periodEndForStart (pure)", () => {
  it("akhir bulan kalender WIB yang memuat tanggal mulai", () => {
    const end = periodEndForStart("2026-09-04T10:00:00Z");
    expect(end.toISOString()).toBe("2026-09-30T17:00:00.000Z"); // 2026-10-01 00:00 WIB = 2026-09-30 17:00 UTC
  });
});