import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DEFAULT_MESSAGE_RETENTION_DAYS,
  MAX_MESSAGE_RETENTION_DAYS,
  createRetentionRequest,
  getTenantRetentionDays,
  approveRetentionRequest,
  rejectRetentionRequest,
  listRetentionRequests,
  hasPendingRetentionRequest,
} from "./retention";

// Mock DB (Neon) — pola authStore.test / webhookDelivery.test.
const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => queryMock(...args),
  // queryOne = queryMock yang mengambil baris pertama (pola authStore.test)
  queryOne: async (...args: unknown[]) => {
    const rows = await queryMock(...args);
    return Array.isArray(rows) ? rows[0] : undefined;
  },
}));

type QueryCall = [string, unknown[]];

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue([]);
});

describe("getTenantRetentionDays — nilai efektif retensi tenant", () => {
  it("nilai tersimpan dipakai apa adanya", async () => {
    queryMock.mockResolvedValue([{ days: 90 }]);
    expect(await getTenantRetentionDays("t1")).toBe(90);
    const [sql, args] = queryMock.mock.calls[0] as QueryCall;
    expect(sql).toContain('"messageRetentionDays"');
    expect(args).toContain("t1");
  });

  it("NULL / 0 / negatif → fallback default 30", async () => {
    queryMock.mockResolvedValue([{ days: null }]);
    expect(await getTenantRetentionDays("t1")).toBe(DEFAULT_MESSAGE_RETENTION_DAYS);

    queryMock.mockResolvedValue([{ days: 0 }]);
    expect(await getTenantRetentionDays("t1")).toBe(DEFAULT_MESSAGE_RETENTION_DAYS);

    queryMock.mockResolvedValue([{ days: -5 }]);
    expect(await getTenantRetentionDays("t1")).toBe(DEFAULT_MESSAGE_RETENTION_DAYS);
  });

  it("tenant tidak ditemukan → default 30", async () => {
    queryMock.mockResolvedValue([]);
    expect(await getTenantRetentionDays("none")).toBe(DEFAULT_MESSAGE_RETENTION_DAYS);
  });
});

describe("listRetentionRequests — daftar permintaan tenant", () => {
  it("query memfilter tenantId & urut createdAt DESC", async () => {
    await listRetentionRequests("t1");
    const [sql, args] = queryMock.mock.calls[0] as QueryCall;
    expect(sql).toContain('FROM "RetentionRequest"');
    expect(sql).toContain('"tenantId" = $1');
    expect(sql).toContain('ORDER BY "createdAt" DESC');
    expect(args).toContain("t1");
  });
});

describe("hasPendingRetentionRequest — guard anti-spam pending", () => {
  it("ada baris pending → true", async () => {
    queryMock.mockResolvedValue([{ id: "r1" }]);
    expect(await hasPendingRetentionRequest("t1")).toBe(true);
    const [sql, args] = queryMock.mock.calls[0] as QueryCall;
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain("LIMIT 1");
    expect(args).toContain("t1");
  });

  it("tidak ada pending → false", async () => {
    queryMock.mockResolvedValue([]);
    expect(await hasPendingRetentionRequest("t1")).toBe(false);
  });
});

describe("createRetentionRequest — catat instruksi tertulis (status pending)", () => {
  it("insert dengan status pending", async () => {
    queryMock.mockResolvedValue([
      {
        id: "r1",
        tenantId: "t1",
        requestedBy: "owner@toko.example.com",
        reason: "Arsip 6 bulan sesuai kontrak",
        retentionDays: 180,
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        createdAt: "2026-08-21T00:00:00.000Z",
        updatedAt: "2026-08-21T00:00:00.000Z",
      },
    ]);

    const row = await createRetentionRequest({
      tenantId: "t1",
      requestedBy: "owner@toko.example.com",
      reason: "Arsip 6 bulan sesuai kontrak",
      retentionDays: 180,
    });

    expect(row.status).toBe("pending");
    const [sql, args] = queryMock.mock.calls[0] as QueryCall;
    expect(sql).toContain('INSERT INTO "RetentionRequest"');
    expect(sql).toContain("'pending'");
    expect(args).toContain("t1");
    expect(args).toContain("owner@toko.example.com");
    expect(args).toContain(180);
  });
});

describe("approveRetentionRequest — setujui & terapkan ke tenant", () => {
  it("pending → update Tenant.messageRetentionDays + tandai approved", async () => {
    // queryOne (SELECT status) → pending
    queryMock
      .mockResolvedValueOnce([{ id: "r1", tenantId: "t1", retentionDays: 180, status: "pending" }])
      .mockResolvedValueOnce([{ id: "t1" }]) // UPDATE Tenant
      .mockResolvedValueOnce([{ id: "r1" }]); // UPDATE RetentionRequest

    const result = await approveRetentionRequest("r1", "admin@satupintudigital.co.id");
    expect(result).toEqual({ ok: true });

    const updateTenant = queryMock.mock.calls[1] as QueryCall;
    expect(updateTenant[0]).toContain('UPDATE "Tenant" SET "messageRetentionDays"');
    expect(updateTenant[1]).toContain(180);

    const updateReq = queryMock.mock.calls[2] as QueryCall;
    expect(updateReq[0]).toContain("'approved'");
    expect(updateReq[0]).toContain('"approvedBy"');
    expect(updateReq[1]).toContain("admin@satupintudigital.co.id");
  });

  it("bukan pending → ditolak, tidak mengubah tenant", async () => {
    queryMock.mockResolvedValueOnce([{ id: "r1", tenantId: "t1", retentionDays: 180, status: "approved" }]);

    const result = await approveRetentionRequest("r1", "admin@x.id");
    expect(result.ok).toBe(false);
    expect(queryMock).toHaveBeenCalledTimes(1); // hanya SELECT, tanpa UPDATE
  });

  it("melebihi MAX → ditolak tanpa mengubah tenant", async () => {
    queryMock.mockResolvedValueOnce([
      { id: "r1", tenantId: "t1", retentionDays: MAX_MESSAGE_RETENTION_DAYS + 1, status: "pending" },
    ]);

    const result = await approveRetentionRequest("r1", "admin@x.id");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Maks");
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});

describe("rejectRetentionRequest — tolak permintaan", () => {
  it("pending → tandai rejected", async () => {
    queryMock
      .mockResolvedValueOnce([{ id: "r1", status: "pending" }])
      .mockResolvedValueOnce([{ id: "r1" }]);

    const result = await rejectRetentionRequest("r1", "admin@x.id");
    expect(result).toEqual({ ok: true });

    const [sql, args] = queryMock.mock.calls[1] as QueryCall;
    expect(sql).toContain("'rejected'");
    expect(sql).toContain('"rejectedBy"');
    expect(args).toContain("admin@x.id");
  });

  it("bukan pending → ditolak", async () => {
    queryMock.mockResolvedValueOnce([{ id: "r1", status: "approved" }]);
    const result = await rejectRetentionRequest("r1", "admin@x.id");
    expect(result.ok).toBe(false);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("tidak ditemukan → error", async () => {
    queryMock.mockResolvedValue([]);
    const result = await rejectRetentionRequest("missing", "admin@x.id");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("tidak ditemukan");
  });
});
