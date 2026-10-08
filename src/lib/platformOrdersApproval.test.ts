import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/billing", () => ({
  finalizePaidOrder: vi.fn(),
  getOrderAnyScope: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ recordAuditFromSession: vi.fn() }));
vi.mock("@/lib/platform", () => ({ listPlatformOrders: vi.fn() }));

import { auth } from "@/lib/auth";
import { finalizePaidOrder, getOrderAnyScope } from "@/lib/billing";
import { recordAuditFromSession } from "@/lib/audit";
import { listPlatformOrders } from "@/lib/platform";
import { POST as markPaidPost } from "@/app/api/platform/orders/[id]/mark-paid/route";
import { GET as exportGet } from "@/app/api/platform/orders/export/route";

const mockedAuth = vi.mocked(auth);
const mockedFinalize = vi.mocked(finalizePaidOrder);
const mockedGetOrderAny = vi.mocked(getOrderAnyScope);
const mockedAudit = vi.mocked(recordAuditFromSession);
const mockedListOrders = vi.mocked(listPlatformOrders);

const adminSession = {
  user: { id: "u-admin", email: "admin@pintasend.test", role: "platform_admin", tenantId: "t-platform" },
};
const ownerSession = {
  user: { id: "u-owner", email: "owner@tenant.test", role: "owner", tenantId: "t-tenant" },
};

const sampleOrder = {
  id: "order-123",
  tenantId: "t-tenant",
  tenantName: "Tenant Test",
  kind: "first_subscription",
  status: "pending",
  amount: 150000,
  payMethod: null,
  createdAt: new Date().toISOString(),
  paidAt: null,
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

beforeEach(() => vi.clearAllMocks());

describe("platformOrdersApproval", () => {
  describe("POST /api/platform/orders/[id]/mark-paid", () => {
    it("menolak akses tanpa session (401)", async () => {
      mockedAuth.mockResolvedValueOnce(null as never);
      const res = await markPaidPost(new Request("http://x/api/platform/orders/order-123/mark-paid"), {
        params: Promise.resolve({ id: "order-123" }),
      });
      expect(res.status).toBe(401);
    });

    it("menolak non-platform_admin (403)", async () => {
      mockedAuth.mockResolvedValueOnce(ownerSession as never);
      const res = await markPaidPost(new Request("http://x/api/platform/orders/order-123/mark-paid"), {
        params: Promise.resolve({ id: "order-123" }),
      });
      expect(res.status).toBe(403);
    });

    it("mengembalikan 404 jika order tidak ditemukan", async () => {
      mockedAuth.mockResolvedValueOnce(adminSession as never);
      mockedGetOrderAny.mockResolvedValueOnce(null as never);
      const res = await markPaidPost(new Request("http://x/api/platform/orders/order-123/mark-paid"), {
        params: Promise.resolve({ id: "order-123" }),
      });
      expect(res.status).toBe(404);
    });

    it("mengembalikan 409 jika status bukan pending", async () => {
      mockedAuth.mockResolvedValueOnce(adminSession as never);
      mockedGetOrderAny.mockResolvedValueOnce({ ...sampleOrder, status: "paid" } as never);
      const res = await markPaidPost(new Request("http://x/api/platform/orders/order-123/mark-paid"), {
        params: Promise.resolve({ id: "order-123" }),
      });
      expect(res.status).toBe(409);
    });

    it("berhasil memfinalisasi order pending dan mencatat audit log", async () => {
      mockedAuth.mockResolvedValueOnce(adminSession as never);
      mockedGetOrderAny.mockResolvedValueOnce(sampleOrder as never);
      mockedFinalize.mockResolvedValueOnce({ ok: true, order: { ...sampleOrder, status: "paid" } } as never);

      const res = await markPaidPost(new Request("http://x/api/platform/orders/order-123/mark-paid"), {
        params: Promise.resolve({ id: "order-123" }),
      });

      expect(res.status).toBe(200);
      const d = await res.json();
      expect(d.ok).toBe(true);
      expect(mockedFinalize).toHaveBeenCalledWith(
        "order-123",
        expect.objectContaining({ payMethod: "manual_admin" }),
        expect.any(Object),
      );
      expect(mockedAudit).toHaveBeenCalledWith(
        adminSession,
        expect.objectContaining({ action: "order.manual_mark_paid", targetId: "order-123" }),
      );
    });
  });

  describe("GET /api/platform/orders/export", () => {
    it("menolak akses non-admin (403)", async () => {
      mockedAuth.mockResolvedValueOnce(ownerSession as never);
      const res = await exportGet(new Request("http://x/api/platform/orders/export"));
      expect(res.status).toBe(403);
    });

    it("mengembalikan CSV valid dgn header text/csv", async () => {
      mockedAuth.mockResolvedValueOnce(adminSession as never);
      mockedListOrders.mockResolvedValueOnce([sampleOrder] as never);

      const res = await exportGet(new Request("http://x/api/platform/orders/export"));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/csv");
      expect(res.headers.get("Content-Disposition")).toContain("attachment; filename=");

      const csvText = await res.text();
      expect(csvText).toContain("ID Order,ID Tenant,Nama Tenant,Jenis,Status,Jumlah (Rp),Metode Bayar,Dibuat Pada,Dibayar Pada,Kedaluwarsa Pada");
      expect(csvText).toContain("order-123");
      expect(csvText).toContain("Tenant Test");
    });
  });
});
