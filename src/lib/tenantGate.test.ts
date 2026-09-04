import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTenantActivation, assertTenantCanOperate, isPendingTenantActivation } from "./tenantGate";
import { queryOne } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async () => undefined),
}));

const q1 = queryOne as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("tenantGate", () => {
  it("pending = activatedAt null", () => {
    expect(isPendingTenantActivation({ activatedAt: null })).toBe(true);
    expect(isPendingTenantActivation({ activatedAt: "2026-01-01" })).toBe(false);
  });

  it("getTenantActivation: baris kosong → pending", async () => {
    q1.mockResolvedValueOnce(undefined);
    const a = await getTenantActivation("t1");
    expect(a.pending).toBe(true);
    expect(a.activatedAt).toBeNull();
  });

  it("assertTenantCanOperate: aktif → ok; pending → TENANT_PENDING; suspended → TENANT_SUSPENDED", async () => {
    q1.mockResolvedValueOnce({ activatedAt: "2026-01-01T00:00:00.000Z", suspendedAt: null, planId: "p1" });
    expect(await assertTenantCanOperate("t1")).toEqual({ ok: true });

    q1.mockResolvedValueOnce({ activatedAt: null, suspendedAt: null, planId: null });
    const pending = await assertTenantCanOperate("t1");
    expect(pending.ok).toBe(false);
    if (!pending.ok) expect(pending.code).toBe("TENANT_PENDING");

    q1.mockResolvedValueOnce({ activatedAt: "2026-01-01T00:00:00.000Z", suspendedAt: "2026-08-01T00:00:00.000Z", planId: "p1" });
    const suspended = await assertTenantCanOperate("t1");
    expect(suspended.ok).toBe(false);
    if (!suspended.ok) expect(suspended.code).toBe("TENANT_SUSPENDED");
  });
});