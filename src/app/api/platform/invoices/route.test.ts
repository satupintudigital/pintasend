import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/platform", () => ({ listPlans: vi.fn() }));
vi.mock("@/lib/invoices", () => ({
  generateMonthlyInvoices: vi.fn(),
  listInvoices: vi.fn(),
  voidInvoice: vi.fn(),
  markInvoicePaid: vi.fn(),
  exportInvoicesCsv: vi.fn(),
}));

import { auth } from "@/lib/auth";
import {
  generateMonthlyInvoices,
  listInvoices,
  voidInvoice,
  markInvoicePaid,
  exportInvoicesCsv,
} from "@/lib/invoices";
import { GET as LIST } from "./route";
import { POST as GENERATE } from "./generate/route";
import { GET as EXPORT } from "./export/route";
import { POST as ACT } from "./[id]/route";

const mockedAuth = vi.mocked(auth);
const mockedList = vi.mocked(listInvoices);
const mockedGenerate = vi.mocked(generateMonthlyInvoices);
const mockedVoid = vi.mocked(voidInvoice);
const mockedPaid = vi.mocked(markInvoicePaid);
const mockedCsv = vi.mocked(exportInvoicesCsv);

const platformSession = {
  user: { id: "u-p", email: "platform@pintasend.test", role: "platform_admin", tenantId: "t-platform" },
};
const ownerSession = {
  user: { id: "u1", email: "owner@x.y", role: "owner", tenantId: "t1" },
};

function jsonReq(body: unknown) {
  return new Request("http://x/api/platform/invoices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("guard", () => {
  it("401/403 untuk akses non-platform", async () => {
    const req = new Request("http://x/api/platform/invoices");
    mockedAuth.mockResolvedValue(null as never);
    expect((await LIST(req)).status).toBe(401);
    mockedAuth.mockResolvedValue(ownerSession as never);
    expect((await LIST(req)).status).toBe(403);
  });
});

describe("GET /api/platform/invoices (list)", () => {
  it("200 — filter diteruskan ke service", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedList.mockResolvedValue({ invoices: [], total: 0 });
    const res = await LIST(
      new Request("http://x/api/platform/invoices?status=issued&page=1&limit=20"),
    );
    expect(res.status).toBe(200);
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({ status: "issued", page: 1, limit: 20 }),
    );
  });
});

describe("POST /api/platform/invoices/generate", () => {
  it("201 generate periode valid", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedGenerate.mockResolvedValue({ created: 3, skipped: 1 });
    const res = await GENERATE(jsonReq({ year: 2026, month: 9 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(3);
  });

  it("400 periode tidak valid", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    const res = await GENERATE(jsonReq({ year: 2026, month: 13 }));
    expect(res.status).toBe(400);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });
});

describe("POST /api/platform/invoices/[id] (void/mark_paid)", () => {
  it("void & mark_paid delegasi ke service", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedVoid.mockResolvedValue({ ok: true });
    mockedPaid.mockResolvedValue({ ok: true });
    const params = { params: Promise.resolve({ id: "i1" }) };
    expect((await ACT(jsonReq({ action: "void" }), params)).status).toBe(200);
    expect(mockedVoid).toHaveBeenCalledWith("i1");
    expect((await ACT(jsonReq({ action: "mark_paid" }), params)).status).toBe(200);
    expect(mockedPaid).toHaveBeenCalledWith("i1");
  });

  it("action tak dikenal → 400", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    const params = { params: Promise.resolve({ id: "i1" }) };
    expect((await ACT(jsonReq({ action: "hapus" }), params)).status).toBe(400);
  });
});

describe("GET /api/platform/invoices/export", () => {
  it("200 CSV", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedList.mockResolvedValue({ invoices: [], total: 0 });
    mockedCsv.mockReturnValue("periodeStart,tenantId\n");
    const res = await EXPORT(new Request("http://x/api/platform/invoices/export"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("periodeStart");
  });
});
