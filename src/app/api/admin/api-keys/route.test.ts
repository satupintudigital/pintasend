import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/authStore", () => ({
  createApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  clientIp: () => "127.0.0.1",
  rateLimitResponse: () => Response.json({ error: "rate limited" }, { status: 429 }),
}));
vi.mock("@/lib/audit", () => ({ recordAuditFromSession: vi.fn() }));

import { auth } from "@/lib/auth";
import { createApiKey, revokeApiKey } from "@/lib/authStore";
import { recordAuditFromSession } from "@/lib/audit";
import { POST } from "./route";
import { DELETE } from "./[id]/route";

const mockedAuth = vi.mocked(auth);
const mockedCreate = vi.mocked(createApiKey);
const mockedRevoke = vi.mocked(revokeApiKey);
const mockedAudit = vi.mocked(recordAuditFromSession);

const ownerSession = {
  user: { id: "u1", email: "owner@x.y", name: "Owner", role: "owner", tenantId: "t1" },
};

beforeEach(() => vi.clearAllMocks());

describe("POST /api/admin/api-keys — audit apikey.create", () => {
  it("201 & audit dicatat dgn tenantId sesi", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedCreate.mockResolvedValue({
      id: "k1",
      key: "pintasend_xxx",
      label: "Prod",
      tenantId: "t1",
    } as never);
    const req = new Request("http://x/api/admin/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Prod" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockedAudit).toHaveBeenCalledWith(
      ownerSession,
      expect.objectContaining({ action: "apikey.create", tenantId: "t1", targetType: "apikey", targetId: "k1" }),
    );
  });
});

describe("DELETE /api/admin/api-keys/[id] — audit apikey.revoke", () => {
  it("200 & audit dicatat", async () => {
    mockedAuth.mockResolvedValue(ownerSession as never);
    mockedRevoke.mockResolvedValue({ revoked: true, d1Ok: true } as never);
    const res = await DELETE(new Request("http://x/api/admin/api-keys/k1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "k1" }),
    });
    expect(res.status).toBe(200);
    expect(mockedAudit).toHaveBeenCalledWith(
      ownerSession,
      expect.objectContaining({ action: "apikey.revoke", tenantId: "t1", targetId: "k1" }),
    );
  });
});
