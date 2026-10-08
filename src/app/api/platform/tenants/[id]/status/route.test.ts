import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/tenantStore", () => ({ setTenantSuspended: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAuditFromSession: vi.fn() }));

import { auth } from "@/lib/auth";
import { setTenantSuspended } from "@/lib/tenantStore";
import { recordAuditFromSession } from "@/lib/audit";
import { POST } from "./route";

const mockedAuth = vi.mocked(auth);
const mockedSuspend = vi.mocked(setTenantSuspended);
const mockedAudit = vi.mocked(recordAuditFromSession);

const platformSession = {
  user: { id: "u-p", email: "platform@pintasend.test", role: "platform_admin", tenantId: "t-platform" },
};

const params = { params: Promise.resolve({ id: "t1" }) };

function jsonReq(action: string) {
  return new Request("http://x/api/platform/tenants/t1/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("POST status tenant — instrumentasi audit", () => {
  it("suspend → tenant.suspend dengan tenantId target", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedSuspend.mockResolvedValue({ updated: true, d1Ok: true } as never);
    const res = await POST(jsonReq("suspend"), params);
    expect(res.status).toBe(200);
    expect(mockedAudit).toHaveBeenCalledWith(
      platformSession,
      expect.objectContaining({ action: "tenant.suspend", tenantId: "t1", targetType: "tenant", targetId: "t1" }),
    );
  });

  it("activate → tenant.activate", async () => {
    mockedAuth.mockResolvedValue(platformSession as never);
    mockedSuspend.mockResolvedValue({ updated: true, d1Ok: true } as never);
    await POST(jsonReq("activate"), params);
    expect(mockedAudit).toHaveBeenCalledWith(
      platformSession,
      expect.objectContaining({ action: "tenant.activate" }),
    );
  });

  it("tetap 403 untuk non-platform admin tanpa audit", async () => {
    mockedAuth.mockResolvedValue({
      user: { id: "u1", email: "owner@x.y", role: "owner", tenantId: "t1" },
    } as never);
    const res = await POST(jsonReq("suspend"), params);
    expect(res.status).toBe(403);
    expect(mockedAudit).not.toHaveBeenCalled();
  });
});
