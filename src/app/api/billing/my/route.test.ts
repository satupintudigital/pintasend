import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/tenantGate", () => ({ getTenantActivation: vi.fn() }));
vi.mock("@/lib/billingRenewal", () => ({ ensureCurrentPeriod: vi.fn() }));
vi.mock("@/lib/credit", () => ({ getBalance: vi.fn() }));
vi.mock("@/lib/billing", () => ({ listOrders: vi.fn() }));
vi.mock("@/lib/devices", () => ({ listDevicesForTenant: vi.fn() }));
vi.mock("@/lib/catalog", () => ({ getPublicCatalog: vi.fn() }));
vi.mock("@/lib/db", () => ({ queryOne: vi.fn() }));

import { auth } from "@/lib/auth";
import { getTenantActivation } from "@/lib/tenantGate";
import { ensureCurrentPeriod } from "@/lib/billingRenewal";
import { getBalance } from "@/lib/credit";
import { listOrders } from "@/lib/billing";
import { listDevicesForTenant } from "@/lib/devices";
import { getPublicCatalog } from "@/lib/catalog";
import { queryOne } from "@/lib/db";
import { GET } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedActivation = vi.mocked(getTenantActivation);
const mockedEnsure = vi.mocked(ensureCurrentPeriod);
const mockedBalance = vi.mocked(getBalance);
const mockedOrders = vi.mocked(listOrders);
const mockedDevices = vi.mocked(listDevicesForTenant);
const mockedCatalog = vi.mocked(getPublicCatalog);
const mockedQueryOne = vi.mocked(queryOne);

const ownerSession = {
  user: { id: "u1", email: "owner@x.id", role: "owner", tenantId: "t1" },
};
const memberSession = {
  user: { id: "u3", email: "member@x.id", role: "member", tenantId: "t1" },
};

const catalog = { plans: [], addons: [], settings: {} };

const planRow = {
  planId: "plan-latte",
  planName: "Latte",
  planKind: "subscription",
  priceMonthly: 150000,
  priceDisplay: "Rp 150.000/bulan",
  maxMessagesPerMonth: 500,
  maxDevices: 3,
  maxUsers: 5,
  activatedAt: "2026-08-01T00:00:00Z",
  suspendedAt: null,
  planAssignedAt: "2026-08-01T00:00:00Z",
  planPeriodEnd: "2026-09-30T17:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedEnsure.mockResolvedValue({ invoiceCreated: false, orderCreated: false });
  mockedBalance.mockResolvedValue(0);
  mockedOrders.mockResolvedValue([]);
  mockedDevices.mockResolvedValue([]);
  mockedCatalog.mockResolvedValue(catalog as never);
  mockedQueryOne.mockResolvedValue(planRow as never);
  mockedActivation.mockResolvedValue({
    activatedAt: "2026-08-01T00:00:00Z",
    suspendedAt: null,
    planId: "plan-latte",
    pending: false,
  } as never);
});

describe("GET /api/billing/my", () => {
  it("tanpa session → 401; member → 403", async () => {
    mockedAuth.mockResolvedValue(null as never);
    expect((await GET()).status).toBe(401);
    mockedAuth.mockResolvedValue(memberSession as never);
    expect((await GET()).status).toBe(403);
  });

  it("owner → renewal lazy dipicu & ringkasan lengkap dikembalikan", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedEnsure.mockResolvedValueOnce({ invoiceCreated: true, orderCreated: true });
    mockedBalance.mockResolvedValueOnce(120);
    mockedOrders.mockResolvedValueOnce([{ id: "o1", status: "pending" }] as never);
    mockedDevices.mockResolvedValueOnce([{ id: "d1" }, { id: "d2" }] as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      plan: { planName: string };
      balance: number;
      orders: unknown[];
      pending: boolean;
      deviceCount: number;
      renewalTriggered: boolean;
    };
    expect(mockedEnsure).toHaveBeenCalledWith("t1");
    expect(data.plan.planName).toBe("Latte");
    expect(data.balance).toBe(120);
    expect(data.orders).toHaveLength(1);
    expect(data.pending).toBe(false);
    expect(data.deviceCount).toBe(2);
    expect(data.renewalTriggered).toBe(true);
  });

  it("tenant pending (belum aktivasi) → pending true, plan tetap dari join", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedActivation.mockResolvedValueOnce({
      activatedAt: null,
      suspendedAt: null,
      planId: null,
      pending: true,
    } as never);
    mockedQueryOne.mockResolvedValueOnce(null as never); // tanpa plan
    const res = await GET();
    const data = (await res.json()) as { plan: unknown; pending: boolean };
    expect(data.pending).toBe(true);
    expect(data.plan).toBeNull();
  });
});
