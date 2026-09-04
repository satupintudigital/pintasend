import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateMonthlyInvoices,
  listInvoices,
  voidInvoice,
  markInvoicePaid,
  exportInvoicesCsv,
  INVOICE_CSV_HEADER,
} from "./invoices";
import { query } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));

const q = query as unknown as ReturnType<typeof vi.fn>;

const tenantRows = [
  { id: "t1", planId: "p1", planName: "Pro", priceMonthly: 150000 },
  { id: "t2", planId: "p2", planName: "Gratis", priceMonthly: null },
  { id: "t3", planId: "p1", planName: "Pro", priceMonthly: 150000 },
];

const invRow = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  tenantId: "t1",
  tenantName: "Toko A",
  planId: "p1",
  planName: "Pro",
  priceMonthly: 150000,
  periodStart: "2026-09-01T00:00:00.000Z",
  periodEnd: "2026-09-30T00:00:00.000Z",
  status: "issued",
  paidAt: null,
  createdAt: "2026-09-04T00:00:00.000Z",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default query → [] ; test memakai mockResolvedValueOnce untuk urutan.
  q.mockReset();
  q.mockImplementation(async () => []);
});

describe("generateMonthlyInvoices", () => {
  it("membuat invoice per tenant ber-plan (skip tenant tanpa plan / suspended / duplikat)", async () => {
    // Query 1: tenant ber-plan & aktif (sudah exclude suspended).
    q.mockResolvedValueOnce(tenantRows);
    // Query 2: invoice existing bulan tsb (deteksi duplikat) → t2 sudah punya.
    q.mockResolvedValueOnce([{ tenantId: "t2" }]);

    const res = await generateMonthlyInvoices(2026, 9);
    expect(res.created).toBe(2); // t1 & t3 (t2 sudah punya invoice)
    expect(res.skipped).toBe(1);

    const insertCall = q.mock.calls.find((c) => (c[0] as string).includes('INSERT INTO "Invoice"'));
    expect(insertCall).toBeTruthy();
    // Insert menyertakan snapshot planName + priceMonthly (t1 & t3).
    const inserted = JSON.stringify(insertCall?.[1]);
    expect(inserted).toContain("150000");
    expect(inserted).toContain("Pro");
  });

  it("tidak ada tenant ber-plan → created 0", async () => {
    q.mockResolvedValueOnce([]);
    q.mockResolvedValueOnce([]);
    const res = await generateMonthlyInvoices(2026, 9);
    expect(res).toEqual({ created: 0, skipped: 0 });
  });
});

describe("listInvoices", () => {
  it("filter + pagination diteruskan", async () => {
    q.mockResolvedValueOnce([{ count: 1 }]);
    q.mockResolvedValueOnce([invRow()]);
    const res = await listInvoices({ status: "issued", page: 1, limit: 20 });
    expect(res.total).toBe(1);
    expect(res.invoices[0].tenantName).toBe("Toko A");
    const countSql = q.mock.calls[0][0] as string;
    expect(countSql).toContain("status");
  });
});

describe("voidInvoice / markInvoicePaid", () => {
  it("void issued → ok", async () => {
    q.mockResolvedValueOnce([{ id: "i1" }]);
    const res = await voidInvoice("i1");
    expect(res.ok).toBe(true);
    expect((q.mock.calls[0][0] as string)).toContain("void");
  });

  it("mark paid issued → ok; void paid → ditolak", async () => {
    q.mockResolvedValueOnce([{ id: "i1" }]);
    const res = await markInvoicePaid("i1");
    expect(res.ok).toBe(true);

    q.mockResolvedValueOnce([]);
    const bad = await markInvoicePaid("i-paid");
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBeTruthy();
  });
});

describe("exportInvoicesCsv", () => {
  it("header + escape koma/quote", () => {
    const csv = exportInvoicesCsv([invRow({ tenantName: 'A, "Toko"' })]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(INVOICE_CSV_HEADER);
    expect(lines[1]).toContain('"A, ""Toko"""');
  });
});
