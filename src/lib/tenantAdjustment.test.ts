import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: vi.fn(), queryOne: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAuditFromSession: vi.fn() }));
vi.mock("@/lib/credit", () => ({ addCredit: vi.fn() }));

import { auth } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { addCredit } from "@/lib/credit";
import { recordAuditFromSession } from "@/lib/audit";
import { POST as POST_ADJUST } from "@/app/api/platform/tenants/[id]/adjust-credit/route";
import { POST as POST_EXTEND } from "@/app/api/platform/tenants/[id]/extend-period/route";

const mockedAuth = vi.mocked(auth);
const mockedQueryOne = vi.mocked(queryOne);
const mockedAddCredit = vi.mocked(addCredit);
const mockedAudit = vi.mocked(recordAuditFromSession);

const platformSession = {
  user: { id: "u-admin", email: "admin@pintasend.test", role: "platform_admin", tenantId: "t-platform" },
};
const ownerSession = {
  user: { id: "u-owner", email: "owner@tenant.test", role: "owner", tenantId: "t1" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Tenant Adjustment Endpoints", () => {
  describe("POST /api/platform/tenants/[id]/adjust-credit", () => {
    it("menolak non-platform_admin dengan 403", async () => {
      mockedAuth.mockResolvedValue(ownerSession as never);
      const req = new Request("http://localhost/api/platform/tenants/t1/adjust-credit", {
        method: "POST",
        body: JSON.stringify({ amount: 100 }),
      });
      const res = await POST_ADJUST(req, { params: Promise.resolve({ id: "t1" }) });
      expect(res.status).toBe(403);
      expect(mockedAddCredit).not.toHaveBeenCalled();
    });

    it("menolak body invalid (amount 0 atau non-integer)", async () => {
      mockedAuth.mockResolvedValue(platformSession as never);
      const req = new Request("http://localhost/api/platform/tenants/t1/adjust-credit", {
        method: "POST",
        body: JSON.stringify({ amount: 0 }),
      });
      const res = await POST_ADJUST(req, { params: Promise.resolve({ id: "t1" }) });
      expect(res.status).toBe(400);
    });

    it("berhasil menyesuaikan kredit dan mencatat audit log", async () => {
      mockedAuth.mockResolvedValue(platformSession as never);
      mockedQueryOne.mockResolvedValueOnce({ id: "t1" } as never); // tenant check
      mockedQueryOne.mockResolvedValueOnce({ id: "o1" } as never); // order insert
      mockedAddCredit.mockResolvedValueOnce(500);

      const req = new Request("http://localhost/api/platform/tenants/t1/adjust-credit", {
        method: "POST",
        body: JSON.stringify({ amount: 100, reason: "bonus" }),
      });
      const res = await POST_ADJUST(req, { params: Promise.resolve({ id: "t1" }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, newBalance: 500 });
      expect(mockedAddCredit).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "t1", messages: 100, reason: "bonus" }),
      );
      expect(mockedAudit).toHaveBeenCalledWith(
        platformSession,
        expect.objectContaining({ tenantId: "t1", action: "tenant.adjust_credit" }),
      );
    });
  });

  describe("POST /api/platform/tenants/[id]/extend-period", () => {
    it("menolak non-platform_admin dengan 403", async () => {
      mockedAuth.mockResolvedValue(ownerSession as never);
      const req = new Request("http://localhost/api/platform/tenants/t1/extend-period", {
        method: "POST",
        body: JSON.stringify({ days: 30 }),
      });
      const res = await POST_EXTEND(req, { params: Promise.resolve({ id: "t1" }) });
      expect(res.status).toBe(403);
    });

    it("menolak days <= 0", async () => {
      mockedAuth.mockResolvedValue(platformSession as never);
      const req = new Request("http://localhost/api/platform/tenants/t1/extend-period", {
        method: "POST",
        body: JSON.stringify({ days: -5 }),
      });
      const res = await POST_EXTEND(req, { params: Promise.resolve({ id: "t1" }) });
      expect(res.status).toBe(400);
    });

    it("berhasil memperpanjang masa aktif tenant dan mencatat audit", async () => {
      mockedAuth.mockResolvedValue(platformSession as never);
      const futureIso = "2026-11-08T00:00:00.000Z";
      mockedQueryOne.mockResolvedValueOnce({ planPeriodEnd: futureIso } as never);

      const req = new Request("http://localhost/api/platform/tenants/t1/extend-period", {
        method: "POST",
        body: JSON.stringify({ days: 30, reason: "support compensation" }),
      });
      const res = await POST_EXTEND(req, { params: Promise.resolve({ id: "t1" }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, planPeriodEnd: futureIso });
      expect(mockedAudit).toHaveBeenCalledWith(
        platformSession,
        expect.objectContaining({ tenantId: "t1", action: "tenant.extend_period" }),
      );
    });
  });
});
